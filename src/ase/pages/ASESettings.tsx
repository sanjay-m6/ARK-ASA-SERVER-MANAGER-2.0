import { useState, useEffect } from 'react';
import { Settings, FolderOpen, Save, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function ASESettings() {
  const [defaultInstallPath, setDefaultInstallPath] = useState('');
  const [steamcmdPath, setSteamcmdPath] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [steamApiKey, setSteamApiKey] = useState('');
  const [discordToken, setDiscordToken] = useState('');
  const [discordClientId, setDiscordClientId] = useState('');

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const installPath = await invoke<string | null>('get_setting', { key: 'ase_install_path' });
        const steamCmd = await invoke<string | null>('get_setting', { key: 'ase_steamcmd_path' });
        const apiKey = await invoke<string | null>('get_setting', { key: 'ase_steam_api_key' });
        const autoUpd = await invoke<string | null>('get_setting', { key: 'ase_auto_update' });
        const dToken = await invoke<string | null>('get_setting', { key: 'ase_discord_bot_token' });
        const dClient = await invoke<string | null>('get_setting', { key: 'ase_discord_client_id' });

        if (installPath) setDefaultInstallPath(installPath);
        else setDefaultInstallPath('C:\\ARKServerManager\\ase');

        if (steamCmd) setSteamcmdPath(steamCmd);
        else setSteamcmdPath('C:\\ARKServerManager\\steamcmd');

        if (apiKey) setSteamApiKey(apiKey);
        if (autoUpd) setAutoUpdate(autoUpd === 'true');
        if (dToken) setDiscordToken(dToken);
        if (dClient) setDiscordClientId(dClient);
      } catch (err) {
        console.error('Failed to load ASE settings', err);
      }
    };
    loadSettings();
  });

  const handleSave = async () => { 
    try {
      await invoke('set_setting', { key: 'ase_install_path', value: defaultInstallPath });
      await invoke('set_setting', { key: 'ase_steamcmd_path', value: steamcmdPath });
      await invoke('set_setting', { key: 'ase_steam_api_key', value: steamApiKey });
      await invoke('set_setting', { key: 'ase_auto_update', value: autoUpdate ? 'true' : 'false' });
      await invoke('set_setting', { key: 'ase_discord_bot_token', value: discordToken });
      await invoke('set_setting', { key: 'ase_discord_client_id', value: discordClientId });
      toast.success('ASE settings saved successfully'); 
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save ASE settings');
    }
  };

  const handleSelectFolder = async (setter: (path: string) => void, title: string) => {
    try {
      const path = await invoke<string | null>('select_folder', { title });
      if (path) setter(path);
    } catch (error) {
      console.error('Failed to select folder:', error);
      toast.error('Failed to open folder picker');
    }
  };

  const openUrl = async (url: string) => {
    try {
      await invoke('plugin:opener|open_url', { url });
    } catch (error) {
      window.open(url, '_blank');
    }
  };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><div className="p-2.5 bg-amber-500/10 rounded-xl"><Settings className="w-6 h-6 text-amber-400" /></div>ASE Settings</h1><p className="text-sm text-slate-400 mt-1">ARK: Survival Evolved module configuration</p></div>

      <div className="glass-panel rounded-2xl p-6 space-y-6">
        <div>
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4">Paths</h3>
          <label className="block mb-4"><span className="text-sm text-slate-300 mb-1 block">Default Install Path</span><div className="flex gap-2"><input type="text" value={defaultInstallPath} onChange={e => setDefaultInstallPath(e.target.value)} className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30" /><button type="button" onClick={() => handleSelectFolder(setDefaultInstallPath, 'Select Default Install Path')} className="px-3 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors focus:outline-none"><FolderOpen className="w-4 h-4" /></button></div></label>
          <label className="block"><span className="text-sm text-slate-300 mb-1 block">SteamCMD Path</span><div className="flex gap-2"><input type="text" value={steamcmdPath} onChange={e => setSteamcmdPath(e.target.value)} className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30" /><button type="button" onClick={() => handleSelectFolder(setSteamcmdPath, 'Select SteamCMD Path')} className="px-3 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors focus:outline-none"><FolderOpen className="w-4 h-4" /></button></div></label>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4">General</h3>
          <div className="flex items-center justify-between py-3"><span className="text-sm text-slate-300">Auto-update servers on startup</span><button onClick={() => setAutoUpdate(!autoUpdate)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none ${autoUpdate ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>{autoUpdate ? 'Enabled' : 'Disabled'}</button></div>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4">API Integrations</h3>
          <label className="block mb-4">
            <span className="text-sm text-slate-300 mb-1 block">Steam Web API Key</span>
            <div className="flex gap-2">
              <input 
                type="password" 
                value={steamApiKey} 
                onChange={e => setSteamApiKey(e.target.value)} 
                placeholder="Enter your Steam Web API Key..."
                className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30" 
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500">Required to resolve Steam Workshop items, retrieve mod metadata, and correctly link server downloads.</p>
              <button 
                type="button"
                onClick={() => openUrl('https://steamcommunity.com/dev/apikey')}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:text-amber-400 transition-colors focus:outline-none"
              >
                Get API Key <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </label>
          <label className="block mt-4 mb-4">
            <span className="text-sm text-slate-300 mb-1 block">Discord Bot Token (ASE)</span>
            <input 
              type="password" 
              value={discordToken} 
              onChange={e => setDiscordToken(e.target.value)} 
              placeholder="Enter Discord Bot Token..."
              className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30" 
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-300 mb-1 block">Discord Client ID (ASE)</span>
            <input 
              type="text" 
              value={discordClientId} 
              onChange={e => setDiscordClientId(e.target.value)} 
              placeholder="Enter Discord Client ID..."
              className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30" 
            />
            <p className="text-xs text-slate-500 mt-2">Required for advanced Discord integration (e.g. cross-chat, status updates). Leave empty if not using Discord features for ASE.</p>
          </label>
        </div>

        <div className="glass-panel rounded-xl p-4 bg-slate-800/30">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ASE Module Info</h4>
          <div className="space-y-1 text-xs text-slate-500">
            <p>Steam AppID: <span className="text-white font-mono">376030</span></p>
            <p>Executable: <span className="text-white font-mono">ShooterGameServer.exe</span></p>
            <p>Engine: <span className="text-white">Unreal Engine 4</span></p>
            <p>Mod Platform: <span className="text-white">Steam Workshop</span></p>
          </div>
        </div>

        <button onClick={handleSave} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all focus:outline-none"><Save className="w-4 h-4" />Save Settings</button>
      </div>
    </motion.div>
  );
}
