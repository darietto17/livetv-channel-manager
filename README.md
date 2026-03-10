# Channel Manager Web Interface

Un'interfaccia moderna e intuitiva per gestire le tue playlist IPTV (.m3u) direttamente dal browser, integrata perfettamente con l'ecosistema LiveTvPremium.

## ✨ Funzionalità

- **Gestione Gruppi (Drag & Drop)**: Riordina le categorie trascinandole nella sidebar. Rinominazione istantanea dei gruppi.
- **Personalizzazione Canali**: Modifica nomi, loghi e associazioni di gruppo.
- **Operazioni di Massa (Bulk)**: Seleziona più canali per attivarli, disattivarli o spostarli di categoria in un colpo solo.
- **Sistema di Regole Persistenti**: Le tue modifiche non vanno perse! Vengono salvate in un file `user_rules.json` sulla tua repository GitHub e applicate automaticamente dal generatore Python.
- **GitHub Sync (Zero Token)**: Sincronizzazione sicura tramite Vercel Serverless Functions. Non è necessario inserire il proprio token nel browser.

## 🚀 Setup su Vercel

1. **Deploy**: Collega la repository `channel-manager-web` a Vercel.
2. **Environment Variables**:
   - Aggiungi `GITHUB_TOKEN` nelle impostazioni di Vercel (il tuo Personal Access Token con permessi `repo`).
   - Aggiungi `VITE_APP_PASSWORD` per proteggere l'accesso all'interfaccia.
3. **Enjoy**: Accedi all'URL generato da Vercel e inserisci la password.

## 🛠️ Tech Stack

- **React + Vite**
- **Tailwind CSS** (Styling)
- **Lucide React** (Icone)
- **@hello-pangea/dnd** (Drag & Drop)
- **Vercel Serverless Functions** (GitHub Proxy)
