import { useState, useEffect } from 'react';
import { Settings, Upload, Download, GripVertical, Trash2, Search, Edit3, Github, Lock, LogOut } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

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
      const name = parts.length > 1 ? parts[1].trim() : 'Unknown Channel';

      currentChannel = {
        id: Math.random().toString(36).substr(2, 9),
        rawExtInf: l,
        name,
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

function generateM3U(channels) {
  let output = '#EXTM3U\n';
  channels.forEach(ch => {
    output += `#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.name}\n${ch.url}\n`;
  });
  return output;
}

const PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'admin';
const GITHUB_REPO_URLS = [
  { name: 'Live', path: 'lista.m3u', url: 'https://raw.githubusercontent.com/darietto17/LiveTvPremium/master/lista.m3u' },
  { name: 'Film', path: 'film.m3u', url: 'https://raw.githubusercontent.com/darietto17/LiveTvPremium/master/film.m3u' },
  { name: 'Serie', path: 'serie.m3u', url: 'https://raw.githubusercontent.com/darietto17/LiveTvPremium/master/serie.m3u' },
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
      setChannels(parsed);
    };
    reader.readAsText(file);
  };

  const handleGitHubImport = async (repoInfo) => {
    setIsLoading(true);
    try {
      const response = await fetch(repoInfo.url + '?t=' + new Date().getTime()); // cache bypass
      if (!response.ok) throw new Error(`HTTP ${response.status} - Impossibile scaricare la playlist`);
      const text = await response.text();
      const parsed = parseM3U(text);
      setChannels(parsed);
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

    let token = localStorage.getItem('githubToken');
    if (!token) {
      token = window.prompt("Inserisci il tuo GitHub Personal Access Token (classic) con permessi 'repo' per salvare le modifiche direttamente sulla tua repository:");
      if (!token) return;
      localStorage.setItem('githubToken', token);
    }

    setIsExporting(true);
    try {
      const content = generateM3U(channels);
      // Base64 encode representing UTF-8 string properly
      const encodedContent = btoa(unescape(encodeURIComponent(content)));

      const repoPath = 'darietto17/LiveTvPremium';
      const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${currentFile}`;

      // 1. Fetch current file SHA
      const getRes = await fetch(apiUrl, {
        headers: { Authorization: `token ${token}` }
      });

      if (!getRes.ok) {
        if (getRes.status === 401) {
          localStorage.removeItem('githubToken');
          throw new Error("Token non valido o scaduto. Riprova.");
        }
        throw new Error("Impossibile recuperare i dettagli del file da GitHub.");
      }
      const fileData = await getRes.json();

      // 2. Upload new content via PUT
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ${currentFile} via Web App`,
          content: encodedContent,
          sha: fileData.sha,
          branch: 'master'
        })
      });

      if (!putRes.ok) throw new Error("Errore durante il salvataggio su GitHub.");

      alert(`Perfetto! Il file ${currentFile} è stato aggiornato con successo sulla repository.`);
    } catch (err) {
      alert(err.message);
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

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(channels);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setChannels(items);
  };

  const updateChannel = (id, field, value) => {
    setChannels(chs => chs.map(ch => ch.id === id ? { ...ch, [field]: value } : ch));
  };

  const removeChannel = (id) => {
    setChannels(chs => chs.filter(ch => ch.id !== id));
  };

  const handleRenameGroup = (oldName) => {
    if (!oldName) return; // Non rinominare "Senza Gruppo"
    const newName = window.prompt(`Rinomina il gruppo "${oldName}" in:`, oldName);
    if (newName !== null && newName.trim() !== '' && newName !== oldName) {
      const trimmed = newName.trim();
      setChannels(chs => chs.map(ch => ch.group === oldName ? { ...ch, group: trimmed } : ch));
      if (activeTab === oldName) {
        setActiveTab(trimmed);
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

  // Determine unique groups for tabs
  const groups = ['All', ...new Set(channels.map(c => c.group))].filter(Boolean);

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
                  {groups.map(g => (
                    <div key={g} className="flex items-center group relative">
                      <button
                        onClick={() => setActiveTab(g)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === g
                          ? 'bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                          }`}
                      >
                        {g || 'Senza Gruppo'}
                      </button>

                      {g && g !== 'All' && activeTab === g && (
                        <button
                          onClick={() => handleRenameGroup(g)}
                          className="absolute right-2 p-1.5 text-slate-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors"
                          title="Rinomina Gruppo"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
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
                                : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                                }`}
                            >
                              <div
                                {...provided.dragHandleProps}
                                className="p-2 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing self-center hidden sm:block"
                              >
                                <GripVertical className="w-5 h-5" />
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
                                  onClick={() => removeChannel(channel.id)}
                                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                  title="Rimuovi"
                                >
                                  <Trash2 className="w-4 h-4" />
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
    </div>
  );
}
