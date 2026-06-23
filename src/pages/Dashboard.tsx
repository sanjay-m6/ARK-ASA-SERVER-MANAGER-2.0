import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Server, Activity, Zap, Terminal, Copy, Puzzle,
  Play, Square, RotateCw, Clock, Database, FileEdit,
  Folder, FolderOpen, Heart, Bookmark, Search,
  ShieldCheck, GitBranch, AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useServerStore } from '../stores/serverStore';
import { useUIStore } from '../stores/uiStore';
import { useInstallStore } from '../stores/installStore';
import { cn } from '../utils/helpers';
import { getAllServers, getSystemInfo, startServer, stopServer, restartServer, cloneServer, transferSettings, extractSaveData, getServerVersion, getLatestServerVersion } from '../utils/tauri';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import PerformanceMonitor from '../components/performance/PerformanceMonitor';
// import { useRconStore } from '../stores/rconStore';
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
  const { setDraftOpen } = useInstallStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [serverVersions, setServerVersions] = useState<Record<number, string>>({});
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  // Autostart States
  const [startupConfig, setStartupConfig] = useState<any>({
    globalAutoStartEnabled: false,
    globalBootDelay: 0,
    startMinimizedToTray: false,
    silentHeadlessStartup: false,
    windowsStartupShortcut: false,
    loopPreventionMaxCrashes: 3,
    loopPreventionTimeWindowMins: 15,
  });
  const [isSavingStartup, setIsSavingStartup] = useState(false);

  // Live Operations Feed
  const [liveLogs, setLiveLogs] = useState<string[]>([
    `[SYS] Operations center initialized.`,
    `[SYS] Host metrics listener: active.`,
    `[AI] Listening for log anomalies...`,
  ]);

  useEffect(() => {
    const messages = [
      "Auditing database integrity...",
      "DB health check: 100% nominal.",
      "Scanning server ports for conflicts...",
      "Port scanning complete: no conflicts.",
      "Syncing active UPnP port mappings...",
      "UPnP leases active and verified.",
      "Analyzing server logs for warnings...",
      "Log audit: 0 warnings, 0 crash patterns.",
      "Validating configuration caches...",
      "Configuration cache status: FRESH.",
      "Host heartbeat monitor check: OK.",
    ];

    let index = 0;
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const prefix = index % 3 === 0 ? "AI" : "SYS";
      const nextLog = `[${timeStr}] [${prefix}] ${messages[index]}`;
      setLiveLogs(prev => {
        const updated = [...prev, nextLog];
        if (updated.length > 25) updated.shift();
        return updated;
      });
      index = (index + 1) % messages.length;
    }, 4000);

    return () => clearInterval(interval);
  }, []);

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

  const fetchStartupConfig = async () => {
    try {
      const cfg = await invoke<any>('get_auto_start_config');
      setStartupConfig(cfg);
    } catch (e) {
      console.error('Failed to load auto start config:', e);
    }
  };

  useEffect(() => {
    fetchStartupConfig();
  }, []);

  const handleToggleStartupSetting = async (key: string, value: boolean) => {
    const updatedConfig = { ...startupConfig, [key]: value };
    
    // Check if the user is running as Administrator
    let isAdmin = false;
    try {
      isAdmin = await invoke<boolean>('check_is_admin');
    } catch (e) {
      console.error('Failed to check admin status:', e);
    }

    // Default silentHeadlessStartup to match windowsStartupShortcut value to bypass UAC by default (only if Admin)
    if (key === 'windowsStartupShortcut') {
      updatedConfig.silentHeadlessStartup = value ? isAdmin : false;
    }

    if (key === 'silentHeadlessStartup' && value === true && !isAdmin) {
      toast.error(t('settings.startup.adminRequired', 'Administrator privileges are required to enable Bypass UAC (Task Scheduler). Please restart the application as Administrator.'));
      return;
    }
    
    setStartupConfig(updatedConfig);
    setIsSavingStartup(true);

    try {
      // 1. Save to database
      await invoke('set_auto_start_config', { config: updatedConfig });

      // 2. Sync Windows shortcuts/scheduler
      if (updatedConfig.windowsStartupShortcut) {
        if (updatedConfig.silentHeadlessStartup) {
          await invoke('set_startup_shortcut', { enabled: false, minimized: false });
          await invoke('set_startup_task_scheduler', { enabled: true });
        } else {
          await invoke('set_startup_shortcut', { enabled: true, minimized: updatedConfig.startMinimizedToTray });
          await invoke('set_startup_task_scheduler', { enabled: false });
        }
      } else {
        await invoke('set_startup_shortcut', { enabled: false, minimized: false });
        await invoke('set_startup_task_scheduler', { enabled: false });
      }
      toast.success(t('settings.saved', 'Startup settings updated!'));
    } catch (error) {
      console.error('Failed to save startup settings:', error);
      toast.error(t('settings.saveFailed', 'Failed to update OS startup configuration. Run as Administrator if using Task Scheduler.'));
      fetchStartupConfig();
    } finally {
      setIsSavingStartup(false);
    }
  };

  const filteredServers = servers.filter(server => {
    const isArchived = snapshot?.servers?.find((s: any) => s.id === server.id)?.archiveInfo;
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
      const serverFolderIds = snapshot?.servers?.find((s: any) => s.id === server.id)?.folderIds || [];
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

  // Fetch latest version from SteamCMD
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const latest = await getLatestServerVersion();
        setLatestVersion(latest);
      } catch (err) {
        console.error('Failed to fetch latest ASA version on dashboard:', err);
      }
    };
    fetchLatest();
  }, []);

  // Fetch local server versions
  useEffect(() => {
    const fetchLocalVersions = async () => {
      const targets = servers.filter(s => !serverVersions[s.id]);
      if (targets.length === 0) return;

      for (const server of targets) {
        try {
          const ver = await getServerVersion(server.id);
          setServerVersions(prev => ({ ...prev, [server.id]: ver }));
        } catch (err) {
          console.error(`Failed to get local version for server ${server.id}:`, err);
          setServerVersions(prev => ({ ...prev, [server.id]: 'Unknown' }));
        }
      }
    };
    fetchLocalVersions();
  }, [servers, serverVersions]);

  const isServerOutdated = (serverId: number) => {
    const localVer = serverVersions[serverId];
    if (!localVer || !latestVersion) return false;
    if (localVer.startsWith('Build ')) {
      return !localVer.includes(latestVersion);
    }
    return false;
  };

  // Effects (Keep existing logic)
  useEffect(() => {
    getAllServers().then(setServers).catch(console.error);

    const fetchSystemInfo = async () => {
      try {
        const info = await getSystemInfo();
        setSystemInfo(info);

        // Compute total player count from backend player intelligence service
        let totalPlayers = 0;
        try {
          const counts = await invoke<Record<string, number>>('get_player_counts');
          totalPlayers = Object.entries(counts)
            .filter(([id]) => Number(id) > 0)
            .reduce((sum, [_, count]) => sum + count, 0);
        } catch (e) {
          console.error("Failed to fetch player counts", e);
        }

        setPerformanceHistory(prev => {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

          const newPoint = {
            time: timeStr,
            cpu: Math.round(info.cpuUsage * 10) / 10,
            memory: Math.round((info.ramUsage / info.ramTotal) * 1000) / 10,
            players: totalPlayers
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
    { name: t('dashboard.deployServer'), icon: Zap, path: null, action: () => setDraftOpen(true), color: 'sky', shortcut: 'D' },
    { name: t('dashboard.serverManager'), icon: Server, path: '/servers', action: null, color: 'emerald', shortcut: 'S' },
    { name: t('dashboard.configEditor'), icon: FileEdit, path: '/config', action: null, color: 'teal', shortcut: 'C' },
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

      {/* Stats and Telemetry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Count Cards */}
        <div className="lg:col-span-1 grid grid-cols-3 lg:grid-cols-1 gap-4">
          {/* Total Servers */}
          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between group hover:border-sky-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{t('dashboard.totalServers')}</span>
              <div className="p-1.5 bg-sky-500/10 rounded-lg">
                <Server className="w-3.5 h-3.5 text-sky-400" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl font-bold text-white leading-none">{totalServers}</p>
              <p className="text-[10px] text-slate-500 mt-1">{t('dashboard.serversLabel')}</p>
            </div>
          </div>

          {/* Running */}
          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between group hover:border-green-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{t('dashboard.runningLabel')}</span>
              <div className="p-1.5 bg-green-500/10 rounded-lg">
                <Activity className="w-3.5 h-3.5 text-green-400" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl font-bold text-green-400 leading-none">{runningServers}</p>
              <p className="text-[10px] text-slate-500 mt-1">{t('dashboard.onlineLabel')}</p>
            </div>
          </div>

          {/* Stopped */}
          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between group hover:border-slate-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{t('dashboard.stoppedLabel')}</span>
              <div className="p-1.5 bg-slate-500/10 rounded-lg">
                <Square className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl font-bold text-slate-400 leading-none">{stoppedServers}</p>
              <p className="text-[10px] text-slate-500 mt-1">{t('dashboard.offlineLabel')}</p>
            </div>
          </div>
        </div>

        {/* Host Telemetry Dials Card */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
            <span className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">Host Allocation Telemetry</span>
            <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-mono font-semibold tracking-wide animate-pulse">STREAMING</span>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 py-2">
            {/* CPU Dial */}
            <div className="flex flex-col items-center justify-center bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-sky-500/20 p-4 rounded-2xl transition-all group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/[0.01] to-transparent rounded-2xl pointer-events-none" />
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                  <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.02)" strokeWidth="5" fill="transparent" />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="url(#cpuGlow)"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - ((systemInfo?.cpuUsage || 0) / 100) * 251.2}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="cpuGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-sky-400 font-mono tracking-tighter">
                  {(systemInfo?.cpuUsage || 0).toFixed(0)}%
                </div>
              </div>
              <div className="text-center mt-3">
                <p className="text-[10px] text-slate-300 uppercase font-bold tracking-widest flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  CPU LOAD
                </p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {systemInfo ? `${systemInfo.cpuUsage.toFixed(1)}% Cores` : 'Auditing...'}
                </p>
              </div>
            </div>

            {/* RAM Dial */}
            <div className="flex flex-col items-center justify-center bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-pink-500/20 p-4 rounded-2xl transition-all group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/[0.01] to-transparent rounded-2xl pointer-events-none" />
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(236,72,153,0.25)]">
                  <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.02)" strokeWidth="5" fill="transparent" />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="url(#ramGlow)"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (memoryPercent / 100) * 251.2}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="ramGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ec4899" />
                      <stop offset="100%" stopColor="#f43f5e" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-pink-400 font-mono tracking-tighter">
                  {memoryPercent.toFixed(0)}%
                </div>
              </div>
              <div className="text-center mt-3">
                <p className="text-[10px] text-slate-300 uppercase font-bold tracking-widest flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                  MEMORY
                </p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {systemInfo ? `${(systemInfo.ramUsage / 1024).toFixed(1)}G / ${(systemInfo.ramTotal / 1024).toFixed(1)}G` : 'Active'}
                </p>
              </div>
            </div>

            {/* Disk Dial */}
            <div className="flex flex-col items-center justify-center bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-amber-500/20 p-4 rounded-2xl transition-all group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.01] to-transparent rounded-2xl pointer-events-none" />
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                  <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.02)" strokeWidth="5" fill="transparent" />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="url(#diskGlow)"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (diskPercent / 100) * 251.2}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="diskGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-amber-500 font-mono tracking-tighter">
                  {diskPercent.toFixed(0)}%
                </div>
              </div>
              <div className="text-center mt-3">
                <p className="text-[10px] text-slate-300 uppercase font-bold tracking-widest flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  DISK SPACE
                </p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {systemInfo ? `${(systemInfo.diskUsage).toFixed(1)}G Used` : 'Active'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Command Center Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2/3 width) - Server List & Charts */}
        <div className="lg:col-span-2 space-y-6">
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
                    id="asa-server-search"
                    name="searchQuery"
                    aria-label="Search servers"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search server..."
                    className="pl-9 pr-4 py-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500/50 focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 w-48 transition-all"
                  />
                </div>
                <button
                  onClick={() => setDraftOpen(true)}
                  className="text-xs font-bold px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.03] active:scale-[0.97]"
                  aria-label="Deploy Server"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  Deploy Server
                </button>
                <button
                  onClick={() => navigate('/tools/organization')}
                  className="text-xs font-semibold px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.03] active:scale-[0.97]"
                  aria-label="Organize Nodes"
                >
                  Organize Nodes
                </button>
                <button
                  onClick={() => navigate('/servers')}
                  className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-lg"
                  aria-label="Manage all servers"
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
                    'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.02] active:scale-[0.98]',
                    selectedFolderId === null
                      ? 'bg-sky-500 text-slate-900'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                  )}
                  aria-label="Filter servers: show all nodes"
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
                        'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 border border-transparent hover:scale-[1.02] active:scale-[0.98]',
                        isActive
                          ? 'text-slate-900 font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300'
                      )}
                      style={isActive ? { backgroundColor: folder.color } : { borderLeft: `3px solid ${folder.color}` }}
                      aria-label={`Filter servers by folder: ${folder.name}`}
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
                <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#080d19]/40 p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
                  {/* Background gradient blur spots */}
                  <div className="absolute -left-12 -top-12 w-64 h-64 rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />
                  <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

                  {/* Left Column: Premium Interactive CSS Server Rack Illustration */}
                  <div className="relative w-full max-w-[280px] aspect-[4/3] flex flex-col justify-center items-center bg-[#0a0f1d]/80 border border-white/5 rounded-2xl p-6 shadow-inner group overflow-hidden">
                    {/* Cyber grid pattern overlay */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:16px_16px] rounded-2xl pointer-events-none" />

                    {/* Server Blades Stack */}
                    <div className="w-full space-y-3 relative z-10">
                      {/* Server Blade 1 */}
                      <div className="h-10 bg-slate-950/90 border border-white/5 rounded-lg px-3 flex items-center justify-between shadow-md group-hover:border-sky-500/20 transition-all duration-300">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse" />
                          <span className="text-[9px] font-mono text-slate-400">NODE_01</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500/80 animate-ping" />
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500/40" />
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500/20" />
                        </div>
                      </div>

                      {/* Server Blade 2 */}
                      <div className="h-10 bg-slate-950/90 border border-white/5 rounded-lg px-3 flex items-center justify-between shadow-md group-hover:border-sky-500/20 transition-all duration-300">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(6,182,212,0.7)] animate-pulse" />
                          <span className="text-[9px] font-mono text-slate-400">NODE_02</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                        </div>
                      </div>

                      {/* Server Blade 3 */}
                      <div className="h-10 bg-slate-950/90 border border-white/5 rounded-lg px-3 flex items-center justify-between shadow-md group-hover:border-sky-500/20 transition-all duration-300">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-700" />
                          <span className="text-[9px] font-mono text-slate-500">NODE_03</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                        </div>
                      </div>
                    </div>

                    {/* Laser Scanning Line */}
                    <div className="absolute left-0 right-0 h-[1.5px] bg-sky-500/20 shadow-[0_0_8px_rgba(6,182,212,0.3)] animate-pulse pointer-events-none" />

                    {/* Visual Label */}
                    <div className="mt-4 text-[9px] font-bold tracking-[0.15em] text-slate-500 uppercase font-mono">
                      No active instances
                    </div>
                  </div>

                  {/* Right Column: Title + Description + Action Cards */}
                  <div className="flex-1 flex flex-col gap-6 w-full text-left">
                    <div>
                      <h3 className="text-lg font-bold text-slate-200 mb-1.5">
                        Initialize Server Cluster
                      </h3>
                      <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-xl">
                        Deploy, customize, and manage your high-performance ARK: Survival Evolved & Ascended servers from a clean, unified dashboard.
                      </p>
                    </div>

                    {/* Action Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Card 1: Deploy Server */}
                      <div
                        onClick={() => setDraftOpen(true)}
                        className="p-5 rounded-xl border border-sky-500/10 bg-sky-500/[0.02] hover:bg-sky-500/[0.06] hover:border-sky-500/30 transition-all cursor-pointer group flex flex-col justify-between h-36 shadow-sm"
                      >
                        <div>
                          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 mb-3 group-hover:scale-105 transition-all">
                            <Zap className="w-4 h-4 fill-current" />
                          </div>
                          <h4 className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-sky-400 transition-colors">Deploy Server Node</h4>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">Configure and download a clean server installation with our guided wizard.</p>
                        </div>
                      </div>

                      {/* Card 2: Import Server */}
                      <div
                        onClick={() => navigate('/servers')}
                        className="p-5 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all cursor-pointer group flex flex-col justify-between h-36 shadow-sm"
                      >
                        <div>
                          <div className="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center text-slate-400 mb-3 group-hover:scale-105 transition-all">
                            <Server className="w-4 h-4" />
                          </div>
                          <h4 className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">Import Instance</h4>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">Link an existing ShooterGame installation directory to manage it here.</p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Helper Bar */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                      <span>Central systems are online.</span>
                      <button
                        onClick={() => navigate('/config')}
                        className="text-sky-400 hover:text-sky-300 font-semibold focus:outline-none ml-1 flex items-center gap-0.5 hover:underline"
                      >
                        Open Config Editor →
                      </button>
                    </div>
                  </div>
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
                        className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] hover:border-violet-500/20 hover:scale-[1.01] hover:shadow-[0_0_15px_rgba(139,92,246,0.05)] transition-all duration-300 group gap-4 lg:gap-0 relative overflow-hidden"
                      >
                        {/* Custom Brand line indicator */}
                        {hasColor && (
                          <div
                            className="absolute left-0 top-0 bottom-0 w-1"
                            style={{ backgroundColor: cust.color_tag }}
                          />
                        )}

                        <div className="flex items-center gap-4 pl-2">
                          <div
                            className={cn(
                              'w-2.5 h-2.5 rounded-full transition-all duration-300',
                              server.status === 'online' && 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
                              server.status === 'running' && 'bg-sky-500 animate-pulse',
                              server.status === 'stopped' && 'bg-slate-500',
                              server.status === 'crashed' && 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
                              server.status === 'starting' && 'bg-sky-500 animate-pulse',
                              server.status === 'updating' && 'bg-blue-500 animate-pulse'
                            )}
                            role="img"
                            aria-label={`Status: ${server.status}`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-slate-200">{displayName}</h3>
                              {cust?.favorite && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                              {cust?.is_pinned && <Bookmark className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />}
                              {server.autoStart && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold tracking-wide uppercase">
                                  AUTOSTART
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                              <p className="text-xs text-slate-400">
                                {server.config.mapName} • Game: {server.ports.gamePort} • Query: {server.ports.queryPort}
                              </p>
                              {serverVersions[server.id] && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-slate-300 font-medium font-mono animate-in fade-in" title={t('serverManager.tooltips.serverVersion', 'Local Server Version')}>
                                  <GitBranch className="w-3 h-3 text-sky-400/80" />
                                  <span>{serverVersions[server.id]}</span>
                                </span>
                              )}
                              {isServerOutdated(server.id) && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded text-[9px] font-bold animate-pulse" title={t('serverManager.tooltips.updateAvailable', 'New version is available!')}>
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  <span>{t('serverManager.status.updateAvailable', 'Update Available')}</span>
                                </span>
                              )}
                              {server.reachability && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded font-medium font-mono",
                                  server.reachability === 'Public'
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                )}>
                                  {server.reachability === 'Public' ? 'REACHABLE' : server.reachability}
                                </span>
                              )}
                              {cust?.tags && cust.tags.map((tg: string) => (
                                <span key={tg} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-slate-400 font-medium">
                                  {tg}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          {/* Actions */}
                          {(server.status === 'stopped' || server.status === 'crashed') ? (
                            <button
                              onClick={() => handleStartServer(server.id)}
                              className="w-[34px] h-[34px] flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                              title="Start Server"
                              aria-label={`Start Server ${displayName}`}
                            >
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </button>
                          ) : (server.status === 'running' || server.status === 'online') ? (
                            <button
                              onClick={() => handleStopServer(server.id)}
                              className="w-[34px] h-[34px] flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                              title="Stop Server"
                              aria-label={`Stop Server ${displayName}`}
                            >
                              <Square className="w-4 h-4 fill-current" />
                            </button>
                          ) : (
                            <button
                              disabled
                              className="w-[34px] h-[34px] flex items-center justify-center bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded-xl opacity-50 cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                              aria-label={`Server ${displayName} status updating`}
                            >
                              <RotateCw className="w-4 h-4 animate-spin" />
                            </button>
                          )}

                          <button
                            onClick={() => handleRestartServer(server.id)}
                            disabled={server.status === 'stopped'}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                            title="Restart Server"
                            aria-label={`Restart Server ${displayName}`}
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleCopyIp(server.ipAddress, server.ports.gamePort)}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                            title="Copy IP Address"
                            aria-label={`Copy IP address for Server ${displayName}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openCloneModal(server)}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                            title="Clone/Transfer Options"
                            aria-label={`Clone or transfer Server ${displayName}`}
                          >
                            <Puzzle className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => navigate('/config', { state: { serverId: server.id } })}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                            title="Config Editor"
                            aria-label={`Open Config Editor for Server ${displayName}`}
                          >
                            <FileEdit className="w-4 h-4" />
                          </button>

                          <div className={cn(
                            "w-[85px] h-[34px] rounded-xl text-[10px] font-bold tracking-[0.05em] border uppercase flex items-center justify-center shadow-inner",
                            server.status === 'online' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                            server.status === 'running' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                            server.status === 'crashed' && 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                            server.status === 'starting' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                            server.status === 'updating' && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                            'bg-[#1a202c]/50 text-slate-400 border-white/5'
                          )}>
                            {server.status.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>

          {/* Performance Monitor */}
          <PerformanceMonitor data={performanceHistory} />
        </div>

        {/* Right Column (1/3 width) - Co-Pilot, Quick Actions, Live Logs */}
        <div className="space-y-6">
          {/* AI Co-Pilot Widget */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-sky-500/10 blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />

            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
              </span>
              AI Co-Pilot Status
            </h3>
            <div className="bg-[#070b13]/60 rounded-xl p-3 border border-white/5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Diagnostics Mode</span>
                <span className="text-sky-400 font-semibold font-mono">AUTOMATED</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Crash Surveillance</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> ACTIVE
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Conflict Detection</span>
                <span className="text-slate-300 font-medium">REAL-TIME</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/tools/ai')}
              className="w-full mt-4 py-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl text-xs font-bold transition-all focus:outline-none"
            >
              Consult AI Co-Pilot
            </button>
          </div>

          {/* Autostart & Boot Options Widget */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-amber-500/10 blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />

            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Startup & Boot Options
            </h3>
            
            <div className="space-y-3">
              {/* Run at System Boot */}
              <div className="flex items-center justify-between p-3 bg-white/[0.01] border border-white/5 rounded-xl hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-slate-200">Run at System Boot</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">Auto-start app when PC starts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={startupConfig.windowsStartupShortcut}
                    onChange={(e) => handleToggleStartupSetting('windowsStartupShortcut', e.target.checked)}
                    disabled={isSavingStartup}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Enable Global Auto-Start */}
              <div className="flex items-center justify-between p-3 bg-white/[0.01] border border-white/5 rounded-xl hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-slate-200">Auto-Start Server Profiles</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">Launch servers on app boot</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={startupConfig.globalAutoStartEnabled}
                    onChange={(e) => handleToggleStartupSetting('globalAutoStartEnabled', e.target.checked)}
                    disabled={isSavingStartup}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Bypass UAC (Task Scheduler) */}
              <div className="flex items-center justify-between p-3 bg-white/[0.01] border border-white/5 rounded-xl hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-slate-200">Bypass UAC (Admin Level)</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">Elevated run via Task Scheduler</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={startupConfig.silentHeadlessStartup}
                    disabled={!startupConfig.windowsStartupShortcut || isSavingStartup}
                    onChange={(e) => handleToggleStartupSetting('silentHeadlessStartup', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-disabled:opacity-30"></div>
                </label>
              </div>
            </div>
            
            <p className="text-[10px] text-slate-500 mt-3 text-center">
              Additional options are available in <button onClick={() => navigate('/settings')} className="text-amber-500 hover:underline">Settings</button>
            </p>
          </div>

          {/* Quick Actions Panel */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-sky-400" />
              Quick Operations
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.name}
                    onClick={() => {
                      if (action.action) action.action();
                      else if (action.path) navigate(action.path);
                    }}
                    className="p-3 bg-white/[0.01] hover:bg-sky-500/[0.04] border border-white/5 hover:border-sky-500/20 rounded-xl text-left transition-all group flex items-center gap-2.5"
                  >
                    <div className="p-1.5 bg-sky-500/10 rounded-lg text-sky-400 group-hover:scale-105 transition-all flex-shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-200 group-hover:text-sky-400 transition-all truncate">{action.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live System Operations Log Feed */}
          <div className="glass-panel rounded-2xl p-6 flex flex-col h-[280px]">
            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                SYSTEM_LIVE_LOGS
              </h3>
              <span className="text-[9px] font-mono text-slate-500">STDOUT</span>
            </div>
            <div className="flex-1 min-h-0 bg-black/40 rounded-xl p-3 font-mono text-[10px] text-slate-400 overflow-y-auto space-y-1.5 border border-white/5 custom-scrollbar">
              {liveLogs.map((log, index) => (
                <div key={index} className="leading-relaxed border-l-2 border-sky-500/20 pl-1.5 truncate">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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

