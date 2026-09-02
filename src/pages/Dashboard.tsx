import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Server, Activity, Zap, Copy, Puzzle,
  Play, Square, RotateCw, FileEdit, Edit2, Check, X,
  Folder, FolderOpen, Heart, Bookmark, Search,
  GitBranch, AlertTriangle, RefreshCw, Timer, CheckCheck
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useServerStore } from '../stores/serverStore';
import { useUIStore } from '../stores/uiStore';
import { useInstallStore } from '../stores/installStore';
import { useServerOrganizationStore } from '../stores/serverOrganizationStore';
import { updateServerCustomization as apiUpdateServerCustomization } from '../utils/serverOrganization';
import { cn } from '../utils/helpers';
import { getAllServers, getSystemInfo, startServer, stopServer, restartServer, cloneServer, transferSettings, extractSaveData, openInExplorer } from '../utils/tauri';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { invoke } from '@tauri-apps/api/core';
import PerformanceMonitor from '../components/performance/PerformanceMonitor';
import CloneOptionsModal from '../components/server/CloneOptionsModal';
import SponsorBanner from '../components/ui/SponsorBanner';
import ServerOrganizationBar from '../components/server/ServerOrganizationBar';
import { TimedShutdownModal } from '../components/server/TimedShutdownModal';
import { ServerTimedShutdownBanner } from '../components/server/ServerTimedShutdownBanner';
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

  // Status Filter & Copied States
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'stopped' | 'outdated'>('all');
  const [copiedServerId, setCopiedServerId] = useState<number | null>(null);

  const filteredServers = servers.filter(server => {
    const isArchived = snapshot?.servers?.find((s: any) => s.id === server.id)?.archiveInfo;
    if (isArchived) return false;

    // Status filter
    if (statusFilter === 'online') {
      if (server.status !== 'online' && server.status !== 'running') return false;
    } else if (statusFilter === 'stopped') {
      if (server.status !== 'stopped' && server.status !== 'crashed') return false;
    } else if (statusFilter === 'outdated') {
      if (!isServerOutdated(server.id)) return false;
    }

    // Search query
    const cust = snapshot?.servers?.find((s: any) => s.id === server.id)?.customization;
    const displayName = cust?.display_name || server.name;
    const searchLower = searchQuery.toLowerCase().trim();
    if (searchLower) {
      const matchesSearch = displayName.toLowerCase().includes(searchLower) ||
        server.name.toLowerCase().includes(searchLower) ||
        (server.config.mapName || '').toLowerCase().includes(searchLower) ||
        (server.config.sessionName || '').toLowerCase().includes(searchLower) ||
        String(server.ports.gamePort).includes(searchLower) ||
        String(server.ports.queryPort).includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Folder category
    if (selectedFolderId !== null) {
      const serverFolderIds = snapshot?.servers?.find((s: any) => s.id === server.id)?.folderIds || [];
      if (!serverFolderIds.includes(selectedFolderId)) return false;
    }

    return true;
  });

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

  const handleCopyIp = (serverId: number, serverIp: string | undefined, port: number) => {
    const ip = serverIp || '127.0.0.1';
    const address = `${ip}:${port}`;
    navigator.clipboard.writeText(address);
    setCopiedServerId(serverId);
    setTimeout(() => {
      setCopiedServerId(prev => (prev === serverId ? null : prev));
    }, 2000);
    toast.success(t('dashboard.copiedToClipboard', { address, defaultValue: `Copied ${address} to clipboard!` }), { id: `copy-ip-${serverId}` });
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
  const [timedShutdownServer, setTimedShutdownServer] = useState<ServerType | null>(null);

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

    refreshServers();

    // Poll every 10s for smooth chart data (60 points = 10 min history)
    const perfInterval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchSystemInfo();
    }, 10000);
    // Poll for server status updates
    const serverInterval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshServers();
    }, 10000);

    return () => {
      clearInterval(perfInterval);
      clearInterval(serverInterval);
    };
  }, [setServers, setSystemInfo, updateServerStatus, refreshServers]);

  // Safe real-time event subscriptions
  useTauriEvent<{ server_id: number, status: any }>(
    'server-status-change',
    (payload) => {
      console.log('⚡ Server Status Update:', payload);
      updateServerStatus(payload.server_id, payload.status);
    }
  );

  useTauriEvent<{ server_id: number, error_type: string, details: string, suggestions: string[] }>(
    'mod_load_failure',
    (payload) => {
      console.error('🧩 Mod Load Failure:', payload);
      const { server_id, error_type, details, suggestions } = payload;
      const srv = servers.find(s => s.id === server_id);
      const serverName = srv ? srv.name : `Server ${server_id}`;

      import('../stores/crashNotificationStore').then(({ useCrashNotificationStore }) => {
        useCrashNotificationStore.getState().handleCrashEvent({
          serverId: server_id,
          serverName,
          anomalyType: error_type,
          details: `${details}\n\nSuggestions:\n${suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
        });
      });
    }
  );

  useTauriEvent<any>(
    'log_anomaly',
    (payload) => {
      console.log('🔥 Log Anomaly Detected:', payload);
      const { server_id, anomaly_type, details } = payload;
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
    }
  );

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

  const onlineServersCount = servers.filter(s => s.status === 'running' || s.status === 'online').length;
  const stoppedServersCount = servers.filter(s => s.status === 'stopped' || s.status === 'crashed').length;
  const runningServers = onlineServersCount;
  const stoppedServers = stoppedServersCount;
  const outdatedServersCount = servers.filter(s => isServerOutdated(s.id)).length;
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
          <div className="glass-panel rounded-2xl p-4 flex flex-col justify-between group hover:border-sky-500/30 transition-all border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">{t('dashboard.totalServers')}</span>
              <div className="p-1.5 bg-sky-500/10 rounded-lg">
                <Server className="w-3.5 h-3.5 text-sky-500" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-black text-[var(--text-primary)] leading-none">{totalServers}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">{t('dashboard.serversLabel')}</p>
            </div>
          </div>

          {/* Running */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col justify-between group hover:border-green-500/30 transition-all border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">{t('dashboard.runningLabel')}</span>
              <div className="p-1.5 bg-green-500/10 rounded-lg">
                <Activity className="w-3.5 h-3.5 text-green-500" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-black text-green-500 leading-none">{runningServers}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">{t('dashboard.onlineLabel')}</p>
            </div>
          </div>

          {/* Stopped */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col justify-between group hover:border-slate-500/30 transition-all border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">{t('dashboard.stoppedLabel')}</span>
              <div className="p-1.5 bg-slate-500/10 rounded-lg">
                <Square className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-black text-[var(--text-muted)] leading-none">{stoppedServers}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">{t('dashboard.offlineLabel')}</p>
            </div>
          </div>
        </div>

        {/* Host Telemetry Dials Card */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-4 sm:p-5 flex flex-col border border-[var(--border)] shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3">
            <span className="text-xs text-[var(--text-primary)] uppercase tracking-wider font-bold">Host Allocation Telemetry</span>
            <span className="text-[10px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wide">STREAMING</span>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 py-1">
            {/* CPU Dial */}
            <div className="flex flex-col items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-sky-500/30 p-4 rounded-2xl transition-all group relative overflow-hidden shadow-sm">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                  <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="5" fill="transparent" />
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
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-[var(--text-primary)] font-mono tracking-tighter">
                  {(systemInfo?.cpuUsage || 0).toFixed(0)}%
                </div>
              </div>
              <div className="text-center mt-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  CPU LOAD
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] font-mono mt-0.5 font-bold">
                  {systemInfo ? `${systemInfo.cpuUsage.toFixed(1)}% Cores` : 'Auditing...'}
                </p>
              </div>
            </div>

            {/* RAM Dial */}
            <div className="flex flex-col items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-pink-500/30 p-4 rounded-2xl transition-all group relative overflow-hidden shadow-sm">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(236,72,153,0.25)]">
                  <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="5" fill="transparent" />
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
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-[var(--text-primary)] font-mono tracking-tighter">
                  {memoryPercent.toFixed(0)}%
                </div>
              </div>
              <div className="text-center mt-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                  MEMORY
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] font-mono mt-0.5 font-bold">
                  {systemInfo ? `${(systemInfo.ramUsage / 1024).toFixed(1)}G / ${(systemInfo.ramTotal / 1024).toFixed(1)}G` : 'Active'}
                </p>
              </div>
            </div>

            {/* Disk Dial */}
            <div className="flex flex-col items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-amber-500/30 p-4 rounded-2xl transition-all group relative overflow-hidden shadow-sm">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                  <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="5" fill="transparent" />
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
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-[var(--text-primary)] font-mono tracking-tighter">
                  {diskPercent.toFixed(0)}%
                </div>
              </div>
              <div className="text-center mt-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  DISK SPACE
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] font-mono mt-0.5 font-bold">
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
        <div className="glass-panel rounded-2xl p-6 border border-[var(--border)] shadow-xl relative">
          {/* Header Row */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4 border-b border-[var(--border)] pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500/15 border border-sky-500/30 rounded-2xl text-sky-500 shadow-sm">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="tracking-wide">{t('dashboard.serverControlHub', 'Server Control Hub')}</span>
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Real-time cluster monitoring and instance management
                </p>
              </div>
            </div>

            {/* Quick Filter Tabs & Search & Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status Filter Chips */}
              <div className="flex items-center p-1 gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-inner">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm",
                    statusFilter === 'all'
                      ? "bg-sky-500 text-white shadow-sky-500/25"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  )}
                >
                  <span>All</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-black/10 dark:bg-white/15 leading-none">
                    {servers.length}
                  </span>
                </button>

                <button
                  onClick={() => setStatusFilter('online')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm",
                    statusFilter === 'online'
                      ? "bg-emerald-500 text-white shadow-emerald-500/25"
                      : "text-[var(--text-secondary)] hover:text-emerald-500 hover:bg-[var(--surface-hover)]"
                  )}
                >
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    statusFilter === 'online' ? "bg-white" : "bg-emerald-500"
                  )} />
                  <span>Online</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-black/10 dark:bg-white/15 leading-none">
                    {onlineServersCount}
                  </span>
                </button>

                <button
                  onClick={() => setStatusFilter('stopped')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm",
                    statusFilter === 'stopped'
                      ? "bg-slate-600 dark:bg-slate-700 text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                  )}
                >
                  <span>Offline</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-black/10 dark:bg-white/15 leading-none">
                    {stoppedServersCount}
                  </span>
                </button>

                {outdatedServersCount > 0 && (
                  <button
                    onClick={() => setStatusFilter('outdated')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm",
                      statusFilter === 'outdated'
                        ? "bg-amber-500 text-slate-950 shadow-amber-500/25"
                        : "text-amber-500 hover:bg-[var(--surface-hover)]"
                    )}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Outdated</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-black/10 dark:bg-white/15 leading-none">
                      {outdatedServersCount}
                    </span>
                  </button>
                )}
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  id="asa-server-search"
                  name="searchQuery"
                  aria-label="Search servers"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search servers..."
                  className="pl-9 pr-8 py-2 bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 w-44 sm:w-52 transition-all shadow-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Deploy Server Button */}
              <button
                onClick={() => setDraftOpen(true)}
                className="text-xs font-bold px-4 py-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 rounded-xl transition-all shadow-md shadow-sky-500/20 flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                aria-label="Deploy Server"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Deploy Server</span>
              </button>

              {/* Server Organization Button */}
              <button
                onClick={() => navigate('/tools/organization')}
                className="text-xs font-bold px-3.5 py-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] hover:border-sky-500/30 rounded-xl transition-all flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm"
                aria-label="Server Organization Page"
              >
                <Folder className="w-3.5 h-3.5 text-sky-500" />
                <span>Organization</span>
              </button>

              {/* Manage All Button */}
              <button
                onClick={() => navigate('/servers')}
                className="text-xs font-bold px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/25 hover:border-sky-500/40 rounded-xl transition-all flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm"
                aria-label="Manage all servers"
              >
                <span>{t('dashboard.manageAll', 'Manage All')}</span>
                <span className="text-sky-500">→</span>
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
            servers.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12 shadow-sm">
                {/* Visual illustration and info */}
                <div className="flex-1 flex flex-col gap-6 w-full text-left">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1.5">
                      Initialize Server Cluster
                    </h3>
                    <p className="text-[var(--text-secondary)] text-xs sm:text-sm leading-relaxed max-w-xl">
                      Deploy, customize, and manage your high-performance ARK: Survival Evolved & Ascended servers from a clean, unified dashboard.
                    </p>
                  </div>

                  {/* Action Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div
                      onClick={() => setDraftOpen(true)}
                      className="p-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 hover:border-sky-500/40 transition-all cursor-pointer group flex flex-col justify-between h-36 shadow-sm"
                    >
                      <div>
                        <div className="w-8 h-8 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-500 mb-3 group-hover:scale-105 transition-all">
                          <Zap className="w-4 h-4 fill-current" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] group-hover:text-sky-500 transition-colors">Deploy Server Node</h4>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">Configure and download a clean server installation with our guided wizard.</p>
                      </div>
                    </div>

                    <div
                      onClick={() => navigate('/servers')}
                      className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] hover:border-sky-500/30 transition-all cursor-pointer group flex flex-col justify-between h-36 shadow-sm"
                    >
                      <div>
                        <div className="w-8 h-8 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-400 mb-3 group-hover:scale-105 transition-all">
                          <Server className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] transition-colors">Import Instance</h4>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">Link an existing ShooterGame installation directory to manage it here.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="p-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-center flex flex-col items-center justify-center shadow-sm">
                <Search className="w-8 h-8 text-[var(--text-muted)] mb-3" />
                <h4 className="text-sm font-bold text-[var(--text-primary)]">No servers match your criteria</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">
                  Try adjusting your search query or reset status filters to view all configured server profiles.
                </p>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); setSelectedFolderId(null); }}
                    className="px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredServers.map((server) => {
                  const cust = snapshot?.servers?.find((s: any) => s.id === server.id)?.customization;
                  const displayName = cust?.display_name || server.name;
                  const hasColor = !!cust?.color_tag;
                  const isOnline = server.status === 'online' || server.status === 'running';
                  const isStarting = server.status === 'starting';
                  const isUpdating = server.status === 'updating';
                  const isStopping = stoppingServers.includes(server.id);
                  const isCrashed = server.status === 'crashed' || server.status === 'startup_timeout';

                  return (
                    <div
                      key={server.id}
                      className={cn(
                        "relative flex flex-col xl:flex-row xl:items-center justify-between p-4 sm:p-5 glass-panel border rounded-2xl transition-all duration-200 group gap-4 xl:gap-6 hover:shadow-lg hover:border-sky-500/40 z-10",
                        server.status === 'online' ? "border-emerald-500/30" :
                        isStarting || isUpdating ? "border-sky-500/30" :
                        isCrashed ? "border-rose-500/30" :
                        "border-[var(--border)]"
                      )}
                    >
                      {/* Custom Brand color indicator if configured */}
                      {hasColor && (
                        <div
                          className="absolute left-1.5 top-3 bottom-3 w-1.5 rounded-full opacity-90 shadow-sm"
                          style={{ backgroundColor: cust.color_tag }}
                        />
                      )}

                      {/* Left: Server Details & Metadata */}
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                        {/* Status Node Icon */}
                        <div className="relative shrink-0 mt-0.5 sm:mt-0">
                          <div className={cn(
                            "w-3.5 h-3.5 rounded-full transition-all duration-300",
                            server.status === 'online' && "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)] ring-4 ring-emerald-500/20",
                            isStarting && "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.9)] ring-4 ring-sky-500/20 animate-pulse",
                            isUpdating && "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.9)] ring-4 ring-blue-500/20 animate-pulse",
                            isCrashed && "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)] ring-4 ring-rose-500/20 animate-pulse",
                            server.status === 'stopped' && "bg-slate-400 dark:bg-slate-600 ring-2 ring-black/5 dark:ring-white/5"
                          )} />
                        </div>

                        {/* Title & Badges */}
                        <div className="min-w-0 flex-1">
                          {editingServerId === server.id ? (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editServerName}
                                onChange={(e) => setEditServerName(e.target.value)}
                                onKeyDown={(e) => handleRenameKeyDown(e, server)}
                                onBlur={() => handleRenameSave(server)}
                                autoFocus
                                className="text-sm font-bold bg-[var(--input-background)] border border-sky-500 rounded-lg px-2.5 py-1 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-sky-500/40 min-w-[200px]"
                              />
                              <button
                                onClick={() => handleRenameSave(server)}
                                className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-emerald-500/40 rounded-lg transition-colors cursor-pointer"
                                title="Save Profile Name"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingServerId(null)}
                                className="p-1.5 bg-[var(--surface-hover)] text-[var(--text-muted)] rounded-lg transition-colors cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Profile Title with click-to-rename */}
                              <div className="flex items-center gap-1.5 group/title">
                                <h3
                                  className="font-bold text-[var(--text-primary)] text-sm sm:text-base hover:text-sky-500 cursor-pointer transition-colors"
                                  onClick={(e) => handleRenameStart(server, e)}
                                  onDoubleClick={(e) => handleRenameStart(server, e)}
                                  title="Click to rename profile"
                                >
                                  {displayName}
                                </h3>
                                <button
                                  onClick={(e) => handleRenameStart(server, e)}
                                  className="p-1 text-[var(--text-muted)] hover:text-sky-500 hover:bg-sky-500/10 rounded-md transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                                  title="Rename Profile"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Explorer Folder Shortcut */}
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
                                  className="p-1.5 bg-[var(--surface)] hover:bg-sky-500/20 text-[var(--text-muted)] hover:text-sky-500 border border-[var(--border)] hover:border-sky-500/30 rounded-lg transition-all shrink-0 cursor-pointer shadow-sm"
                                  title={`Open server install folder:\n${server.installPath}`}
                                >
                                  <FolderOpen className="w-3 h-3 text-sky-500" />
                                </button>
                              )}

                              {/* Favorite & Pin Badges */}
                              {cust?.favorite && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                              {cust?.is_pinned && <Bookmark className="w-3.5 h-3.5 text-sky-500 fill-sky-500" />}
                              {server.autoStart && (
                                <span className="text-[9px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold tracking-wide uppercase">
                                  AUTOSTART
                                </span>
                              )}
                            </div>
                          )}

                          {/* Metadata Badges & Tags */}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {/* Map Badge */}
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs font-semibold text-[var(--text-secondary)] shadow-sm">
                              <span>🗺️</span>
                              <span>{server.config.mapName || 'CustomMap'}</span>
                            </span>

                            {/* Session Name if different */}
                            {server.config.sessionName && server.config.sessionName !== server.name && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs font-semibold text-[var(--text-secondary)] shadow-sm">
                                <span>🎮</span>
                                <span>{server.config.sessionName}</span>
                              </span>
                            )}

                            {/* Ports Tag */}
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[11px] font-mono text-[var(--text-muted)] shadow-sm">
                              <span>Port: {server.ports.gamePort}</span>
                              <span className="text-[var(--text-muted)] opacity-40">|</span>
                              <span>Query: {server.ports.queryPort}</span>
                            </span>

                            {/* Version Badge */}
                            {serverVersions[server.id] && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-500/10 border border-sky-500/25 rounded-lg text-xs font-mono font-bold text-sky-600 dark:text-sky-400 shadow-sm" title={t('serverManager.tooltips.serverVersion', 'Local Server Version')}>
                                <GitBranch className="w-3 h-3 text-sky-500" />
                                <span>{serverVersions[server.id]}</span>
                              </span>
                            )}

                            {/* Update Available Badge */}
                            {isServerOutdated(server.id) && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-bold shadow-sm animate-pulse" title={t('serverManager.tooltips.updateAvailable', 'New version available on Steam!')}>
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>Update Available</span>
                              </span>
                            )}

                            {/* Reachability Badge */}
                            {server.reachability && (
                              <span className={cn(
                                "text-[10px] px-2.5 py-1 rounded-lg font-bold font-mono flex items-center gap-1.5 shadow-sm",
                                server.reachability === 'Public'
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25"
                              )}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", server.reachability === 'Public' ? "bg-emerald-500" : "bg-rose-500")} />
                                <span>{server.reachability === 'Public' ? 'PUBLIC' : server.reachability}</span>
                              </span>
                            )}

                            {/* Custom User Tags */}
                            {cust?.tags && cust.tags.map((tg: string) => (
                              <span key={tg} className="px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-[10px] text-[var(--text-muted)] font-medium">
                                #{tg}
                              </span>
                            ))}
                          </div>

                          <ServerTimedShutdownBanner serverId={server.id} className="mt-2" />
                        </div>
                      </div>

                      {/* Right: Quick Action Controls Cluster */}
                      <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap justify-end shrink-0 pl-2 xl:pl-0">
                        {/* Primary Start / Stop Action */}
                        {(server.status === 'stopped' || server.status === 'crashed') && !isStopping ? (
                          <button
                            onClick={() => handleStartServer(server.id)}
                            className="h-9 px-4 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                            title="Start Server"
                            aria-label={`Start Server ${displayName}`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Start</span>
                          </button>
                        ) : isOnline && !isStopping ? (
                          <div className="relative group/stop" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setTimedShutdownServer(server)}
                              className="h-9 px-4 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                              title="Stop / Shutdown Options"
                              aria-label={`Stop Server ${displayName}`}
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>Stop</span>
                            </button>

                            {/* Stop Options Dropdown */}
                            <div className="absolute top-full right-0 mt-2 w-52 bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-2xl opacity-0 invisible group-hover/stop:opacity-100 group-hover/stop:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/stop:scale-100">
                              <button
                                onClick={() => setTimedShutdownServer(server)}
                                className="w-full text-left px-3.5 py-2.5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors flex items-center gap-2 text-xs font-bold cursor-pointer"
                              >
                                <Timer className="w-4 h-4 text-amber-500 shrink-0" />
                                <div className="flex flex-col">
                                  <span>Timed Shutdown</span>
                                  <span className="text-[10px] text-[var(--text-muted)] font-normal">Countdown with broadcasts</span>
                                </div>
                              </button>
                              <button
                                onClick={() => handleStopServer(server.id)}
                                className="w-full text-left px-3.5 py-2.5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors flex items-center gap-2 border-t border-[var(--border)] text-xs font-bold cursor-pointer"
                              >
                                <Square className="w-4 h-4 fill-current text-rose-500 shrink-0" />
                                <div className="flex flex-col">
                                  <span>Immediate Stop</span>
                                  <span className="text-[10px] text-[var(--text-muted)] font-normal">Halt process right away</span>
                                </div>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "h-9 px-3.5 flex items-center gap-2 border rounded-xl font-bold text-xs transition-all shadow-sm",
                              isStarting && "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
                              isStopping && "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
                              isUpdating && "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
                              server.status === 'restarting' && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                              "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]"
                            )}
                          >
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>
                              {isStopping ? 'Stopping...' : isStarting ? 'Starting...' : isUpdating ? 'Updating...' : 'Processing...'}
                            </span>
                          </div>
                        )}

                        {/* Restart Dropdown */}
                        <div className="relative group/dropdown">
                          <button
                            disabled={server.status === 'stopped'}
                            className="h-9 w-9 flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                            title="Restart Options"
                            aria-label={`Restart options for Server ${displayName}`}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>

                          {/* Dropdown Menu */}
                          <div className="absolute top-full right-0 mt-2 w-52 bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-2xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/dropdown:scale-100">
                            <button
                              onClick={() => handleRestartServer(server.id)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-[var(--surface-hover)] text-[var(--text-primary)] transition-colors flex items-center gap-2 text-xs font-bold cursor-pointer"
                            >
                              <RotateCw className="w-3.5 h-3.5 text-sky-500" />
                              <span>{t('dashboard.normalRestart', 'Normal Restart')}</span>
                            </button>
                            <button
                              onClick={() => handleRestartServer(server.id, true)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors flex items-center gap-2 border-t border-[var(--border)] text-xs font-bold cursor-pointer"
                              title="Gracefully restart the server and wipe all wild dinosaurs"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                              <span>{t('dashboard.restartWipeDinos', 'Restart & Wipe Dinos')}</span>
                            </button>
                          </div>
                        </div>

                        {/* Copy IP / Address with Check Feedback */}
                        <button
                          onClick={() => handleCopyIp(server.id, server.ipAddress, server.ports.gamePort)}
                          className={cn(
                            "h-9 w-9 flex items-center justify-center border rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm",
                            copiedServerId === server.id
                              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-500"
                              : "bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border)]"
                          )}
                          title="Copy Direct IP Connection"
                          aria-label={`Copy IP address for Server ${displayName}`}
                        >
                          {copiedServerId === server.id ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Clone / Transfer Modal Button */}
                        <button
                          onClick={() => openCloneModal(server)}
                          className="h-9 w-9 flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                          title="Clone & Profile Transfer Tools"
                          aria-label={`Clone or transfer Server ${displayName}`}
                        >
                          <Puzzle className="w-3.5 h-3.5" />
                        </button>

                        {/* Config Editor Link Button */}
                        <button
                          onClick={() => navigate('/config', { state: { serverId: server.id } })}
                          className="h-9 w-9 flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                          title="Open in Config Editor"
                          aria-label={`Open Config Editor for Server ${displayName}`}
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                        </button>

                        {/* High-Contrast Status Capsule */}
                        <div className={cn(
                          "min-w-[90px] h-9 px-3 rounded-xl text-[10px] font-bold tracking-wider border uppercase flex items-center justify-center gap-1.5 shadow-sm select-none",
                          server.status === 'online' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                          server.status === 'running' && 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
                          isCrashed && 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
                          (isStarting || isUpdating) && 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
                          server.status === 'stopped' && 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]'
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            server.status === 'online' ? "bg-emerald-500" :
                            isCrashed ? "bg-rose-500 animate-ping" :
                            isStarting || isUpdating ? "bg-sky-500 animate-pulse" :
                            "bg-slate-400 dark:bg-slate-600"
                          )} />
                          <span>{server.status.toUpperCase()}</span>
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
            <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group border border-[var(--border)] shadow-sm">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-amber-500/10 blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />

              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Startup & Boot Options
              </h3>

              <div className="space-y-3">
                {/* Run at System Boot */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:bg-[var(--surface-hover)] transition-colors shadow-sm">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-[var(--text-primary)]">Run at System Boot</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">Auto-start app when PC starts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={startupConfig.windowsStartupShortcut}
                      onChange={(e) => handleToggleStartupSetting('windowsStartupShortcut', e.target.checked)}
                      disabled={isSavingStartup}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-400 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Enable Global Auto-Start */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:bg-[var(--surface-hover)] transition-colors shadow-sm">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-[var(--text-primary)]">Auto-Start Server Profiles</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">Launch servers on app boot</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={startupConfig.globalAutoStartEnabled}
                      onChange={(e) => handleToggleStartupSetting('globalAutoStartEnabled', e.target.checked)}
                      disabled={isSavingStartup}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-400 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Bypass UAC (Task Scheduler) */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:bg-[var(--surface-hover)] transition-colors shadow-sm">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-[var(--text-primary)]">Bypass UAC (Admin Level)</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">Elevated run via Task Scheduler</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={startupConfig.silentHeadlessStartup}
                      disabled={!startupConfig.windowsStartupShortcut || isSavingStartup}
                      onChange={(e) => handleToggleStartupSetting('silentHeadlessStartup', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-9 h-5 bg-slate-400 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-disabled:opacity-30"></div>
                  </label>
                </div>
              </div>

              <p className="text-[10px] text-[var(--text-secondary)] mt-3 text-center">
                Additional options are available in <button onClick={() => navigate('/settings')} className="text-amber-500 hover:underline font-bold cursor-pointer">Settings</button>
              </p>
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

      {timedShutdownServer && (
        <TimedShutdownModal
          isOpen={!!timedShutdownServer}
          onClose={() => setTimedShutdownServer(null)}
          serverId={timedShutdownServer.id}
          serverName={timedShutdownServer.name}
          serverType="ASA"
          onImmediateStop={() => handleStopServer(timedShutdownServer.id)}
        />
      )}
    </motion.div>
  );
}

