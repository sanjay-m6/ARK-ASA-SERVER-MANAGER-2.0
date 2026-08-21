import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Settings, FolderOpen, Save, ExternalLink, Shield, Terminal, FileText, Search, Copy, Check, X, RefreshCw, Trash2, Palette } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/helpers';
import FirewallSettings from '../../components/settings/FirewallSettings';
import AppearanceSettings from '../../components/settings/AppearanceSettings';
import LanguageSettings from '../../components/settings/LanguageSettings';

export default function ASESettings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [defaultInstallPath, setDefaultInstallPath] = useState('');
  const [steamcmdPath, setSteamcmdPath] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [aseUserConfigFolder, setAseUserConfigFolder] = useState('');
  const [discordToken, setDiscordToken] = useState('');
  const [discordClientId, setDiscordClientId] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'language' | 'api' | 'firewall'>('general');
  const [isLoading, setIsLoading] = useState(true);

  // Log Viewer state
  const [isViewLogOpen, setIsViewLogOpen] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const loadLogContent = async () => {
    setLogLoading(true);
    try {
      const logsDir: string = await invoke('get_app_logs_dir');
      const path = `${logsDir}/startup.log`;
      const content: string = await invoke('read_file_content', { path });
      setLogContent(content);
    } catch (error) {
      console.error('Failed to load log content:', error);
      setLogContent(t('settings.diagnosticsTab.noLogYet', 'No startup log file found or failed to read.'));
    } finally {
      setLogLoading(false);
    }
  };

  const handleOpenLogsFolder = async () => {
    try {
      const logsDir: string = await invoke('get_app_logs_dir');
      await invoke('open_in_explorer', { path: logsDir });
      toast.success(t('settings.diagnosticsTab.folderOpened', 'Logs folder opened in file explorer'));
    } catch (error) {
      console.error('Failed to open logs folder:', error);
      toast.error(t('settings.diagnosticsTab.folderOpenFailed', 'Failed to open logs folder'));
    }
  };

  const handleCopyLog = () => {
    navigator.clipboard.writeText(logContent);
    setIsCopied(true);
    toast.success(t('common.copied', 'Copied to clipboard'));
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const installPath = await invoke<string | null>('get_setting', { key: 'ase_install_path' });
        const steamCmd = await invoke<string | null>('get_setting', { key: 'ase_steamcmd_path' });
        const autoUpd = await invoke<string | null>('get_setting', { key: 'ase_auto_update' });
        const dToken = await invoke<string | null>('get_setting', { key: 'ase_discord_bot_token' });
        const dClient = await invoke<string | null>('get_setting', { key: 'ase_discord_client_id' });

        if (installPath) setDefaultInstallPath(installPath);
        else setDefaultInstallPath('C:\\ARKServerManager\\ase');

        if (steamCmd) setSteamcmdPath(steamCmd);
        else setSteamcmdPath('C:\\ARKServerManager\\steamcmd');

        if (autoUpd) setAutoUpdate(autoUpd === 'true');
        if (dToken) setDiscordToken(dToken);
        if (dClient) setDiscordClientId(dClient);

        const ucf = await invoke<string | null>('get_setting', { key: 'ase_user_config_folder' });
        if (ucf) setAseUserConfigFolder(ucf);
      } catch (err) {
        console.error('Failed to load ASE settings', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => { 
    try {
      await invoke('set_setting', { key: 'ase_install_path', value: defaultInstallPath });
      await invoke('set_setting', { key: 'ase_steamcmd_path', value: steamcmdPath });
      await invoke('set_setting', { key: 'ase_auto_update', value: autoUpdate ? 'true' : 'false' });
      await invoke('set_setting', { key: 'ase_discord_bot_token', value: discordToken });
      await invoke('set_setting', { key: 'ase_discord_client_id', value: discordClientId });
      await invoke('set_setting', { key: 'ase_user_config_folder', value: aseUserConfigFolder });
      toast.success('ASE settings saved successfully'); 
    } catch (err) {
      console.error('Failed to save ASE settings', err);
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

  return (
    <motion.div className="space-y-6 pb-20" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <Settings className="w-6 h-6 text-amber-400" />
            </div>
            ASE Settings
          </h1>
          <p className="text-sm text-slate-400 mt-1">ARK: Survival Evolved module configuration</p>
        </div>

        {(activeTab === 'general' || activeTab === 'api') && (
          <button 
            onClick={handleSave} 
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20 focus:outline-none"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex p-1.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-md w-max shadow-inner gap-1 mb-6 flex-wrap">
        <button
          onClick={() => setActiveTab('general')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'general'
              ? "text-amber-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">⚙️ General Settings</span>
        </button>
        <button
          onClick={() => setActiveTab('appearance')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'appearance'
              ? "text-purple-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Appearance & Theme
          </span>
        </button>
        <button
          onClick={() => setActiveTab('language')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'language'
              ? "text-sky-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">🌐 Language</span>
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'api'
              ? "text-sky-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">🔌 API Integrations</span>
        </button>
        <button
          onClick={() => setActiveTab('firewall')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'firewall'
              ? "text-red-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <span className="relative z-10 flex items-center gap-2">🛡️ Firewall Rules</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full"></div>
        </div>
      ) : activeTab === 'appearance' ? (
        <AppearanceSettings />
      ) : activeTab === 'language' ? (
        <LanguageSettings />
      ) : activeTab === 'general' ? (
        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
          <div className="glass-panel rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4">Paths</h3>
              <label className="block mb-4">
                <span className="text-sm text-slate-300 mb-1 block">Default Install Path</span>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={defaultInstallPath} 
                    onChange={e => setDefaultInstallPath(e.target.value)} 
                    className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30" 
                  />
                  <button 
                    type="button" 
                    onClick={() => handleSelectFolder(setDefaultInstallPath, 'Select Default Install Path')} 
                    className="px-3 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors focus:outline-none"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300 mb-1 block">SteamCMD Path</span>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={steamcmdPath} 
                    onChange={e => setSteamcmdPath(e.target.value)} 
                    className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30" 
                  />
                  <button 
                    type="button" 
                    onClick={() => handleSelectFolder(setSteamcmdPath, 'Select SteamCMD Path')} 
                    className="px-3 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors focus:outline-none"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-sm text-slate-300 mb-1 block">User Config Folder</span>
                <p className="text-xs text-slate-500 mb-2">Point to a custom folder containing your server INI files (GameUserSettings.ini, Game.ini). When set, configs are read/written from here instead of the server install directory.</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={aseUserConfigFolder} 
                    onChange={e => setAseUserConfigFolder(e.target.value)} 
                    placeholder="Not set — using default server install path"
                    className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30 placeholder-slate-500" 
                  />
                  <button 
                    type="button" 
                    onClick={() => handleSelectFolder(setAseUserConfigFolder, 'Select User Config Folder')} 
                    className="px-3 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors focus:outline-none"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  {aseUserConfigFolder && (
                    <button 
                      type="button" 
                      onClick={() => setAseUserConfigFolder('')} 
                      className="px-3 py-3 bg-slate-800/50 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 rounded-xl text-slate-400 hover:text-red-400 transition-all focus:outline-none"
                      title="Clear and use default"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {aseUserConfigFolder && (
                  <p className="mt-2 text-xs text-amber-400/70 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Config files will be read from and saved to this folder
                  </p>
                )}
              </label>
            </div>

            <div className="border-t border-white/5 pt-6">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4">General</h3>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-slate-300">Auto-update servers on startup</span>
                <button 
                  onClick={() => setAutoUpdate(!autoUpdate)} 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none ${
                    autoUpdate 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                  }`}
                >
                  {autoUpdate ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4 bg-slate-800/30 border-white/5">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ASE Module Info</h4>
              <div className="space-y-1 text-xs text-slate-500">
                <p>Steam AppID: <span className="text-white font-mono">376030</span></p>
                <p>Executable: <span className="text-white font-mono">ShooterGameServer.exe</span></p>
                <p>Engine: <span className="text-white">Unreal Engine 4</span></p>
                <p>Mod Platform: <span className="text-white">Steam Workshop</span></p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-6">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                {t('settings.diagnosticsTab.title', 'Troubleshooting & Diagnostics')}
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                {t('settings.diagnosticsTab.desc', 'Examine application logs and open the log directory to diagnose startup issues or update failures.')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleOpenLogsFolder}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-white/10 rounded-xl transition-colors text-xs font-bold shadow-md focus:outline-none"
                >
                  <FolderOpen className="w-4 h-4 text-sky-400" />
                  {t('settings.diagnosticsTab.openFolder', 'Open Logs Folder')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsViewLogOpen(true);
                    loadLogContent();
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-white/10 rounded-xl transition-colors text-xs font-bold shadow-md focus:outline-none"
                >
                  <FileText className="w-4 h-4 text-indigo-400" />
                  {t('settings.diagnosticsTab.viewLog', 'View Startup Log')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'api' ? (
        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
          <div className="glass-panel rounded-2xl p-6 space-y-6">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">API Integrations</h3>
            
            {/* Steam Web API Key Navigation Link */}
            <div 
              onClick={() => navigate('/settings')}
              className="group bg-slate-800/20 hover:bg-amber-500/[0.02] border border-white/5 hover:border-amber-500/30 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20 group-hover:bg-amber-500/20 group-hover:border-amber-500/30 transition-all duration-300 flex-shrink-0 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-bold text-slate-200 block mb-0.5 group-hover:text-amber-400 transition-colors duration-300">
                    Steam Web API Key
                  </span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    The Steam Web API Key is managed globally. Click here to configure it in the main <span className="text-amber-400/90 font-semibold group-hover:underline">Global Settings</span> page.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="px-4 py-2.5 bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 group-hover:border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all self-start sm:self-center hover:scale-[1.03] active:scale-[0.98] shadow-md focus:outline-none flex-shrink-0"
              >
                Configure API Key <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

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
        </div>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <FirewallSettings mode="ase" />
        </div>
      )}

      {/* Log Viewer Modal */}
      {isViewLogOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl h-[85vh] flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-slate-800 bg-slate-900/40">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-amber-400" />
                  {t('settings.diagnosticsTab.modalTitle', 'Startup & Diagnostics Logs')}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  {t('settings.diagnosticsTab.modalSubtitle', 'Review active application state messages and errors.')}
                </p>
              </div>
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                {/* Search box */}
                <div className="relative max-w-xs flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder={t('common.search', 'Search logs...')}
                    className="w-full pl-9 pr-4 py-2 bg-slate-950/40 border border-slate-800 focus:border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-slate-700 transition-all"
                  />
                  {logSearch && (
                    <button 
                      onClick={() => setLogSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                
                <button
                  onClick={loadLogContent}
                  disabled={logLoading}
                  title={t('common.refresh', 'Refresh')}
                  className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-4 h-4", logLoading && "animate-spin")} />
                </button>
                
                <button
                  onClick={handleCopyLog}
                  title={t('common.copy', 'Copy')}
                  className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 transition-colors"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                
                <button
                  onClick={() => {
                    setIsViewLogOpen(false);
                    setLogSearch('');
                  }}
                  className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-xl border border-slate-700/50 hover:border-red-500/30 transition-all ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Log Output Body */}
            <div className="flex-1 overflow-auto p-6 bg-slate-950/60 font-mono text-sm leading-relaxed custom-scrollbar selection:bg-indigo-500/30">
              {logLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
                  <p>{t('settings.diagnosticsTab.loadingLogs', 'Reading log file...')}</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {(() => {
                    const lines = logContent.split('\n');
                    const filtered = lines.filter(line => 
                      !logSearch || line.toLowerCase().includes(logSearch.toLowerCase())
                    );
                    
                    if (filtered.length === 0) {
                      return (
                        <div className="text-slate-500 text-center py-12">
                          {t('settings.diagnosticsTab.noMatches', 'No lines matching search query')}
                        </div>
                      );
                    }

                    return filtered.map((line, index) => {
                      let lineClass = "text-slate-300";
                      if (line.toLowerCase().includes("error") || line.toLowerCase().includes("panic") || line.toLowerCase().includes("crashed")) {
                        lineClass = "text-red-400 bg-red-950/20 px-1 rounded";
                      } else if (line.toLowerCase().includes("warn")) {
                        lineClass = "text-amber-400 bg-amber-950/20 px-1 rounded";
                      } else if (line.toLowerCase().includes("info") || line.includes("----")) {
                        lineClass = "text-slate-500";
                      }

                      return (
                        <div key={index} className={cn("hover:bg-slate-800/40 py-0.5 transition-colors whitespace-pre-wrap break-all", lineClass)}>
                          <span className="text-slate-600 select-none mr-4 text-right inline-block w-8 text-xs">{index + 1}</span>
                          {line}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
            
            {/* Footer / Status bar */}
            <div className="px-6 py-4 bg-slate-900/60 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
              <span>
                {t('settings.diagnosticsTab.logLocation', 'Log path:')} <span className="font-mono text-slate-400 select-all">%APPDATA%\asa-manager\startup.log</span>
              </span>
              <span>
                {logContent ? `${logContent.split('\n').length} lines total` : '0 lines'}
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
}
