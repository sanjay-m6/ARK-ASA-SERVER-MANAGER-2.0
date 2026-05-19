import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Server, Activity, Cpu, HardDrive, Zap, Terminal, Copy, Puzzle,
  Play, Square, RotateCw, Clock, Database, FileEdit,
  TrendingUp, Folder, FolderOpen, Heart, Bookmark, Search
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useServerStore } from '../stores/serverStore';
import { useUIStore } from '../stores/uiStore';
import { cn } from '../utils/helpers';
import { getAllServers, getSystemInfo, startServer, stopServer, restartServer, cloneServer, transferSettings, extractSaveData } from '../utils/tauri';
import { listen } from '@tauri-apps/api/event';
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





export default function Dashboard() {
  const { servers, setServers, updateServerStatus, refreshServers } = useServerStore();
  const { systemInfo, setSystemInfo } = useUIStore();
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Organization States
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchOrgSnapshot = async () => {
    try {
      const snap = await import('../utils/serverOrganization').then(m => m.getOrganizationSnapshot());
      setSnapshot(snap);
    } catch (e) {
      console.error('Failed to load organization snapshot:', e);
    }
  };

  useEffect(() => {
    fetchOrgSnapshot();
  }, [servers]);

  const filteredServers = servers.filter(server => {
    // Exclude archived servers
    const isArchived = snapshot?.servers?.find((s: any) => s.id === server.id)?.archive_info;
    if (isArchived) return false;

    // Search query
    const cust = snapshot?.servers?.find((s: any) => s.id === server.id)?.customization;
    const displayName = cust?.display_name || server.name;
    const matchesSearch = displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (server.config.mapName || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Folder category
    if (selectedFolderId !== null) {
      const serverFolderIds = snapshot?.servers?.find((s: any) => s.id === server.id)?.folder_ids || [];
      if (!serverFolderIds.includes(selectedFolderId)) return false;
    }

    return true;
  });

  // ... (rest of hook logic remains same until return)

  const handleCopyIp = (serverIp: string | undefined, port: number) => {
    const ip = serverIp || '127.0.0.1';
    const address = `${ip}:${port}`;
    navigator.clipboard.writeText(address);
    toast.success(t('dashboard.copiedToClipboard', { address }));
  };

  // Server control handlers (Keep existing logic)
  const handleStartServer = async (serverId: number) => {
    try {
      updateServerStatus(serverId, 'starting');
      await startServer(serverId);
      // Don't set to 'running' — keep 'starting' until detection confirms 'online'
      toast.success(t('dashboard.serverStarted'));
    } catch (error) {
      updateServerStatus(serverId, 'stopped');
      toast.error(t('dashboard.failed', { error: String(error) }));
    }
  };

  const handleStopServer = async (serverId: number) => {
    try {
      await stopServer(serverId);
      updateServerStatus(serverId, 'stopped');
      toast.success(t('dashboard.serverStopped'));
    } catch (error) {
      toast.error(t('dashboard.failed', { error }));
    }
  };

  const handleRestartServer = async (serverId: number) => {
    try {
      updateServerStatus(serverId, 'starting');
      await restartServer(serverId);
      // Don't set to 'running' — keep 'starting' until detection confirms 'online'
      toast.success(t('dashboard.serverRestarted'));
    } catch (error) {
      toast.error(t('dashboard.failed', { error }));
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
      toast.success(t('dashboard.serverCloned', { name: newServer.name }));
    } catch (error) {
      toast.error(t('dashboard.failedClone', { error }));
    }
  };

  const handleTransferSettings = async (targetServerId: number) => {
    if (!cloneModalServer) return;
    try {
      await transferSettings(cloneModalServer.id, targetServerId);
      toast.success(t('dashboard.settingsTransferred'));
    } catch (error) {
      toast.error(t('dashboard.failedTransfer', { error }));
    }
  };

  const handleExtractData = async (targetServerId: number) => {
    if (!cloneModalServer) return;
    try {
      await extractSaveData(cloneModalServer.id, targetServerId);
      toast.success(t('dashboard.saveDataExtracted'));
    } catch (error) {
      toast.error(t('dashboard.failedExtract', { error }));
    }
  };

  // Effects (Keep existing logic)
  useEffect(() => {
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
            cpu: Math.round(info.cpuUsage * 10) / 10,
            memory: Math.round((info.ramUsage / info.ramTotal) * 1000) / 10,
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

    // Sync with backend state (initial, uses refreshServers to preserve existing statuses)
    refreshServers();

    // Subscribe to real-time status updates
    let unlistenStatus: () => void;
    let unlistenLogAnomaly: () => void;

    const setupListener = async () => {
      unlistenStatus = await listen<{ server_id: number, status: any }>('server-status-change', (event) => {
        console.log('⚡ Server Status Update:', event.payload);
        updateServerStatus(event.payload.server_id, event.payload.status);
      });

      unlistenLogAnomaly = await listen<any>('log_anomaly', async (event) => {
        console.log('🔥 Log Anomaly Detected:', event.payload);
        const { server_id, anomaly_type, details } = event.payload;
        
        toast.error(`Anomaly (${anomaly_type}) detected on Server ${server_id}! AI is analyzing...`, { 
            duration: 6000,
            icon: '🔥'
        });

        // Trigger AI analysis asynchronously
        import('../stores/aiStore').then(({ useAiStore }) => {
            import('../utils/aiAgent').then(async ({ sendAiMessage, generateMessageId, buildSystemPrompt }) => {
                const aiStore = useAiStore.getState();
                
                const prompt = `A ${anomaly_type} anomaly was just detected on Server ${server_id}.\nDetails:\n\`\`\`\n${details}\n\`\`\`\nPlease analyze this log anomaly and provide a diagnosis or recommended fix.`;
                
                aiStore.addMessage({
                    id: generateMessageId(),
                    role: 'user',
                    content: prompt,
                    timestamp: Date.now()
                });

                try {
                    const apiMessages = [
                        { role: 'system', content: buildSystemPrompt() },
                        ...aiStore.messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content })),
                        { role: 'user', content: prompt }
                    ];

                    const response = await sendAiMessage(apiMessages, aiStore.model);
                    
                    if (response.content) {
                        aiStore.addMessage({
                            id: generateMessageId(),
                            role: 'assistant',
                            content: `**[Automated Crash Diagnosis]**\n\n${response.content}`,
                            timestamp: Date.now()
                        });
                        toast.success(`AI Diagnosis ready for Server ${server_id}! Open AI Assistant to view.`, { 
                            duration: 10000,
                            icon: '🤖'
                        });
                    }
                } catch (error) {
                    console.error('Failed to get AI diagnosis:', error);
                }
            });
        });
      });
    };
    setupListener();

    // Poll every 10s for smooth chart data (60 points = 10 min history)
    const perfInterval = setInterval(fetchSystemInfo, 10000);
    // Poll for updates (heartbeat)
    const serverInterval = setInterval(refreshServers, 3000);

    return () => {
      clearInterval(perfInterval);
      clearInterval(serverInterval);
      if (unlistenStatus) unlistenStatus();
      if (unlistenLogAnomaly) unlistenLogAnomaly();
    };
  }, [setServers, setSystemInfo, updateServerStatus, refreshServers]);

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

  const runningServers = servers.filter(s => s.status === 'running' || s.status === 'online').length;
  const stoppedServers = servers.filter(s => s.status === 'stopped').length;
  const totalServers = servers.length;
  const memoryPercent = systemInfo ? (systemInfo.ramUsage / systemInfo.ramTotal) * 100 : 0;
  const diskPercent = systemInfo ? (systemInfo.diskUsage / systemInfo.diskTotal) * 100 : 0;

  // Quick actions config
  const quickActions = [
    { name: t('dashboard.deployServer'), icon: Zap, path: null, action: () => setShowInstallDialog(true), color: 'sky', shortcut: 'D' },
    { name: t('dashboard.serverManager'), icon: Server, path: '/servers', action: null, color: 'emerald', shortcut: 'S' },
    { name: t('dashboard.configEditor'), icon: FileEdit, path: '/config', action: null, color: 'violet', shortcut: 'C' },
    { name: t('dashboard.rconConsole'), icon: Terminal, path: '/rcon', action: null, color: 'cyan', shortcut: 'R' },
    { name: t('dashboard.modManager'), icon: Puzzle, path: '/mods', action: null, color: 'pink', shortcut: 'M' },
    { name: t('dashboard.backups'), icon: Database, path: '/backups', action: null, color: 'amber', shortcut: 'B' },
    { name: t('dashboard.scheduler'), icon: Clock, path: '/scheduler', action: null, color: 'rose', shortcut: 'T' },
  ];

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Sponsor Banner */}
      <SponsorBanner />

      {/* Stats Grid - 6 Cards */}
      {/* Stats Grid - 6 Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Servers */}
        <div className="glass-panel rounded-xl p-4 group hover:border-sky-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-sky-500/10 rounded-lg">
              <Server className="w-4 h-4 text-sky-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">{t('dashboard.totalServers')}</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalServers}</p>
          <p className="text-xs text-slate-500 mt-1">{t('dashboard.serversLabel')}</p>
        </div>

        {/* Running */}
        <div className="glass-panel rounded-xl p-4 group hover:border-green-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Activity className="w-4 h-4 text-green-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">{t('dashboard.runningLabel')}</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{runningServers}</p>
          <p className="text-xs text-slate-500 mt-1">{t('dashboard.onlineLabel')}</p>
        </div>

        {/* Stopped */}
        <div className="glass-panel rounded-xl p-4 group hover:border-slate-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-slate-500/10 rounded-lg">
              <Square className="w-4 h-4 text-slate-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">{t('dashboard.stoppedLabel')}</span>
          </div>
          <p className="text-2xl font-bold text-slate-400">{stoppedServers}</p>
          <p className="text-xs text-slate-500 mt-1">{t('dashboard.offlineLabel')}</p>
        </div>

        {/* CPU */}
        <div className="glass-panel rounded-xl p-4 group hover:border-violet-500/30 transition-all">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-violet-500/10 rounded-lg">
              <Cpu className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">{t('dashboard.cpu')}</span>
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
            <span className="text-xs text-slate-400 uppercase tracking-wider">{t('dashboard.ram')}</span>
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
            <span className="text-xs text-slate-400 uppercase tracking-wider">{t('dashboard.disk')}</span>
          </div>
          <p className="text-2xl font-bold text-white">{diskPercent.toFixed(0)}%</p>
          <div className="w-full bg-slate-700/50 rounded-full h-1 mt-2">
            <div className="bg-amber-500 h-1 rounded-full transition-all" style={{ width: `${diskPercent}%` }}></div>
          </div>
        </div>
      </div>

      {/* Server Control Hub */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <span className="text-sky-400 font-mono font-black leading-none mt-0.5">{'>_'}</span>
            <span className="tracking-wide">{t('dashboard.serverControlHub', 'Server Control Hub')}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search server..."
                className="pl-9 pr-4 py-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500/30 w-48"
              />
            </div>
            <button
              onClick={() => navigate('/tools/organization')}
              className="text-xs font-semibold px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl transition-all"
            >
              Organize Nodes
            </button>
            <button
              onClick={() => navigate('/servers')}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1 focus:outline-none"
            >
              {t('dashboard.manageAll', 'Manage All →')}
            </button>
          </div>
        </div>

        {/* Folders category filters */}
        {snapshot?.folders && snapshot.folders.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 p-2 bg-white/[0.01] border border-white/5 rounded-2xl">
            <button
              onClick={() => setSelectedFolderId(null)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none',
                selectedFolderId === null
                  ? 'bg-sky-500 text-slate-900'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
              )}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>All Nodes</span>
            </button>
            {snapshot.folders.map((folder: any) => {
              const isActive = selectedFolderId === folder.id;
              return (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none border border-transparent',
                    isActive
                      ? 'text-slate-900'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300'
                  )}
                  style={isActive ? { backgroundColor: folder.color } : { borderLeft: `3px solid ${folder.color}` }}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>{folder.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {
          filteredServers.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-xl">
              <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">{t('dashboard.noServers')}</h3>
              <p className="text-slate-500 text-sm mb-4">{t('dashboard.deployFirst')}</p>
              <button
                onClick={() => setShowInstallDialog(true)}
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg transition-all text-sm font-medium focus:outline-none"
              >
                {t('dashboard.deployServer')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredServers.map((server) => {
                const cust = snapshot?.servers?.find((s: any) => s.id === server.id)?.customization;
                const displayName = cust?.display_name || server.name;
                const hasColor = !!cust?.color_tag;

                return (
                  <div
                    key={server.id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all group gap-4 lg:gap-0 relative overflow-hidden"
                  >
                    {/* Custom Brand line indicator */}
                    {hasColor && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ backgroundColor: cust.color_tag }}
                      />
                    )}

                    <div className="flex items-center gap-4 pl-2">
                      <div className="relative">
                        <div className={cn(
                          'w-2.5 h-2.5 rounded-full',
                          server.status === 'online' && 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
                          server.status === 'running' && 'bg-amber-500 animate-pulse',
                          server.status === 'stopped' && 'bg-slate-500',
                          server.status === 'crashed' && 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
                          server.status === 'starting' && 'bg-amber-500 animate-pulse',
                          server.status === 'updating' && 'bg-sky-500 animate-pulse',
                          server.status === 'repairing' && 'bg-orange-500 animate-pulse'
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-200">{displayName}</h3>
                          {cust?.favorite && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                          {cust?.is_pinned && <Bookmark className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                          <p className="text-xs text-slate-400">{server.config.mapName} • {t('common.port', 'Port')} {server.ports.gamePort}</p>
                          {cust?.tags && cust.tags.map((tg: string) => (
                            <span key={tg} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-slate-400 font-medium">
                              {tg}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {/* IP Display + Copy */}
                      <div className="hidden md:flex items-center h-[34px] bg-[#1a202c] rounded px-3 border border-white/5">
                        <span className="text-xs font-mono text-slate-300 mr-2">
                          {server.ipAddress || '127.0.0.1'}:{server.ports.gamePort}
                        </span>
                        <button
                          onClick={() => handleCopyIp(server.ipAddress, server.ports.gamePort)}
                          className="text-slate-500 hover:text-sky-400 transition-colors focus:outline-none"
                          title={t('dashboard.copyIp')}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Server Controls */}
                      <div className="flex items-center gap-2.5">
                        {/* Start/Stop/Restart Buttons */}
                        {(server.status === 'stopped' || server.status === 'crashed') ? (
                          <button
                            onClick={() => handleStartServer(server.id)}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-[#17302b] hover:bg-[#1f423b] text-emerald-400 border border-[#234c44] rounded shadow-sm transition-all focus:outline-none"
                            title={t('common.start')}
                          >
                            <Play className="w-4 h-4 fill-current ml-0.5 mt-0.5" />
                          </button>
                        ) : (server.status === 'running' || server.status === 'online') ? (
                          <>
                            <button
                              onClick={() => handleRestartServer(server.id)}
                              className="w-[34px] h-[34px] flex items-center justify-center bg-[#332514] hover:bg-[#4a361d] text-amber-400 border border-[#5c4324] rounded shadow-sm transition-all focus:outline-none"
                              title={t('common.restart')}
                            >
                              <RotateCw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStopServer(server.id)}
                              className="w-[34px] h-[34px] flex items-center justify-center bg-[#311719] hover:bg-[#472224] text-rose-400 border border-[#5a2a2d] rounded shadow-sm transition-all focus:outline-none"
                              title={t('common.stop')}
                            >
                              <Square className="w-4 h-4 fill-current" />
                            </button>
                          </>
                        ) : (
                          <button
                            disabled
                            className="w-[34px] h-[34px] flex items-center justify-center bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded opacity-50 cursor-not-allowed focus:outline-none"
                          >
                            <RotateCw className="w-4 h-4 animate-spin" />
                          </button>
                        )}

                        {/* Status Badge */}
                        <div className={cn(
                          "w-[85px] h-[34px] rounded text-[10px] font-bold tracking-[0.05em] border uppercase flex items-center justify-center",
                          server.status === 'online' ? 'bg-[#17302b] text-emerald-400 border-[#234c44]' :
                            server.status === 'running' ? 'bg-[#332514] text-amber-400 border-[#5c4324]' :
                              server.status === 'crashed' ? 'bg-[#311719] text-rose-400 border-[#5a2a2d]' :
                                'bg-[#1a202c] text-slate-400 border-white/5'
                        )}>
                          <span>
                            {server.status === 'online' ? t('dashboard.statusOnline', 'ONLINE') :
                              server.status === 'running' ? t('dashboard.statusLoading', 'STARTING') :
                                t(`serverManager.serverStatus.${server.status}`, server.status.toUpperCase() || 'UNKNOWN')}
                          </span>
                        </div>

                        {/* Clone Button */}
                        <button
                          onClick={() => openCloneModal(server)}
                          className="w-[34px] h-[34px] flex items-center justify-center bg-[#172738] hover:bg-[#1a3147] text-sky-400 border border-[#20405c] rounded shadow-sm transition-all focus:outline-none"
                          title={t('dashboard.cloneTransferExtract', 'Clone / Extract')}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </div>

      {/* Quick Actions Panel - 8 Actions */}
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          {t('dashboard.quickActions')}
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
      {
        showInstallDialog && (
          <InstallServerDialog onClose={() => setShowInstallDialog(false)} />
        )
      }

      {/* Clone Options Modal */}
      {
        cloneModalServer && (
          <CloneOptionsModal
            isOpen={true}
            onClose={() => setCloneModalServer(null)}
            sourceServer={cloneModalServer}
            allServers={servers}
            onCloneServer={handleCloneServer}
            onTransferSettings={handleTransferSettings}
            onExtractData={handleExtractData}
          />
        )
      }
    </motion.div>
  );
}
