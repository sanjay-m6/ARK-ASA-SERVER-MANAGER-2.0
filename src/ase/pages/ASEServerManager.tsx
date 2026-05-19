import { useEffect, useState } from 'react';
import { Server, Plus, Play, Square, RotateCw, Trash2, Search, Settings, Terminal, Globe, Shield, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { cn } from '../../utils/helpers';
import { startAseServer, stopAseServer, deleteAseServer, updateAseServer } from '../utils/aseCommands';
import { getAseMapDisplayName } from '../data/aseMaps';
import ASEInstallWizard from '../components/install/ASEInstallWizard';
import ASEResetDialog from '../components/server/ASEResetDialog';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ASEServerManager() {
  const { servers, setServers, updateServerStatus, refreshServers, removeServer } = useAseServerStore();
  const [showInstall, setShowInstall] = useState(false);
  const [resetServer, setResetServer] = useState<{id: number, name: string} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServers, setSelectedServers] = useState<number[]>([]);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleToggleAseAutomation = async (serverId: number, field: 'autoStart' | 'autoStop' | 'intelligentMode', current: boolean) => {
    try {
      await updateAseServer(serverId, { [field]: !current });
      toast.success(current ? t('serverManager.automationDisabled', 'Automation disabled') : t('serverManager.automationEnabled', 'Automation enabled'));
      setServers(servers.map(s => s.id === serverId ? { ...s, [field]: !current } : s));
    } catch (error) {
      console.error('Failed to toggle ASE automation:', error);
      toast.error(t('serverManager.automationFailed', 'Failed to toggle automation'));
    }
  };

  useEffect(() => {
    // Initial load and periodic refresh
    refreshServers();
    const intervalId = setInterval(refreshServers, 3000);

    // Listen for backend status change events
    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('server-status-change', (event) => {
        const { server_id, status } = event.payload as { server_id: number; status: string };
        updateServerStatus(server_id, status as any);
      });
      return unlisten;
    };
    let unlistenPromise = setupListener();

    return () => {
      clearInterval(intervalId);
      // Cleanup event listener
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleStart = async (id: number) => { 
    try { 
      updateServerStatus(id, 'starting'); 
      await startAseServer(id); 
      toast.success('ASE server starting...'); 
    } catch (e) { 
      updateServerStatus(id, 'stopped'); 
      toast.error(`${e}`); 
    } 
  };

  const handleStop = async (id: number) => { 
    try { 
      await stopAseServer(id); 
      updateServerStatus(id, 'stopped'); 
      toast.success('ASE server stopped'); 
    } catch (e) { 
      toast.error(`${e}`); 
    } 
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete ASE server "${name}"? This cannot be undone.`)) return;
    try { 
      await deleteAseServer(id); 
      removeServer(id); 
      toast.success('Server deleted'); 
    } catch (e) { 
      toast.error(`${e}`); 
    }
  };

  const handleSelectServer = (serverId: number) => {
    setSelectedServers(prev =>
      prev.includes(serverId) ? prev.filter(id => id !== serverId) : [...prev, serverId]
    );
  };

  const handleSelectAll = () => {
    if (selectedServers.length === servers.length && servers.length > 0) {
      setSelectedServers([]);
    } else {
      setSelectedServers(servers.map(s => s.id));
    }
  };

  const handleBulkStart = async () => {
    const serversToStart = servers.filter(s => selectedServers.includes(s.id) && (s.status === 'stopped' || s.status === 'crashed'));
    if (serversToStart.length === 0) {
      toast.error('No startable servers selected.');
      return;
    }
    toast.success(`Starting ${serversToStart.length} servers...`);
    for (const server of serversToStart) {
      handleStart(server.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setSelectedServers([]);
  };

  const handleStartAll = async () => {
    const stopps = servers.filter(s => s.status === 'stopped' || s.status === 'crashed');
    if (stopps.length === 0) return toast.error('No stopped servers to start');
    toast.success(`Starting ${stopps.length} servers...`);
    for (const s of stopps) { handleStart(s.id); await new Promise(r => setTimeout(r, 500)); }
  };

  const handleBulkStop = async () => {
    const serversToStop = servers.filter(s => selectedServers.includes(s.id) && (s.status === 'running' || s.status === 'online' || s.status === 'starting'));
    if (serversToStop.length === 0) {
      toast.error('No running servers selected.');
      return;
    }
    toast.success(`Stopping ${serversToStop.length} servers...`);
    for (const server of serversToStop) {
      handleStop(server.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setSelectedServers([]);
  };

  const handleStopAll = async () => {
    const runnings = servers.filter(s => s.status === 'running' || s.status === 'online');
    if (runnings.length === 0) return toast.error('No running servers to stop');
    toast.success(`Stopping ${runnings.length} servers...`);
    for (const s of runnings) { handleStop(s.id); await new Promise(r => setTimeout(r, 500)); }
  };

  const filtered = servers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.mapName.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <motion.div className="space-y-8 animate-in fade-in duration-500" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 flex items-center gap-3">
            ASE Server Manager
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Deploy, configure, and manage your ARK: Survival Evolved servers</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowInstall(true)} className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl transition-all shadow-lg shadow-amber-500/20 font-medium group focus:outline-none">
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            <span>Deploy Server</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search servers by name or map..." className="w-full pl-12 pr-4 py-3 bg-slate-800/30 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner" />
      </div>

      {/* Bulk Actions Bar */}
      {servers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 gap-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors select-none">
              <input
                type="checkbox"
                checked={servers.length > 0 && selectedServers.length === servers.length}
                onChange={handleSelectAll}
                className="w-5 h-5 rounded border-slate-600 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                style={{ backgroundColor: 'transparent' }}
              />
              <span className="font-medium">
                {selectedServers.length > 0
                  ? `${selectedServers.length} Selected`
                  : 'Select All'}
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleBulkStart}
              disabled={selectedServers.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Selected</span>
            </button>
            <button
              onClick={handleStartAll}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg transition-all font-medium"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start All</span>
            </button>
            <div className="w-px h-6 bg-slate-700 hidden sm:block mx-1"></div>
            <button
              onClick={handleBulkStop}
              disabled={selectedServers.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Selected</span>
            </button>
            <button
              onClick={handleStopAll}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg transition-all font-medium"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop All</span>
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center border-2 border-dashed border-slate-700/50">
          <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Server className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">{servers.length === 0 ? 'No ASE Servers Installed' : 'No Results Found'}</h3>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            {servers.length === 0 ? 'Deploy your first ASE server to get started managing ARK: Survival Evolved servers.' : 'Try a different search term.'}
          </p>
          {servers.length === 0 && (
            <button onClick={() => setShowInstall(true)} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors border border-slate-700 focus:outline-none">
              Deploy ASE Server
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6">
          {filtered.map(srv => (
            <div key={srv.id} className="glass-panel rounded-2xl p-6 hover:border-amber-500/30 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-500/5 to-transparent rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
              
              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center h-full pt-1.5">
                    <input
                      type="checkbox"
                      checked={selectedServers.includes(srv.id)}
                      onChange={() => handleSelectServer(srv.id)}
                      className="w-5 h-5 rounded border-slate-600 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                      style={{ backgroundColor: 'transparent' }}
                    />
                  </div>
                  <div className="relative mt-1">
                    <div className={cn(
                        'w-4 h-4 rounded-full',
                        srv.status === 'running' && 'bg-amber-500 animate-pulse',
                        srv.status === 'online' && 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]',
                        srv.status === 'stopped' && 'bg-slate-500',
                        srv.status === 'crashed' && 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]',
                        srv.status === 'starting' && 'bg-amber-500 animate-pulse',
                        srv.status === 'updating' && 'bg-blue-500 animate-pulse'
                    )} />
                    {srv.status === 'online' && (
                        <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                        {srv.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                            'px-2.5 py-0.5 rounded-md text-xs font-bold border flex items-center gap-2',
                            srv.status === 'online' && 'bg-green-500/10 text-green-400 border-green-500/20',
                            srv.status === 'running' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                            srv.status === 'stopped' && 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                            srv.status === 'crashed' && 'bg-red-500/10 text-red-400 border-red-500/20',
                            srv.status === 'starting' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                            srv.status === 'updating' && 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        )}>
                            {srv.status === 'running' || srv.status === 'starting' || srv.status === 'updating' ? (
                                <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    {srv.status.toUpperCase()}
                                </>
                            ) : (
                                srv.status.toUpperCase()
                            )}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                      <div className="flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-slate-500" />
                          <span>{getAseMapDisplayName(srv.mapName)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                          <Terminal className="w-4 h-4 text-slate-500" />
                          <span className="font-mono">Port {srv.port}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-slate-500" />
                          <span>ASE Server</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {srv.status === 'stopped' || srv.status === 'crashed' ? (
                    <button onClick={()=>handleStart(srv.id)} className="p-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all hover:scale-105 active:scale-95" title="Start Server">
                      <Play className="w-5 h-5 fill-current" />
                    </button>
                  ) : (
                    <button onClick={()=>handleStop(srv.id)} className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all hover:scale-105 active:scale-95" title="Stop Server">
                      <Square className="w-5 h-5 fill-current" />
                    </button>
                  )}

                  <button
                      onClick={() => navigate('/ase/config', { state: { serverId: srv.id } })}
                      className="p-2.5 bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/30 rounded-lg transition-all hover:scale-105 active:scale-95"
                      title="Server Settings"
                  >
                      <Settings className="w-5 h-5" />
                  </button>

                  <button
                      onClick={() => navigate('/ase/rcon', { state: { serverId: srv.id } })}
                      className="p-2.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                      title="RCON Console"
                  >
                      <Terminal className="w-5 h-5" />
                  </button>

                  <div className="w-px h-8 bg-slate-700/50 mx-1"></div>

                  <button
                      onClick={() => setResetServer({id: srv.id, name: srv.name})}
                      className="p-2.5 bg-slate-700/30 hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 border border-slate-600/30 hover:border-orange-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                      title="Reset Server Data"
                  >
                      <RotateCw className="w-5 h-5" />
                  </button>

                  <button
                      onClick={() => handleDelete(srv.id, srv.name)}
                      className="p-2.5 bg-slate-700/30 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-600/30 hover:border-red-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                      title="Delete Server"
                  >
                      <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-700/30 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.installPath', 'Install Path')}</p>
                    <p className="text-slate-300 font-mono text-xs truncate" title={srv.installPath}>{srv.installPath}</p>
                </div>
                <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.maxPlayers', 'Max Players')}</p>
                    <p className="text-slate-300">{srv.maxPlayers} {t('serverManager.serverDetails.survivors', 'Survivors')}</p>
                </div>
                <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.sessionName', 'Session Name')}</p>
                    <p className="text-slate-300 truncate">{srv.sessionName}</p>
                </div>
                <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.connection', 'Connection')}</p>
                    <p className="text-slate-300 font-mono text-xs">
                        {srv.port} (Game) / {srv.queryPort} (Query)
                    </p>
                </div>
              </div>

              {/* Automation Controls */}
              <div className="mt-4 pt-4 border-t border-slate-700/30 flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{t('serverManager.serverDetails.automation', 'Automation')}</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer group/toggle">
                    <div className="relative">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={srv.autoStart || false}
                            onChange={() => handleToggleAseAutomation(srv.id, 'autoStart', srv.autoStart || false)}
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                    </div>
                    <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStart', 'Auto-Start')}</span>
                </label>

                {srv.autoStart && (
                    <div className="flex items-center gap-3 bg-slate-800/40 px-3 py-1 rounded-lg border border-slate-700/50 animate-in fade-in duration-200 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-400">
                            <span>{t('serverManager.serverDetails.delay', 'Delay')}:</span>
                            <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={srv.startupDelay !== undefined ? srv.startupDelay : ''}
                                onChange={async (e) => {
                                    const delay = parseInt(e.target.value) || 0;
                                    try {
                                        await updateAseServer(srv.id, { startupDelay: delay });
                                        setServers(servers.map(s => s.id === srv.id ? { ...s, startupDelay: delay } : s));
                                    } catch (err) {
                                        console.error('Failed to update delay:', err);
                                    }
                                }}
                                className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono text-center focus:outline-none focus:border-amber-500"
                            />
                            <span>s</span>
                        </div>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                            <span>{t('serverManager.serverDetails.priority', 'Priority')}:</span>
                            <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={srv.startupPriority !== undefined ? srv.startupPriority : ''}
                                onChange={async (e) => {
                                    const priority = parseInt(e.target.value) || 0;
                                    try {
                                        await updateAseServer(srv.id, { startupPriority: priority });
                                        setServers(servers.map(s => s.id === srv.id ? { ...s, startupPriority: priority } : s));
                                    } catch (err) {
                                        console.error('Failed to update priority:', err);
                                    }
                                }}
                                className="w-10 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono text-center focus:outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer group/toggle">
                    <div className="relative">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={srv.autoStop || false}
                            onChange={() => handleToggleAseAutomation(srv.id, 'autoStop', srv.autoStop || false)}
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStop', 'Auto-Stop')}</span>
                        <span className="text-[10px] text-slate-500">{t('serverManager.serverDetails.onConfigChange', 'On config change')}</span>
                    </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group/toggle ml-auto lg:ml-0">
                    <div className="relative">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={srv.intelligentMode || false}
                            onChange={() => handleToggleAseAutomation(srv.id, 'intelligentMode', srv.intelligentMode || false)}
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.intelligentMode', 'Intelligent Mode')}</span>
                        <span className="text-[10px] text-slate-500">{t('serverManager.serverDetails.autoRestartOnCrash', 'Auto-restart on crash')}</span>
                    </div>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {showInstall && <ASEInstallWizard onClose={() => { setShowInstall(false); refreshServers(); }} />}
      {resetServer && <ASEResetDialog isOpen={true} serverId={resetServer.id} serverName={resetServer.name} onClose={() => setResetServer(null)} onSuccess={refreshServers} />}
    </motion.div>
  );
}
