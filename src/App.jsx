import { useState, useEffect } from 'react';
import { Settings, Upload, Download, GripVertical, Trash2, Search, Edit3, Github, Lock, LogOut, Eye, EyeOff, Link, Copy, Check } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

function loadRules() {
  const saved = localStorage.getItem('channelManagerRules');
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { }
  }
  return { items: {}, order: [], groupsOrder: [] };
}

function saveRules(rules) {
  localStorage.setItem('channelManagerRules', JSON.stringify(rules));
}

function parseM3U(content) {
  const lines = content.split('\n');
  const channels = [];
  let currentChannel = null;

  lines.forEach((line) => {
    const l = line.trim();
    if (l.startsWith('#EXTINF:')) {
      const tvgLogoMatch = l.match(/tvg-logo="([^"]*)"/);
      const groupTitleMatch = l.match(/group-title="([^"]*)"/);
      const parts = l.split(',');
      const originalName = parts.length > 1 ? parts[1].trim() : 'Unknown Channel';

      currentChannel = {
        id: Math.random().toString(36).substr(2, 9),
        rawExtInf: l,
        originalName,
        name: originalName,
        logo: tvgLogoMatch ? tvgLogoMatch[1] : '',
        group: groupTitleMatch ? groupTitleMatch[1] : '',
        url: ''
      };
    } else if (l && !l.startsWith('#')) {
      if (currentChannel) {
        currentChannel.url = l;
        channels.push(currentChannel);
        currentChannel = null;
      }
    }
  });
  return channels;
}

function applyRules(parsedChannels, rules) {
  let mapped = parsedChannels.map(ch => {
    const r = rules.items[ch.originalName];
    if (r) {
      return {
        ...ch,
        name: r.name !== undefined ? r.name : ch.name,
        group: r.group !== undefined ? r.group : ch.group,
        logo: r.logo !== undefined ? r.logo : ch.logo,
        url: r.url !== undefined ? r.url : ch.url,
        disabled: r.hidden || false
      };
    }
    return ch;
  });

  if (rules.order && rules.order.length > 0) {
    const orderMap = {};
    rules.order.forEach((orig, idx) => { orderMap[orig] = idx; });

    mapped.sort((a, b) => {
      const idxA = orderMap[a.originalName] !== undefined ? orderMap[a.originalName] : 999999;
      const idxB = orderMap[b.originalName] !== undefined ? orderMap[b.originalName] : 999999;
      return idxA - idxB;
    });
  }
  return mapped;
}

function generateM3U(channels) {
  let output = '#EXTM3U\n';
  channels.forEach(ch => {
    if (ch.disabled) return;
    output += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.name}\n${ch.url}\n`;
  });
  return output;
}

const PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'admin';
const PROXY_URL = 'https://script.google.com/macros/s/AKfycbybNHpTwVofPgSEg2I433cDmHbB7Nl1azrA5Xtt1OWPSaeXJkoRZl3pU0LFSiof49U_/exec';
const GITHUB_REPO_URLS = [
  { name: 'Live', path: 'lista.m3u', url: `${PROXY_URL}?repo=LiveTvPremium&path=lista.m3u` },
  { name: 'Film', path: 'film.m3u', url: `${PROXY_URL}?repo=LiveTvPremium&path=film.m3u` },
  { name: 'Serie', path: 'serie.m3u', url: `${PROXY_URL}?repo=LiveTvPremium&path=serie.m3u` },
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const [channels, setChannels] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [currentFile, setCurrentFile] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [rules, setRules] = useState(loadRules());
  const [selectedIds, setSelectedIds] = useState([]);
  const [useProxyForLinks, setUseProxyForLinks] = useState(false);
  const [copiedType, setCopiedType] = useState(null);

  // Basic login
  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('auth', 'true');
    } else {
      alert('Password errata!');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('auth');
    setChannels([]);
  };

  const copyToClipboard = (type) => {
    const baseUrl = PROXY_URL + "?repo=LiveTvAPI&branch=main&path=";
    const filename = type === 'Live' ? 'data/live/channels.json' : type === 'Film' ? 'data/film/channels.json' : 'data/series/channels.json';
    let url = baseUrl + filename;

    if (useProxyForLinks) {
      url = `https://eproxy.rrinformatica.cloud/proxy/manifest.m3u8?url=${encodeURIComponent(url)}`;
    }

    navigator.clipboard.writeText(url);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  useEffect(() => {
    if (sessionStorage.getItem('auth') === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const parsed = parseM3U(content);
      const applied = applyRules(parsed, rules);
      setChannels(applied);
      setCurrentFile(null);
    };
    reader.readAsText(file);
  };

  const handleGitHubImport = async (repoInfo) => {
    setIsLoading(true);
    try {
      // 1. Fetch the M3U content
      const m3uRes = await fetch(repoInfo.url + '?t=' + new Date().getTime());
      if (!m3uRes.ok) throw new Error(`HTTP ${m3uRes.status} - Impossibile scaricare la playlist`);
      const text = await m3uRes.text();

      // 2. Try to fetch user_rules.json from the same repo (master branch)
      let githubRules = rules;
      try {
        const rulesUrl = `${PROXY_URL}?repo=LiveTvPremium&path=user_rules.json`;
        const rulesRes = await fetch(rulesUrl + '&t=' + new Date().getTime());
        if (rulesRes.ok) {
          githubRules = await rulesRes.json();
          setRules(githubRules);
          saveRules(githubRules); // Update localStorage too
        }
      } catch (e) {
        console.log("Nessun file user_rules.json trovato su GitHub, uso le regole locali.");
      }

      const parsed = parseM3U(text);
      const applied = applyRules(parsed, githubRules);
      setChannels(applied);
      setCurrentFile(repoInfo.path);
      setActiveTab('All'); // Reset tab to see all
    } catch (err) {
      alert('Errore durante il download da GitHub: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubExport = async () => {
    if (!currentFile) return;

    setIsExporting(true);
    try {
      const saveToGithub = async (filePath, content, message) => {
        // Call our serverless proxy (SHA lookup is handled internally)
        const res = await fetch('/api/save-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: filePath,
            content: btoa(unescape(encodeURIComponent(content))),
            message: message
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Errore durante il salvataggio di ${filePath}`);
        return data;
      };

      // --- 1. Save the M3U Playlist ---
      await saveToGithub(currentFile, generateM3U(channels), `Update ${currentFile} via Web App`);

      // --- 2. Save user_rules.json ---
      await saveToGithub('user_rules.json', JSON.stringify(rules, null, 2), `Update user_rules.json via Web App`);

      alert(`Perfetto! Le modifiche e le regole sono state salvate con successo sulla repository.`);
    } catch (err) {
      alert(`Errore: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = () => {
    const content = generateM3U(channels);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playlist_edited.m3u';
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateRule = (originalName, updates) => {
    setRules(prev => {
      const newRules = { ...prev };
      newRules.items = { ...newRules.items };
      newRules.items[originalName] = { ...(newRules.items[originalName] || {}), ...updates };
      saveRules(newRules);
      return newRules;
    });
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;

    // Handle Groups dragging
    if (result.type === 'GROUP') {
      const groupsRaw = [...new Set(channels.map(c => c.group))].filter(Boolean);
      const currentGroupsOrdered = rules.groupsOrder && rules.groupsOrder.length > 0
        ? [...new Set([...rules.groupsOrder.filter(g => groupsRaw.includes(g)), ...groupsRaw])]
        : groupsRaw;

      const newGroupsOrder = Array.from(currentGroupsOrdered);
      const [reorderedGroup] = newGroupsOrder.splice(result.source.index, 1);
      newGroupsOrder.splice(result.destination.index, 0, reorderedGroup);

      setRules(prev => {
        const newRules = { ...prev, groupsOrder: newGroupsOrder };
        saveRules(newRules);
        return newRules;
      });
      return;
    }

    // Handle Channels dragging
    const items = Array.from(channels);
    const visibleItems = Array.from(filteredChannels);

    const movedItem = visibleItems[result.source.index];
    const targetItem = visibleItems[result.destination.index];

    if (!movedItem || !targetItem) return;

    // Find indices in master
    const fromIndexMaster = items.findIndex(c => c.id === movedItem.id);
    const [reorderedItem] = items.splice(fromIndexMaster, 1);

    // Re-find target index in spliced master
    const toIndexMaster = items.findIndex(c => c.id === targetItem.id);

    // Insert based on relative movement in visible list
    if (result.destination.index > result.source.index) {
      items.splice(toIndexMaster + 1, 0, reorderedItem);
    } else {
      items.splice(toIndexMaster, 0, reorderedItem);
    }

    setChannels(items);

    // Save new channel order to rules
    setRules(prev => {
      const newRules = { ...prev, order: items.map(c => c.originalName) };
      saveRules(newRules);
      return newRules;
    });
  };

  const updateChannel = (id, field, value) => {
    let origName = null;
    setChannels(chs => chs.map(ch => {
      if (ch.id === id) {
        origName = ch.originalName;
        return { ...ch, [field]: value };
      }
      return ch;
    }));
    if (origName) updateRule(origName, { [field]: value });
  };

  const toggleChannelStatus = (id) => {
    setChannels(chs => chs.map(ch => {
      if (ch.id === id) {
        const newStatus = !ch.disabled;
        updateRule(ch.originalName, { hidden: newStatus });
        return { ...ch, disabled: newStatus };
      }
      return ch;
    }));
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkToggleStatus = (disabled) => {
    const selectedChannels = channels.filter(c => selectedIds.includes(c.id));
    setChannels(chs => chs.map(ch => {
      if (selectedIds.includes(ch.id)) {
        updateRule(ch.originalName, { hidden: disabled });
        return { ...ch, disabled };
      }
      return ch;
    }));
    setSelectedIds([]);
  };

  const handleBulkChangeGroup = () => {
    const newGroup = window.prompt("Inserisci il nuovo nome del gruppo per i canali selezionati:");
    if (newGroup === null) return;
    const trimmed = newGroup.trim();

    setChannels(chs => chs.map(ch => {
      if (selectedIds.includes(ch.id)) {
        updateRule(ch.originalName, { group: trimmed });
        return { ...ch, group: trimmed };
      }
      return ch;
    }));
    setSelectedIds([]);
  };

  const handleRenameGroup = (oldName) => {
    if (!oldName) return; // Non rinominare "Senza Gruppo"
    const newName = window.prompt(`Rinomina il gruppo "${oldName}" in:`, oldName);
    if (newName !== null && newName.trim() !== '' && newName !== oldName) {
      const trimmed = newName.trim();
      const affectedOriginals = [];

      setChannels(chs => chs.map(ch => {
        if (ch.group === oldName) {
          affectedOriginals.push(ch.originalName);
          return { ...ch, group: trimmed };
        }
        return ch;
      }));

      // Update rules in bulk for renamed group
      setRules(prev => {
        const newRules = { ...prev };
        newRules.items = { ...newRules.items };
        affectedOriginals.forEach(orig => {
          newRules.items[orig] = { ...(newRules.items[orig] || {}), group: trimmed };
        });

        // Also update groupsOrder if it exists
        if (newRules.groupsOrder) {
          newRules.groupsOrder = newRules.groupsOrder.map(g => g === oldName ? trimmed : g);
        }
        saveRules(newRules);
        return newRules;
      });

      if (activeTab === oldName) {
        setActiveTab(trimmed);
      }
    }
  };

  const clearRules = () => {
    if (window.confirm("Sei sicuro di voler ripristinare tutte le modifiche salvate localmente? Questa operazione ricaricherà i file originali.")) {
      const emptyRules = { items: {}, order: [], groupsOrder: [] };
      saveRules(emptyRules);
      setRules(emptyRules);
      if (currentFile) {
        const repo = GITHUB_REPO_URLS.find(r => r.path === currentFile);
        if (repo) handleGitHubImport(repo);
      } else {
        setChannels([]);
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="glass-panel p-8 rounded-2xl w-full max-w-sm flex flex-col gap-6 border-slate-700">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4 border border-indigo-500/30">
              <Lock className="w-8 h-8 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Accesso Riservato</h1>
            <p className="text-slate-400 text-sm text-center">Inserisci la password per accedere al Channel Manager</p>
          </div>

          <input
            type="password"
            placeholder="Password..."
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          />

          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-indigo-900/40 transition-colors">
            Accedi
          </button>
        </form>
      </div>
    );
  }

  // Determine unique groups for tabs, sorted by rules.groupsOrder if available
  const groupsRaw = [...new Set(channels.map(c => c.group))].filter(Boolean);
  const groupsOrdered = rules.groupsOrder && rules.groupsOrder.length > 0
    ? [...new Set([...rules.groupsOrder.filter(g => groupsRaw.includes(g)), ...groupsRaw])]
    : groupsRaw;
  const groups = ['All', ...groupsOrdered];

  let filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ch.group.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (activeTab !== 'All') {
    filteredChannels = filteredChannels.filter(ch => ch.group === activeTab);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 font-sans">
      <header className="sticky top-0 z-10 glass-panel border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/20">
              <Settings className="w-6 h-6 text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              LiveTV Premium Manager
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-1 md:flex-none justify-center items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700 rounded-lg cursor-pointer font-medium text-sm">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Locale</span>
              <input type="file" accept=".m3u,.m3u8" className="hidden" onChange={handleFileUpload} />
            </label>

            <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="px-3 py-2 bg-slate-900 border-r border-slate-700 flex items-center justify-center">
                <Github className="w-4 h-4 text-slate-300" />
              </div>
              {GITHUB_REPO_URLS.map(repo => (
                <button
                  key={repo.name}
                  onClick={() => handleGitHubImport(repo)}
                  disabled={isLoading}
                  className={`px-4 py-2 hover:bg-slate-700 transition-colors text-sm font-medium border-r border-slate-700 last:border-0 ${currentFile === repo.path ? 'bg-indigo-500/20 text-indigo-300' : ''}`}
                >
                  {repo.name}
                </button>
              ))}
            </div>

            {currentFile ? (
              <button
                onClick={handleGitHubExport}
                disabled={channels.length === 0 || isExporting}
                className="flex justify-center items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors rounded-lg font-medium text-sm shadow-lg shadow-emerald-900/20"
              >
                {isExporting ? <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span> : <Github className="w-4 h-4" />}
                <span>Salva su GitHub</span>
              </button>
            ) : (
              <button
                onClick={handleExport}
                disabled={channels.length === 0}
                className="flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors rounded-lg font-medium text-sm shadow-lg shadow-indigo-900/20"
              >
                <Download className="w-4 h-4" />
                <span>Esporta Locale</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex justify-center items-center p-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-slate-700 rounded-lg"
              title="Esci"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
            <h2 className="text-xl font-medium text-slate-300">Caricamento da GitHub in corso...</h2>
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
              <Upload className="w-10 h-10 text-slate-500" />
            </div>
            <h2 className="text-2xl font-semibold mb-2 text-slate-300">Nessuna Playlist</h2>
            <p className="text-slate-500 max-w-md mx-auto">Importa un file locale oppure clicca su uno dei bottoni GitHub in alto per caricare direttamente le liste dalla repo.</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Sidebar per Categorie */}
            <div className="w-full lg:w-64 flex-shrink-0">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sticky top-24">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Gruppi ({groups.length - 1})</h3>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  <button
                    onClick={() => setActiveTab('All')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mb-2 ${activeTab === 'All'
                      ? 'bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                  >
                    All
                  </button>
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="groups-list" type="GROUP">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef}>
                          {groups.filter(g => g !== 'All').map((g, index) => (
                            <Draggable key={g} draggableId={`group-${g}`} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`flex items-center group relative ${snapshot.isDragging ? 'z-50 opacity-90' : ''}`}
                                >
                                  <div
                                    {...provided.dragHandleProps}
                                    className="p-1 px-2 text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="w-3 h-3" />
                                  </div>
                                  <button
                                    onClick={() => setActiveTab(g)}
                                    className={`w-full text-left px-2 py-2 rounded-lg text-sm transition-colors ${activeTab === g
                                      ? 'bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30'
                                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                      }`}
                                  >
                                    {g || 'Senza Gruppo'}
                                  </button>

                                  {g && activeTab === g && (
                                    <button
                                      onClick={() => handleRenameGroup(g)}
                                      className="absolute right-2 p-1.5 text-slate-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors"
                                      title="Rinomina Gruppo"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>

                {/* Playlist Links section */}
                <div className="mt-8 pt-6 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Link className="w-4 h-4" /> M3U Links
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-medium">PROXY</span>
                      <button
                        onClick={() => setUseProxyForLinks(!useProxyForLinks)}
                        className={`w-8 h-4 rounded-full relative transition-colors ${useProxyForLinks ? 'bg-indigo-500' : 'bg-slate-700'}`}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${useProxyForLinks ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {['Live', 'Film', 'Series'].map((type) => (
                      <button
                        key={type}
                        onClick={() => copyToClipboard(type)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg text-xs text-slate-300 transition-all group"
                      >
                        <span>Playlist {type}</span>
                        {copiedType === type ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-grow space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span className="bg-slate-800 px-3 py-1 rounded-full font-medium text-white border border-slate-700">
                    {filteredChannels.length} / {channels.length} canali
                  </span>
                </div>

                <div className="relative w-full sm:w-80">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    placeholder="Cerca canale o gruppo..."
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 block pl-10 p-2.5 transition-colors"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allVisibleIds = filteredChannels.map(c => c.id);
                      const allSelected = allVisibleIds.every(id => selectedIds.includes(id));
                      if (allSelected) {
                        setSelectedIds(prev => prev.filter(id => !allVisibleIds.includes(id)));
                      } else {
                        setSelectedIds(prev => [...new Set([...prev, ...allVisibleIds])]);
                      }
                    }}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded border border-slate-700 transition-colors"
                  >
                    {filteredChannels.every(c => selectedIds.includes(c.id)) ? 'Deseleziona Tutto' : 'Seleziona Tutti Visibili'}
                  </button>
                </div>
              </div>

              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="channels-list">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2"
                    >
                      {filteredChannels.map((channel, index) => (
                        <Draggable key={channel.id} draggableId={channel.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl border transition-all ${snapshot.isDragging
                                ? 'bg-indigo-900/30 border-indigo-500/50 shadow-2xl scale-[1.02] z-50'
                                : selectedIds.includes(channel.id)
                                  ? 'bg-indigo-500/10 border-indigo-500/50'
                                  : channel.disabled
                                    ? 'bg-slate-900 border-slate-800 opacity-50 grayscale hover:opacity-70 transition-opacity'
                                    : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                                }`}
                              onClick={(e) => {
                                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                                  toggleSelection(channel.id);
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(channel.id)}
                                  onChange={() => toggleSelection(channel.id)}
                                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                                />
                                <div
                                  {...provided.dragHandleProps}
                                  className="p-2 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing self-center"
                                >
                                  <GripVertical className="w-5 h-5" />
                                </div>
                              </div>

                              <div className="flex-shrink-0 w-16 h-12 bg-slate-900 rounded border border-slate-700 flex items-center justify-center p-1 overflow-hidden">
                                {channel.logo ? (
                                  <img src={channel.logo} alt="" className="max-w-full max-h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
                                ) : (
                                  <span className="text-[10px] text-slate-600 font-medium">No Logo</span>
                                )}
                              </div>

                              <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                <div>
                                  <input
                                    type="text"
                                    value={channel.name}
                                    onChange={(e) => updateChannel(channel.id, 'name', e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                                    placeholder="Nome Canale"
                                  />
                                </div>
                                <div>
                                  <input
                                    type="text"
                                    value={channel.group}
                                    onChange={(e) => updateChannel(channel.id, 'group', e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                                    placeholder="Gruppo / Categoria"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-1 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                                <button
                                  onClick={() => setEditingId(editingId === channel.id ? null : channel.id)}
                                  className={`p-2 rounded transition-colors ${editingId === channel.id ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10'}`}
                                  title="Avanzate"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => toggleChannelStatus(channel.id)}
                                  className={`p-2 rounded transition-colors ${channel.disabled ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'}`}
                                  title={channel.disabled ? "Attiva" : "Disattiva"}
                                >
                                  {channel.disabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                              </div>

                              {/* Extended Edit Panel */}
                              {editingId === channel.id && (
                                <div className="w-full flex-basis-full col-span-full sm:col-span-1 border-t border-slate-700/50 pt-3 mt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block pl-1">URL Stream</label>
                                    <input
                                      type="text"
                                      value={channel.url}
                                      onChange={(e) => updateChannel(channel.id, 'url', e.target.value)}
                                      className="w-full bg-slate-950/50 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-400 focus:ring-1 focus:ring-indigo-500 font-mono"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block pl-1">URL Logo</label>
                                    <input
                                      type="text"
                                      value={channel.logo}
                                      onChange={(e) => updateChannel(channel.id, 'logo', e.target.value)}
                                      className="w-full bg-slate-950/50 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-400 focus:ring-1 focus:ring-indigo-500 font-mono"
                                    />
                                  </div>
                                </div>
                              )}

                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </div>
        )}
      </main>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-2xl shadow-indigo-500/20 px-6 py-4 flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">{selectedIds.length} Selezionati</span>
              <button onClick={() => setSelectedIds([])} className="text-[10px] text-indigo-400 hover:text-indigo-300 text-left font-semibold uppercase tracking-wider">Deseleziona</button>
            </div>

            <div className="h-8 w-px bg-slate-800 mx-2"></div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkToggleStatus(false)}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20 transition-all"
              >
                <Eye className="w-3.5 h-3.5" /> Attiva
              </button>
              <button
                onClick={() => handleBulkToggleStatus(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold border border-red-500/20 transition-all"
              >
                <EyeOff className="w-3.5 h-3.5" /> Disattiva
              </button>
              <button
                onClick={handleBulkChangeGroup}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-xs font-bold border border-indigo-500/20 transition-all"
              >
                <Settings className="w-3.5 h-3.5" /> Cambia Gruppo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
