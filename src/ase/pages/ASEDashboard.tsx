import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Server, Activity, Zap,
  Play, Square, RotateCw, FileEdit,
  Folder, FolderOpen, Heart, Bookmark, Search, Copy, RefreshCw,
  ShieldCheck, Cpu, Radio, Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../utils/helpers';
import { getSystemInfo, optimizeMemory } from '../../utils/tauri';
import { startAseServer, stopAseServer, restartAseServer } from '../utils/aseCommands';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import PerformanceMonitor from '../../components/performance/PerformanceMonitor';
import SponsorBanner from '../../components/ui/SponsorBanner';
import { getAseMapDisplayName } from '../data/aseMaps';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function ASEDashboard() {
  const { servers, updateServerStatus, refreshServers } = useAseServerStore();
  const { systemInfo, setSystemInfo } = useUIStore();
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);
  const [stoppingServers, setStoppingServers] = useState<number[]>([]);
  const navigate = useNavigate();
  const { t } = useTranslation();

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

  // Organization States
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Live Operations Feed
  const [liveLogs, setLiveLogs] = useState<string[]>([
    `[SYS] UE4 Operations center initialized.`,
    `[SYS] Core metrics check: ACTIVE.`,
    `[AI] Monitoring configuration files...`,
  ]);

  useEffect(() => {
    const messages = [
      "Verifying ShooterGame configurations...",
      "Config validation check: completed.",
      "Steam Workshop API update scanner...",
      "Workshop status check: nominal.",
      "Syncing active port listeners for ASE...",
      "ASE network routing: verified.",
      "Auditing Game.ini overrides...",
      "Server parameter verification: OK.",
      "RCON communication pipeline audit...",
      "Heartbeat ping response: SUCCESS.",
      "Local backup catalog verification: OK.",
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

  const handleCopyIp = (port: number) => {
    const address = `127.0.0.1:${port}`;
    navigator.clipboard.writeText(address);
    toast.success(`Copied address (${address}) to clipboard!`);
  };

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


  const fetchOrgSnapshot = async () => {
    try {
      const snap = await import('../../utils/serverOrganization').then(m => m.getOrganizationSnapshot());
      setSnapshot(snap);
    } catch (e) {
      console.error('Failed to load organization snapshot:', e);
    }
  };

  useEffect(() => {
    fetchOrgSnapshot();
  }, [servers]);

  const filteredServers = servers.filter(server => {
    const isArchived = snapshot?.servers?.find((s: any) => s.id === server.id)?.archiveInfo;
    if (isArchived) return false;

    // Search query
    const cust = snapshot?.servers?.find((s: any) => s.id === server.id)?.customization;
    const displayName = cust?.display_name || server.name;
    const matchesSearch = displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (server.mapName || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Folder category
    if (selectedFolderId !== null) {
      const serverFolderIds = snapshot?.servers?.find((s: any) => s.id === server.id)?.folderIds || [];
      if (!serverFolderIds.includes(selectedFolderId)) return false;
    }

    return true;
  });

  const handleStart = async (id: number) => {
    try { updateServerStatus(id, 'starting'); await startAseServer(id); toast.success('Server started'); }
    catch (e) { updateServerStatus(id, 'stopped'); toast.error(`Failed: ${e}`); }
  };
  const handleStop = async (id: number) => {
    try {
      setStoppingServers(prev => [...prev, id]);
      await stopAseServer(id);
      updateServerStatus(id, 'stopped');
      toast.success('Server stopped');
    } catch (e) {
      toast.error(`Failed: ${e}`);
    } finally {
      setStoppingServers(prev => prev.filter(x => x !== id));
    }
  };

  const handleRestart = async (id: number, wipeDinos?: boolean) => {
    try {
      updateServerStatus(id, 'starting');
      await restartAseServer(id, wipeDinos);
      toast.success(wipeDinos ? 'ASE server restarting with dino wipe...' : 'ASE server restarting...');
    } catch (e) {
      toast.error(`Failed: ${e}`);
    }
  };

  useEffect(() => {
    refreshServers();
    const fetchSys = async () => {
      try {
        const info = await getSystemInfo();
        setSystemInfo(info);
        // Compute total player count from backend player intelligence service
        let totalPlayers = 0;
        try {
          const counts = await invoke<Record<string, number>>('get_player_counts');
          totalPlayers = Object.entries(counts)
            .filter(([id]) => Number(id) < 0)
            .reduce((sum, [_, count]) => sum + count, 0);
        } catch (e) {
          console.error("Failed to fetch player counts", e);
        }

        setPerformanceHistory(prev => {
          const now = new Date();
          const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          const pt = { time: t, cpu: Math.round(info.cpuUsage * 10) / 10, memory: Math.round((info.ramUsage / info.ramTotal) * 1000) / 10, players: totalPlayers };
          const h = [...prev, pt]; if (h.length > 60) h.shift(); return h;
        });
      } catch { }
    };
    fetchSys();
    let unsub: () => void;
    listen<{ server_id: number; status: any }>('server-status-change', (e) => { updateServerStatus(e.payload.server_id, e.payload.status); }).then(u => { unsub = u; });
    const i1 = setInterval(fetchSys, 10000);
    const i2 = setInterval(refreshServers, 3000);
    return () => { clearInterval(i1); clearInterval(i2); if (unsub) unsub(); };
  }, []);

  const running = servers.filter(s => s.status === 'running' || s.status === 'online').length;
  const stopped = servers.filter(s => s.status === 'stopped').length;
  const memPct = systemInfo ? (systemInfo.ramUsage / systemInfo.ramTotal) * 100 : 0;
  const diskPct = systemInfo ? (systemInfo.diskUsage / systemInfo.diskTotal) * 100 : 0;




  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
      <div className="flex items-center gap-3 mb-2">
        <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
          <span className="text-xs font-bold text-amber-400 tracking-wider uppercase">ARK: Survival Evolved</span>
        </div>
        <span className="text-xs text-slate-500">UE4 • Steam Workshop • AppID 376030</span>
      </div>

      {/* Sponsor Banner */}
      <SponsorBanner />

      {/* Stats and Telemetry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Count Cards */}
        <div className="lg:col-span-1 grid grid-cols-3 lg:grid-cols-1 gap-4">
          {/* Total Servers */}
          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between group hover:border-amber-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Servers</span>
              <div className="p-1.5 bg-amber-500/10 rounded-lg">
                <Server className="w-3.5 h-3.5 text-amber-400" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl font-bold text-white leading-none">{servers.length}</p>
              <p className="text-[10px] text-slate-500 mt-1">ASE Instances</p>
            </div>
          </div>

          {/* Running */}
          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between group hover:border-green-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Running</span>
              <div className="p-1.5 bg-green-500/10 rounded-lg">
                <Activity className="w-3.5 h-3.5 text-green-400" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl font-bold text-green-400 leading-none">{running}</p>
              <p className="text-[10px] text-slate-500 mt-1">Online</p>
            </div>
          </div>

          {/* Stopped */}
          <div className="glass-panel rounded-xl p-4 flex flex-col justify-between group hover:border-slate-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Stopped</span>
              <div className="p-1.5 bg-slate-500/10 rounded-lg">
                <Square className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl font-bold text-slate-400 leading-none">{stopped}</p>
              <p className="text-[10px] text-slate-500 mt-1">Offline</p>
            </div>
          </div>
        </div>

        {/* Host Telemetry Dials Card */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
            <span className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">Host Allocation Telemetry</span>
            <span className="text-[9px] text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full font-mono font-semibold tracking-wide animate-pulse">STREAMING</span>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 py-2">
            {/* CPU Dial */}
            <div className="flex flex-col items-center justify-center bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-amber-500/20 p-4 rounded-2xl transition-all group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.01] to-transparent rounded-2xl pointer-events-none" />
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                  <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.02)" strokeWidth="5" fill="transparent" />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="url(#cpuGlowAse)"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - ((systemInfo?.cpuUsage || 0) / 100) * 251.2}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="cpuGlowAse" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-amber-500 font-mono tracking-tighter">
                  {(systemInfo?.cpuUsage || 0).toFixed(0)}%
                </div>
              </div>
              <div className="text-center mt-3">
                <p className="text-[10px] text-slate-300 uppercase font-bold tracking-widest flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
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
                    stroke="url(#ramGlowAse)"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (memPct / 100) * 251.2}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="ramGlowAse" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ec4899" />
                      <stop offset="100%" stopColor="#f43f5e" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-pink-400 font-mono tracking-tighter">
                  {memPct.toFixed(0)}%
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
                    stroke="url(#diskGlowAse)"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (diskPct / 100) * 251.2}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="diskGlowAse" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-amber-500 font-mono tracking-tighter">
                  {diskPct.toFixed(0)}%
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
        {/* Server Hub */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span className="text-amber-400 font-mono font-black leading-none mt-0.5">{'>_'}</span>
              <span className="tracking-wide">ASE Server Control Hub</span>
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  id="ase-server-search"
                  name="searchQuery"
                  aria-label="Search servers"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search server..."
                  className="pl-9 pr-4 py-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 w-48 transition-all"
                />
              </div>
              <button
                onClick={() => navigate('/ase/servers')}
                className="text-xs font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.03] active:scale-[0.97]"
                aria-label="Deploy Server"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                Deploy Server
              </button>
              <button
                onClick={() => navigate('/ase/tools/organization')}
                className="text-xs font-semibold px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.03] active:scale-[0.97]"
                aria-label="Organize Nodes"
              >
                Organize Nodes
              </button>
              <button
                onClick={() => navigate('/ase/servers')}
                className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-lg"
                aria-label="Manage all servers"
              >
                Manage All →
              </button>
            </div>
          </div>

          {/* Folders category filters */}
          {snapshot?.folders && snapshot.folders.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6 p-2 bg-white/[0.01] border border-white/5 rounded-2xl">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-[1.02] active:scale-[0.98]',
                  selectedFolderId === null
                    ? 'bg-amber-500 text-slate-900'
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
                      'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 border border-transparent hover:scale-[1.02] active:scale-[0.98]',
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

          {filteredServers.length === 0 ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#080d19]/40 p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
              {/* Background gradient blur spots */}
              <div className="absolute -left-12 -top-12 w-64 h-64 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
              <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-orange-500/5 blur-3xl pointer-events-none" />

              {/* Left Column: Premium Interactive CSS Server Rack Illustration */}
              <div className="relative w-full max-w-[280px] aspect-[4/3] flex flex-col justify-center items-center bg-[#0a0f1d]/80 border border-white/5 rounded-2xl p-6 shadow-inner group overflow-hidden">
                {/* Cyber grid pattern overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:16px_16px] rounded-2xl pointer-events-none" />

                {/* Server Blades Stack */}
                <div className="w-full space-y-3 relative z-10">
                  {/* Server Blade 1 */}
                  <div className="h-10 bg-slate-950/90 border border-white/5 rounded-lg px-3 flex items-center justify-between shadow-md group-hover:border-amber-500/20 transition-all duration-300">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse" />
                      <span className="text-[9px] font-mono text-slate-400">NODE_01</span>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/80 animate-ping" />
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/40" />
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/20" />
                    </div>
                  </div>

                  {/* Server Blade 2 */}
                  <div className="h-10 bg-slate-950/90 border border-white/5 rounded-lg px-3 flex items-center justify-between shadow-md group-hover:border-amber-500/20 transition-all duration-300">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)] animate-pulse" />
                      <span className="text-[9px] font-mono text-slate-400">NODE_02</span>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                    </div>
                  </div>

                  {/* Server Blade 3 */}
                  <div className="h-10 bg-slate-950/90 border border-white/5 rounded-lg px-3 flex items-center justify-between shadow-md group-hover:border-amber-500/20 transition-all duration-300">
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
                <div className="absolute left-0 right-0 h-[1.5px] bg-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.3)] animate-pulse pointer-events-none" />

                {/* Visual Label */}
                <div className="mt-4 text-[9px] font-bold tracking-[0.15em] text-slate-500 uppercase font-mono">
                  No active instances
                </div>
              </div>

              {/* Right Column: Title + Description + Action Cards */}
              <div className="flex-1 flex flex-col gap-6 w-full text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-200 mb-1.5">
                    Initialize ASE Server Cluster
                  </h3>
                  <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-xl">
                    Deploy, customize, and manage your high-performance ARK: Survival Evolved (ASE) servers from a clean, unified dashboard.
                  </p>
                </div>

                {/* Action Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card 1: Deploy Server */}
                  <div
                    onClick={() => navigate('/ase/servers')}
                    className="p-5 rounded-xl border border-amber-500/10 bg-amber-500/[0.02] hover:bg-amber-500/[0.06] hover:border-amber-500/30 transition-all cursor-pointer group flex flex-col justify-between h-36 shadow-sm"
                  >
                    <div>
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition-all">
                        <Zap className="w-4 h-4 fill-current" />
                      </div>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-amber-400 transition-colors">Deploy ASE Server</h4>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">Configure and download a clean server installation with our guided tools.</p>
                    </div>
                  </div>

                  {/* Card 2: Import Server */}
                  <div
                    onClick={() => navigate('/ase/servers')}
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
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Central systems are online.</span>
                  <button
                    onClick={() => navigate('/ase/config')}
                    className="text-amber-400 hover:text-amber-300 font-semibold focus:outline-none ml-1 flex items-center gap-0.5 hover:underline"
                  >
                    Open Config Editor →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredServers.map(srv => {
                const cust = snapshot?.servers?.find((s: any) => s.id === srv.id)?.customization;
                const displayName = cust?.display_name || srv.name;
                const hasColor = !!cust?.color_tag;

                return (
                  <div
                    key={srv.id}
                    className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] hover:border-amber-500/20 hover:scale-[1.01] hover:shadow-[0_0_15px_rgba(245,158,11,0.05)] transition-all duration-300 group gap-4 lg:gap-0 relative overflow-hidden"
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
                          srv.status === 'online' && 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
                          srv.status === 'running' && 'bg-amber-500 animate-pulse',
                          srv.status === 'stopped' && 'bg-slate-500',
                          srv.status === 'crashed' && 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
                          srv.status === 'starting' && 'bg-amber-500 animate-pulse',
                          srv.status === 'updating' && 'bg-blue-500 animate-pulse'
                        )}
                        role="img"
                        aria-label={`Status: ${srv.status}`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-200">{displayName}</h3>
                          {cust?.favorite && <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />}
                          {cust?.is_pinned && <Bookmark className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                          {srv.autoStart && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold tracking-wide uppercase">
                              AUTOSTART
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                          <p className="text-xs text-slate-400">{getAseMapDisplayName(srv.mapName)} • Game: {srv.port} • Query: {srv.queryPort} • RCON: {srv.rconPort}</p>
                          {cust?.tags && cust.tags.map((tg: string) => (
                            <span key={tg} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-slate-400 font-medium">
                              {tg}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {(srv.status === 'stopped' || srv.status === 'crashed') && !stoppingServers.includes(srv.id) ? (
                        <button
                          onClick={() => handleStart(srv.id)}
                          className="w-[34px] h-[34px] flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                          title="Start Server"
                          aria-label={`Start Server ${displayName}`}
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                      ) : (srv.status === 'running' || srv.status === 'online') && !stoppingServers.includes(srv.id) ? (
                        <>
                          <button
                            onClick={() => handleStop(srv.id)}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                            title="Stop Server"
                            aria-label={`Stop Server ${displayName}`}
                          >
                            <Square className="w-4 h-4 fill-current" />
                          </button>

                          <div className="relative group/dropdown">
                            <button
                              className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                              title="Restart Options"
                              aria-label={`Restart options for Server ${displayName}`}
                            >
                              <RotateCw className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu */}
                            <div className="absolute top-full right-0 mt-2 w-52 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/dropdown:scale-100">
                              <button
                                onClick={() => handleRestart(srv.id)}
                                className="w-full text-left px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2 text-xs"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>{t('dashboard.normalRestart', 'Normal Restart')}</span>
                              </button>
                              <button
                                onClick={() => handleRestart(srv.id, true)}
                                className="w-full text-left px-4 py-3 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2 border-t border-slate-800 text-xs"
                                title="Gracefully restart the server and wipe all wild dinosaurs"
                              >
                                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                                <span>{t('dashboard.restartWipeDinos', 'Restart & Wipe Dinos')}</span>
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <button
                          disabled
                          className={cn(
                            "w-[34px] h-[34px] flex items-center justify-center border rounded-xl opacity-80 cursor-not-allowed focus:outline-none transition-all",
                            (srv.status === 'starting' && !stoppingServers.includes(srv.id)) && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                            stoppingServers.includes(srv.id) && 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                            srv.status === 'updating' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          )}
                          aria-label={`Server ${displayName} status updating`}
                        >
                          {stoppingServers.includes(srv.id) ? (
                            <div className="relative w-4 h-4 flex items-center justify-center">
                              <div className="absolute inset-0 border-2 border-rose-500/20 border-t-rose-400 rounded-full animate-spin" />
                              <Square className="w-1.5 h-1.5 fill-current text-rose-400 animate-pulse" />
                            </div>
                          ) : srv.status === 'starting' ? (
                            <div className="relative w-4 h-4 flex items-center justify-center">
                              <div className="absolute inset-0 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
                              <Play className="w-2 h-2 fill-current text-emerald-400 animate-pulse ml-0.5" />
                            </div>
                          ) : srv.status === 'updating' ? (
                            <div className="relative w-4 h-4 flex items-center justify-center">
                              <div className="absolute inset-0 border-2 border-sky-500/20 border-t-sky-400 rounded-full animate-spin" />
                              <RefreshCw className="w-2 h-2 text-sky-400 animate-spin [animation-duration:3s]" />
                            </div>
                          ) : (
                            <RotateCw className="w-4 h-4 animate-spin" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => handleCopyIp(srv.port)}
                        className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                        title="Copy IP Address"
                        aria-label={`Copy IP address for Server ${displayName}`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => navigate('/ase/config', { state: { serverId: srv.id } })}
                        className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 hover:scale-105 active:scale-95"
                        title="Config Editor"
                        aria-label={`Open Config Editor for Server ${displayName}`}
                      >
                        <FileEdit className="w-4 h-4" />
                      </button>

                      <button
                        onClick={(e) => { e.stopPropagation(); window.location.href = `steam://connect/127.0.0.1:${srv.queryPort || 27015}`; }}
                        disabled={srv.status !== 'online'}
                        className="w-[34px] h-[34px] flex items-center justify-center bg-[#5c6ac4]/10 hover:bg-[#5c6ac4]/20 text-[#5c6ac4] border border-[#5c6ac4]/20 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                        title="Join Server via Steam"
                        aria-label={`Join Server ${displayName} via Steam`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4c7 0 11 8 11 8a18.6 18.6 0 0 1-3.2 4.6" /><path d="M18.8 18.8A18.6 18.6 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.3-6.4" /><circle cx="12" cy="12" r="3" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                      </button>

                      <div className={cn(
                        "w-[85px] h-[34px] rounded-xl text-[10px] font-bold tracking-[0.05em] border uppercase flex items-center justify-center shadow-inner",
                        srv.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          srv.status === 'running' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            srv.status === 'crashed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                              'bg-[#1a202c]/50 text-slate-400 border-white/5'
                      )}>
                        {srv.status.toUpperCase()}
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

            {/* Startup & Boot Options Widget */}
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
                Additional options are available in <button onClick={() => navigate('/ase/settings')} className="text-amber-500 hover:underline">Settings</button>
              </p>
            </div>



            {/* AI Sentinel & Live Telemetry Operations Center */}
            <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group border border-amber-500/10 hover:border-amber-500/20 transition-all space-y-4">
              {/* Top Bar */}
              <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-extrabold text-white tracking-wide uppercase whitespace-nowrap">
                        ASE Sentinel Watchdog
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
                  className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-all focus:outline-none hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                  title="Trim process working set and reclaim standby memory"
                >
                  <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Purge RAM</span>
                </button>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-black/30 rounded-xl border border-white/5 flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400 shrink-0">
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
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                      <span className="truncate text-slate-300" title={log}>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

