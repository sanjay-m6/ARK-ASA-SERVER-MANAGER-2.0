import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Activity, Cpu, HardDrive, Zap, Terminal, Copy, Puzzle,
  Play, Square, RotateCw, Clock, Database, FileEdit,
  Sunrise, Sun, Moon, TrendingUp
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useServerStore } from '../stores/serverStore';
import { useUIStore } from '../stores/uiStore';
import { cn } from '../utils/helpers';
import { getAllServers, getSystemInfo, startServer, stopServer, restartServer, cloneServer, transferSettings, extractSaveData } from '../utils/tauri';
import { getVersion } from '@tauri-apps/api/app';
import PerformanceMonitor from '../components/performance/PerformanceMonitor';
import InstallServerDialog from '../components/server/InstallServerDialog';
import CloneOptionsModal from '../components/server/CloneOptionsModal';
import SponsorBanner from '../components/ui/SponsorBanner';
import { Server as ServerType } from '../types';

// Animation Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 10
    }
  }
};



export default function Dashboard() {
  const { servers, setServers, updateServerStatus } = useServerStore();
  const { systemInfo, setSystemInfo } = useUIStore();
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const navigate = useNavigate();

  // ... (rest of hook logic remains same until return)

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Good Morning', icon: Sunrise, color: 'text-amber-400' };
    if (hour < 18) return { text: 'Good Afternoon', icon: Sun, color: 'text-yellow-400' };
    return { text: 'Good Evening', icon: Moon, color: 'text-indigo-400' };
  };

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  const handleCopyIp = (serverIp: string | undefined, port: number) => {
    const ip = serverIp || '127.0.0.1';
    const address = `${ip}:${port}`;
    navigator.clipboard.writeText(address);
    toast.success(`Copied ${address} to clipboard`);
  };

  // Server control handlers (Keep existing logic)
  const handleStartServer = async (serverId: number) => {
    try {
      updateServerStatus(serverId, 'starting');
      await startServer(serverId);
      updateServerStatus(serverId, 'running');
      toast.success('Server started!');
    } catch (error) {
      updateServerStatus(serverId, 'stopped');
      toast.error(`Failed: ${error}`);
    }
  };

  const handleStopServer = async (serverId: number) => {
    try {
      await stopServer(serverId);
      updateServerStatus(serverId, 'stopped');
      toast.success('Server stopped!');
    } catch (error) {
      toast.error(`Failed: ${error}`);
    }
  };

  const handleRestartServer = async (serverId: number) => {
    try {
      updateServerStatus(serverId, 'starting');
      await restartServer(serverId);
      updateServerStatus(serverId, 'running');
      toast.success('Server restarted!');
    } catch (error) {
      toast.error(`Failed: ${error}`);
    }
  };

  // Clone Modal state (Keep existing logic)
  const [cloneModalServer, setCloneModalServer] = useState<ServerType | null>(null);

  const openCloneModal = (server: ServerType) => {
    setCloneModalServer(server);
  };

  const handleCloneServer = async () => {
    if (!cloneModalServer) return;
    try {
      const newServer = await cloneServer(cloneModalServer.id);
      setServers([...servers, newServer]);
      toast.success(`Server cloned as "${newServer.name}"`);
    } catch (error) {
      toast.error(`Failed to clone: ${error}`);
    }
  };

  const handleTransferSettings = async (targetServerId: number) => {
    if (!cloneModalServer) return;
    try {
      await transferSettings(cloneModalServer.id, targetServerId);
      toast.success('Settings transferred successfully');
    } catch (error) {
      toast.error(`Failed to transfer settings: ${error}`);
    }
  };

  const handleExtractData = async (targetServerId: number) => {
    if (!cloneModalServer) return;
    try {
      await extractSaveData(cloneModalServer.id, targetServerId);
      toast.success('Save data extracted successfully');
    } catch (error) {
      toast.error(`Failed to extract save data: ${error}`);
    }
  };

  // Effects (Keep existing logic)
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('?.?.?'));
    getAllServers().then(setServers).catch(console.error);

    const fetchSystemInfo = async () => {
      try {
        const info = await getSystemInfo();
        setSystemInfo(info);

        setPerformanceHistory(prev => {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

          const newPoint = {
            time: timeStr,
            cpu: info.cpuUsage,
            memory: (info.ramUsage / info.ramTotal) * 100,
            players: 0
          };

          const newHistory = [...prev, newPoint];
          if (newHistory.length > 60) newHistory.shift();
          return newHistory;
        });
      } catch (error) {
        console.error('Failed to fetch system info:', error);
      }
    };

    fetchSystemInfo();

    // Initial fetch
    getAllServers().then(setServers).catch(console.error);

    // Subscribe to real-time status updates
    let unlistenStatus: () => void;

    import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlistenStatus = await listen<{ server_id: number, status: any }>('server-status-change', (event) => {
        console.log('⚡ Server Status Update:', event.payload);
        updateServerStatus(event.payload.server_id, event.payload.status);
      });
    });

    // Reduced polling frequency (heartbeat)
    const interval = setInterval(() => {
      fetchSystemInfo();
      // We still poll occasionally to sync other data like player counts or drift
      getAllServers().then(setServers).catch(console.error);
    }, 30000);

    return () => {
      clearInterval(interval);
      if (unlistenStatus) unlistenStatus();
    };
  }, [setServers, setSystemInfo, updateServerStatus]);

  useEffect(() => {
    servers.forEach(server => {
      const shouldCheck =
        (server.status === 'running' || server.status === 'updating' || server.status === 'starting') &&
        !server.reachability;

      if (shouldCheck) {
        useServerStore.getState().checkReachability(server.id, server.ports.gamePort);
      }
    });
  }, [servers]);

  const runningServers = servers.filter(s => s.status === 'running').length;
  const stoppedServers = servers.filter(s => s.status === 'stopped').length;
  const totalServers = servers.length;
  const memoryPercent = systemInfo ? (systemInfo.ramUsage / systemInfo.ramTotal) * 100 : 0;
  const diskPercent = systemInfo ? (systemInfo.diskUsage / systemInfo.diskTotal) * 100 : 0;

  // Quick actions config
  const quickActions = [
    { name: 'Deploy Server', icon: Zap, path: null, action: () => setShowInstallDialog(true), color: 'sky', shortcut: 'D' },
    { name: 'Server Manager', icon: Server, path: '/servers', action: null, color: 'emerald', shortcut: 'S' },
    { name: 'Config Editor', icon: FileEdit, path: '/config', action: null, color: 'violet', shortcut: 'C' },
    { name: 'RCON Console', icon: Terminal, path: '/rcon', action: null, color: 'cyan', shortcut: 'R' },
    { name: 'Mod Manager', icon: Puzzle, path: '/mods', action: null, color: 'pink', shortcut: 'M' },
    { name: 'Backups', icon: Database, path: '/backups', action: null, color: 'amber', shortcut: 'B' },
    { name: 'Scheduler', icon: Clock, path: '/scheduler', action: null, color: 'rose', shortcut: 'T' },
  ];

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero Section */}
      <motion.div variants={itemVariants} className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-transparent rounded-full blur-3xl -mr-48 -mt-48"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900", greeting.color)}>
              <GreetingIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                {greeting.text}, Commander
              </h1>
              <p className="text-slate-400 mt-1">
                {runningServers > 0
                  ? `${runningServers} server${runningServers > 1 ? 's' : ''} running • System healthy`
                  : 'All systems standing by'
                }
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Version</p>
              <p className="text-sm font-mono text-slate-300">v{appVersion}</p>
            </div>
            <div className="w-px h-10 bg-slate-700"></div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs font-medium text-green-400">ONLINE</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Sponsor Banner */}
      <SponsorBanner />

      {/* Stats Grid - 6 Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Servers */}
        <div className="glass-panel rounded-xl p-4 group hover:border-sky-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-sky-500/10 rounded-lg">
              <Server className="w-4 h-4 text-sky-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Total</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalServers}</p>
          <p className="text-xs text-slate-500 mt-1">Servers</p>
        </div>

        {/* Running */}
        <div className="glass-panel rounded-xl p-4 group hover:border-green-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Activity className="w-4 h-4 text-green-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Running</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{runningServers}</p>
          <p className="text-xs text-slate-500 mt-1">Online</p>
        </div>

        {/* Stopped */}
        <div className="glass-panel rounded-xl p-4 group hover:border-slate-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-slate-500/10 rounded-lg">
              <Square className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Stopped</span>
          </div>
          <p className="text-2xl font-bold text-slate-400">{stoppedServers}</p>
          <p className="text-xs text-slate-500 mt-1">Offline</p>
        </div>

        {/* CPU */}
        <div className="glass-panel rounded-xl p-4 group hover:border-violet-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-violet-500/10 rounded-lg">
              <Cpu className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">CPU</span>
          </div>
          <p className="text-2xl font-bold text-white">{systemInfo?.cpuUsage.toFixed(0) || 0}%</p>
          <div className="w-full bg-slate-700/50 rounded-full h-1 mt-2">
            <div className="bg-violet-500 h-1 rounded-full transition-all" style={{ width: `${systemInfo?.cpuUsage || 0}%` }}></div>
          </div>
        </div>

        {/* RAM */}
        <div className="glass-panel rounded-xl p-4 group hover:border-pink-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-pink-500/10 rounded-lg">
              <TrendingUp className="w-4 h-4 text-pink-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">RAM</span>
          </div>
          <p className="text-2xl font-bold text-white">{memoryPercent.toFixed(0)}%</p>
          <div className="w-full bg-slate-700/50 rounded-full h-1 mt-2">
            <div className="bg-pink-500 h-1 rounded-full transition-all" style={{ width: `${memoryPercent}%` }}></div>
          </div>
        </div>

        {/* Disk */}
        <div className="glass-panel rounded-xl p-4 group hover:border-amber-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <HardDrive className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Disk</span>
          </div>
          <p className="text-2xl font-bold text-white">{diskPercent.toFixed(0)}%</p>
          <div className="w-full bg-slate-700/50 rounded-full h-1 mt-2">
            <div className="bg-amber-500 h-1 rounded-full transition-all" style={{ width: `${diskPercent}%` }}></div>
          </div>
        </div>
      </div>

      {/* Server Control Hub */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-sky-400" />
            Server Control Hub
          </h2>
          <button
            onClick={() => navigate('/servers')}
            className="text-sm text-sky-400 hover:text-sky-300 transition-colors"
          >
            Manage All →
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-700/50 rounded-xl">
            <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Servers</h3>
            <p className="text-slate-500 text-sm mb-4">Deploy your first server to get started</p>
            <button
              onClick={() => setShowInstallDialog(true)}
              className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg transition-all text-sm font-medium"
            >
              Deploy Server
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {servers.slice(0, 4).map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl hover:bg-slate-800/60 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      server.status === 'running' && 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]',
                      server.status === 'stopped' && 'bg-slate-500',
                      server.status === 'crashed' && 'bg-red-500',
                      server.status === 'starting' && 'bg-yellow-500 animate-pulse',
                      server.status === 'updating' && 'bg-blue-500 animate-pulse'
                    )} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{server.name}</h3>
                    <p className="text-xs text-slate-400">{server.config.mapName} • Port {server.ports.gamePort}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* IP Display + Copy */}
                  <div className="hidden md:flex items-center bg-slate-900/50 rounded-lg px-3 py-1.5 border border-slate-700">
                    <span className="text-xs font-mono text-slate-400 mr-2">{server.ipAddress || '127.0.0.1'}:{server.ports.gamePort}</span>
                    <button
                      onClick={() => handleCopyIp(server.ipAddress, server.ports.gamePort)}
                      className="p-1 hover:bg-slate-700 rounded transition-colors"
                      title="Copy IP"
                    >
                      <Copy className="w-3 h-3 text-slate-500 hover:text-sky-400" />
                    </button>
                  </div>

                  {/* Server Controls */}
                  {server.status === 'stopped' || server.status === 'crashed' ? (
                    <button
                      onClick={() => handleStartServer(server.id)}
                      className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all"
                      title="Start"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  ) : server.status === 'running' ? (
                    <>
                      <button
                        onClick={() => handleRestartServer(server.id)}
                        className="p-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-lg transition-all"
                        title="Restart"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStopServer(server.id)}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all"
                        title="Stop"
                      >
                        <Square className="w-4 h-4 fill-current" />
                      </button>
                    </>
                  ) : null}

                  {/* Status Badge with Reachability */}
                  <div className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold border ml-2 flex items-center gap-2',
                    server.status === 'running' && 'bg-green-500/10 text-green-400 border-green-500/20',
                    server.status === 'stopped' && 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                    server.status === 'crashed' && 'bg-red-500/10 text-red-400 border-red-500/20',
                    server.status === 'starting' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                    server.status === 'updating' && 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  )}>
                    <span>{server.status.toUpperCase()}</span>
                    {server.status === 'running' && server.reachability && (
                      <>
                        <div className="w-px h-3 bg-current opacity-20"></div>
                        <span className="opacity-90 font-medium">
                          {server.reachability === 'Public' ? 'PUBLIC' : 'LAN'}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Clone Button */}
                  <button
                    onClick={() => openCloneModal(server)}
                    className="p-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg transition-all ml-1"
                    title="Clone / Transfer / Extract"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions Panel - 8 Actions */}
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const colorClasses: Record<string, string> = {
              sky: 'hover:border-sky-500/50 hover:bg-sky-500/5',
              emerald: 'hover:border-emerald-500/50 hover:bg-emerald-500/5',
              violet: 'hover:border-violet-500/50 hover:bg-violet-500/5',
              cyan: 'hover:border-cyan-500/50 hover:bg-cyan-500/5',
              pink: 'hover:border-pink-500/50 hover:bg-pink-500/5',
              amber: 'hover:border-amber-500/50 hover:bg-amber-500/5',
              rose: 'hover:border-rose-500/50 hover:bg-rose-500/5',
              teal: 'hover:border-teal-500/50 hover:bg-teal-500/5',
            };
            const iconColors: Record<string, string> = {
              sky: 'text-sky-400 bg-sky-500/10',
              emerald: 'text-emerald-400 bg-emerald-500/10',
              violet: 'text-violet-400 bg-violet-500/10',
              cyan: 'text-cyan-400 bg-cyan-500/10',
              pink: 'text-pink-400 bg-pink-500/10',
              amber: 'text-amber-400 bg-amber-500/10',
              rose: 'text-rose-400 bg-rose-500/10',
              teal: 'text-teal-400 bg-teal-500/10',
            };

            return (
              <button
                key={action.name}
                onClick={() => action.action ? action.action() : navigate(action.path!)}
                className={cn(
                  "p-4 glass-panel rounded-xl transition-all text-center group",
                  colorClasses[action.color]
                )}
              >
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform", iconColors[action.color])}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium text-white whitespace-nowrap">{action.name}</p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">{action.shortcut}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Performance Monitor */}
      <PerformanceMonitor data={performanceHistory} />

      {/* Install Server Dialog */}
      {showInstallDialog && (
        <InstallServerDialog onClose={() => setShowInstallDialog(false)} />
      )}

      {/* Clone Options Modal */}
      {cloneModalServer && (
        <CloneOptionsModal
          isOpen={true}
          onClose={() => setCloneModalServer(null)}
          sourceServer={cloneModalServer}
          allServers={servers}
          onCloneServer={handleCloneServer}
          onTransferSettings={handleTransferSettings}
          onExtractData={handleExtractData}
        />
      )}
    </motion.div>
  );
}
