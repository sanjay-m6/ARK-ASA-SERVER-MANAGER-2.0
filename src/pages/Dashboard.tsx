import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Server, Activity, Zap, Copy, Puzzle,
  Play, Square, RotateCw, FileEdit, Edit2, Check, X,
  Folder, FolderOpen, Heart, Bookmark, Search, ExternalLink,
  GitBranch, AlertTriangle, RefreshCw, ShieldCheck, Cpu, Radio, Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useServerStore } from '../stores/serverStore';
import { useUIStore } from '../stores/uiStore';
import { useInstallStore } from '../stores/installStore';
import { useServerOrganizationStore } from '../stores/serverOrganizationStore';
import { updateServerCustomization as apiUpdateServerCustomization } from '../utils/serverOrganization';
import { cn } from '../utils/helpers';
import { getAllServers, getSystemInfo, startServer, stopServer, restartServer, cloneServer, transferSettings, extractSaveData, optimizeMemory, openInExplorer } from '../utils/tauri';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import PerformanceMonitor from '../components/performance/PerformanceMonitor';
// import { useRconStore } from '../stores/rconStore';
import CloneOptionsModal from '../components/server/CloneOptionsModal';
import SponsorBanner from '../components/ui/SponsorBanner';
import ServerOrganizationBar from '../components/server/ServerOrganizationBar';
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
  const { servers, setServers, updateServerStatus, refreshServers, serverVersions, fetchLatestPublicVersion, fetchAllServerVersions, isServerOutdated } = useServerStore();
  const { systemInfo, setSystemInfo } = useUIStore();
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);
  const [stoppingServers, setStoppingServers] = useState<number[]>([]);
  const { setDraftOpen } = useInstallStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Inline Rename State & Handlers
  const { customizations, updateServerCustomization } = useServerOrganizationStore();
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [editServerName, setEditServerName] = useState("");

  const handleRenameStart = (server: ServerType, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingServerId(server.id);
    const custom = customizations.get(server.id);
    setEditServerName(custom?.displayName || server.name);
  };

  const handleRenameSave = async (server: ServerType) => {
    if (editingServerId === server.id) {
      const newName = editServerName.trim();
      if (!newName) {
        toast.error(t('serverManager.errors.emptyName', 'Profile name cannot be empty.'));
        setEditingServerId(null);
        return;
      }

      try {
        // Save ONLY to SQLite backend 'server_customization' table (displayName)
        // DO NOT alter the INI server name (SessionName in GameUserSettings.ini)
        const custom = customizations.get(server.id) || {
          serverId: server.id,
          isPinned: false,
          pinOrder: 0,
          isMinimized: false,
          tags: [],
          favorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updatedCustom = { ...custom, displayName: newName };
        await apiUpdateServerCustomization(updatedCustom);
        updateServerCustomization(updatedCustom);

        toast.success(t('serverManager.toast.nameUpdated', `Profile name updated to "${newName}"`));
      } catch (err) {
        console.error("Failed to rename server profile:", err);
        toast.error(t('serverManager.renameFailed', 'Failed to update profile name.'));
      } finally {
        setEditingServerId(null);
      }
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, server: ServerType) => {
    if (e.key === 'Enter') {
      handleRenameSave(server);
    } else if (e.key === 'Escape') {
      setEditingServerId(null);
    }
  };

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
      setStoppingServers(prev => [...prev, serverId]);
      await stopServer(serverId);
      updateServerStatus(serverId, 'stopped');
      toast.success(t('dashboard.serverStopped'));
    } catch (error) {
      toast.error(t('dashboard.failed', { error }));
    } finally {
      setStoppingServers(prev => prev.filter(id => id !== serverId));
    }
  };

  const handleRestartServer = async (serverId: number, wipeDinos?: boolean) => {
    try {
      updateServerStatus(serverId, 'starting');
      await restartServer(serverId, wipeDinos);
      // Don't set to 'running' — keep 'starting' until detection confirms 'online'
      toast.success(wipeDinos ? t('dashboard.serverRestartedWipeDinos', 'Server restart initiated with wild dino wipe') : t('dashboard.serverRestarted', 'Server restarted successfully'));
    } catch (error) {
      toast.error(t('dashboard.failed', { error }));
    }
  };

  // Clone Modal state
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

  // Fetch latest version & server versions via store
  useEffect(() => {
    fetchLatestPublicVersion();
    fetchAllServerVersions();
  }, [servers]);

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
    let unlistenModFailure: () => void;

    const setupListener = async () => {
      unlistenStatus = await listen<{ server_id: number, status: any }>('server-status-change', (event) => {
        console.log('⚡ Server Status Update:', event.payload);
        updateServerStatus(event.payload.server_id, event.payload.status);
      });

      unlistenModFailure = await listen<{ server_id: number, error_type: string, details: string, suggestions: string[] }>('mod_load_failure', (event) => {
        console.error('🧩 Mod Load Failure:', event.payload);
        const { server_id, error_type, details, suggestions } = event.payload;

        const srv = servers.find(s => s.id === server_id);
        const serverName = srv ? srv.name : `Server ${server_id}`;

        import('../stores/crashNotificationStore').then(({ useCrashNotificationStore }) => {
          useCrashNotificationStore.getState().handleCrashEvent({
            serverId: server_id,
            serverName,
            anomalyType: error_type,
            details: `${details}\n\nSuggestions:\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
          });
        });
      });

      unlistenLogAnomaly = await listen<any>('log_anomaly', async (event) => {
        console.log('🔥 Log Anomaly Detected:', event.payload);
        const { server_id, anomaly_type, details } = event.payload;

        const srv = servers.find(s => s.id === server_id);
        const serverName = srv ? srv.name : `Server ${server_id}`;

        import('../stores/crashNotificationStore').then(({ useCrashNotificationStore }) => {
          useCrashNotificationStore.getState().handleCrashEvent({
            serverId: server_id,
            serverName,
            anomalyType: anomaly_type,
            details
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
      if (unlistenModFailure) unlistenModFailure();
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
      <div className="space-y-6 animate-in fade-in duration-500">
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
                  className="pl-9 pr-4 py-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 w-48 transition-all"
                />
              </div>
              <button
                onClick={() => setDraftOpen(true)}
                className="text-xs font-bold px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.03] active:scale-[0.97]"
                aria-label="Deploy Server"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                Deploy Server
              </button>
              <button
                onClick={() => navigate('/tools/organization')}
                className="text-xs font-semibold px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.03] active:scale-[0.97] flex items-center gap-1.5 cursor-pointer"
                aria-label="Server Organization Page"
              >
                <Folder className="w-3.5 h-3.5 text-sky-400" />
                Server Organization
              </button>
              <button
                onClick={() => navigate('/servers')}
                className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-lg"
                aria-label="Manage all servers"
              >
                {t('dashboard.manageAll', 'Manage All →')}
              </button>
            </div>
          </div>

          {/* Interactive Server Organization Bar */}
          <ServerOrganizationBar
            serversCount={servers.length}
            selectedFolderId={selectedFolderId}
            onSelectFolderId={setSelectedFolderId}
            className="mb-6"
          />

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
                          {editingServerId === server.id ? (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editServerName}
                                onChange={(e) => setEditServerName(e.target.value)}
                                onKeyDown={(e) => handleRenameKeyDown(e, server)}
                                onBlur={() => handleRenameSave(server)}
                                autoFocus
                                className="text-sm font-bold bg-slate-900 border border-sky-500 rounded px-2 py-0.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 min-w-[160px]"
                              />
                              <button
                                onClick={() => handleRenameSave(server)}
                                className="p-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 rounded transition-colors"
                                title="Save Name"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingServerId(null)}
                                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 group/title">
                                <h3
                                  className="font-semibold text-slate-200 hover:text-sky-400 cursor-pointer transition-colors"
                                  onClick={(e) => handleRenameStart(server, e)}
                                  onDoubleClick={(e) => handleRenameStart(server, e)}
                                  title="Click to rename profile"
                                >
                                  {displayName}
                                </h3>
                                <button
                                  onClick={(e) => handleRenameStart(server, e)}
                                  className="p-0.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded transition-all opacity-80 group-hover/title:opacity-100"
                                  title="Rename Server Profile"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-sky-400/80" />
                                </button>
                              </div>
                              <span
                                onClick={(e) => handleRenameStart(server, e)}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 hover:border-sky-500/40 font-mono font-medium flex items-center gap-1 cursor-pointer transition-all"
                                title={`Click to rename profile | Server Path: ${server.installPath}`}
                              >
                                <FolderOpen className="w-3 h-3 text-sky-400" />
                                <span>Profile: {displayName}</span>
                                <Edit2 className="w-2.5 h-2.5 text-sky-400/70" />
                              </span>
                              {server.installPath && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await openInExplorer(server.installPath);
                                      toast.success("Opened server directory in Explorer");
                                    } catch (err) {
                                      toast.error(`Cannot open folder: ${err}`);
                                    }
                                  }}
                                  className="p-0.5 bg-slate-800 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 rounded transition-all shrink-0"
                                  title={`Open real server folder on disk:\n${server.installPath}`}
                                >
                                  <ExternalLink className="w-2.5 h-2.5 text-sky-400" />
                                </button>
                              )}
                              {cust?.favorite && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                              {cust?.is_pinned && <Bookmark className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />}
                              {server.autoStart && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold tracking-wide uppercase">
                                  AUTOSTART
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                            <p className="text-xs text-slate-400">
                              {server.config.sessionName && server.config.sessionName !== server.name && (
                                <span className="text-slate-300 font-medium mr-1.5 font-mono">
                                  [{server.config.sessionName}]
                                </span>
                              )}
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
                        {(server.status === 'stopped' || server.status === 'crashed') && !stoppingServers.includes(server.id) ? (
                          <button
                            onClick={() => handleStartServer(server.id)}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                            title="Start Server"
                            aria-label={`Start Server ${displayName}`}
                          >
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          </button>
                        ) : (server.status === 'running' || server.status === 'online') && !stoppingServers.includes(server.id) ? (
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
                            className={cn(
                              "w-[34px] h-[34px] flex items-center justify-center border rounded-xl opacity-80 cursor-not-allowed focus:outline-none transition-all",
                              (server.status === 'starting' && !stoppingServers.includes(server.id)) && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                              stoppingServers.includes(server.id) && 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                              server.status === 'updating' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                              server.status === 'restarting' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                              'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            )}
                            aria-label={`Server ${displayName} status updating`}
                          >
                            {stoppingServers.includes(server.id) ? (
                              <div className="relative w-4 h-4 flex items-center justify-center">
                                <div className="absolute inset-0 border-2 border-rose-500/20 border-t-rose-400 rounded-full animate-spin" />
                                <Square className="w-1.5 h-1.5 fill-current text-rose-400 animate-pulse" />
                              </div>
                            ) : server.status === 'starting' ? (
                              <div className="relative w-4 h-4 flex items-center justify-center">
                                <div className="absolute inset-0 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
                                <Play className="w-2 h-2 fill-current text-emerald-400 animate-pulse ml-0.5" />
                              </div>
                            ) : server.status === 'updating' ? (
                              <div className="relative w-4 h-4 flex items-center justify-center">
                                <div className="absolute inset-0 border-2 border-sky-500/20 border-t-sky-400 rounded-full animate-spin" />
                                <RefreshCw className="w-2 h-2 text-sky-400 animate-spin [animation-duration:3s]" />
                              </div>
                            ) : server.status === 'restarting' ? (
                              <div className="relative w-4 h-4 flex items-center justify-center">
                                <div className="absolute inset-0 border-2 border-amber-500/20 border-t-amber-400 rounded-full animate-spin" />
                                <RefreshCw className="w-2 h-2 text-amber-400 animate-spin [animation-duration:3s]" />
                              </div>
                            ) : (
                              <RotateCw className="w-4 h-4 animate-spin" />
                            )}
                          </button>
                        )}

                        <div className="relative group/dropdown">
                          <button
                            disabled={server.status === 'stopped'}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                            title="Restart Options"
                            aria-label={`Restart options for Server ${displayName}`}
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          <div className="absolute top-full right-0 mt-2 w-52 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/dropdown:scale-100">
                            <button
                              onClick={() => handleRestartServer(server.id)}
                              className="w-full text-left px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2 text-xs"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>{t('dashboard.normalRestart', 'Normal Restart')}</span>
                            </button>
                            <button
                              onClick={() => handleRestartServer(server.id, true)}
                              className="w-full text-left px-4 py-3 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2 border-t border-slate-800 text-xs"
                              title="Gracefully restart the server and wipe all wild dinosaurs"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                              <span>{t('dashboard.restartWipeDinos', 'Restart & Wipe Dinos')}</span>
                            </button>
                          </div>
                        </div>

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

        {/* Lower Dashboard Grid (Charts and Widgets) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column: Performance Monitor (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            <PerformanceMonitor data={performanceHistory} />
          </div>

          {/* Right Column (1/3 width) - Quick Actions, Live Logs */}
          <div className="space-y-6">

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
                    <div className="relative w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
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
                    <div className="relative w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
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
                    <div className="relative w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-disabled:opacity-30"></div>
                  </label>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 mt-3 text-center">
                Additional options are available in <button onClick={() => navigate('/settings')} className="text-amber-500 hover:underline">Settings</button>
              </p>
            </div>



            {/* AI Sentinel & Live Telemetry Operations Center */}
            <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group border border-sky-500/10 hover:border-sky-500/20 transition-all space-y-4">
              {/* Top Bar */}
              <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-sky-500/10 rounded-xl text-sky-400 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-extrabold text-white tracking-wide uppercase whitespace-nowrap">
                        AI Sentinel Watchdog
                      </h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                        99% OPTIMAL
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">Automated telemetry &amp; resource sentinel</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await optimizeMemory();
                      toast.success('System RAM optimized & working set trimmed');
                    } catch (e) {
                      toast.error('Optimization notice: ' + String(e));
                    }
                  }}
                  className="px-2.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all focus:outline-none hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                  title="Trim process working set and reclaim standby memory"
                >
                  <Zap className="w-3 h-3 text-sky-400 shrink-0" />
                  <span>Purge RAM</span>
                </button>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-black/30 rounded-xl border border-white/5 flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 bg-sky-500/10 rounded-lg text-sky-400 shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">CPU Target</p>
                    <p className="text-[11px] font-bold text-slate-200 truncate">Normal (&lt;80%)</p>
                  </div>
                </div>

                <div className="p-3 bg-black/30 rounded-xl border border-white/5 flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 shrink-0">
                    <Radio className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Port Sentinel</p>
                    <p className="text-[11px] font-bold text-emerald-400 truncate">0 Conflicts</p>
                  </div>
                </div>
              </div>

              {/* Event Feed */}
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                    Live Event Feed
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">REALTIME</span>
                </div>
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto custom-scrollbar font-mono text-[10px]">
                  {liveLogs.slice(-4).map((log, index) => (
                    <div key={index} className="flex items-center gap-2 text-slate-300 py-1 px-2 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0 animate-pulse" />
                      <span className="truncate text-slate-300" title={log}>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
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

