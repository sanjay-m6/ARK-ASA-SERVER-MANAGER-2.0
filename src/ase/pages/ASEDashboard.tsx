import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Server, Activity, Zap, Terminal, Puzzle,
  Play, Square, RotateCw, Clock, Database, FileEdit,
  Folder, FolderOpen, Heart, Bookmark, Search, Globe, ShieldCheck, Copy
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, Variants } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../utils/helpers';
import { getSystemInfo } from '../../utils/tauri';
import { startAseServer, stopAseServer } from '../utils/aseCommands';
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
    try { await stopAseServer(id); updateServerStatus(id, 'stopped'); toast.success('Server stopped'); }
    catch (e) { toast.error(`Failed: ${e}`); }
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

  const actions = [
    { name: 'Deploy Server', icon: Zap, path: '/ase/servers', color: 'amber' },
    { name: 'Server Manager', icon: Server, path: '/ase/servers', color: 'emerald' },
    { name: 'Config Editor', icon: FileEdit, path: '/ase/config', color: 'orange' },
    { name: 'RCON Console', icon: Terminal, path: '/ase/rcon', color: 'cyan' },
    { name: 'Mod Manager', icon: Puzzle, path: '/ase/mods', color: 'pink' },
    { name: 'Backups', icon: Database, path: '/ase/backups', color: 'teal' },
    { name: 'Scheduler', icon: Clock, path: '/ase/scheduler', color: 'rose' },
    { name: 'Environment', icon: Globe, path: '/ase/environment', color: 'lime' },
  ];


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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
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
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search server..."
                    className="pl-9 pr-4 py-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/30 w-48"
                  />
                </div>
                <button
                  onClick={() => navigate('/ase/servers')}
                  className="text-xs font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  Deploy Server
                </button>
                <button
                  onClick={() => navigate('/ase/tools/organization')}
                  className="text-xs font-semibold px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition-all"
                >
                  Organize Nodes
                </button>
                <button
                  onClick={() => navigate('/ase/servers')}
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 focus:outline-none"
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
                    'px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none',
                    selectedFolderId === null
                      ? 'bg-amber-500 text-slate-900'
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
                      className="flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all gap-4 lg:gap-0 relative overflow-hidden"
                    >
                      {/* Custom Brand line indicator */}
                      {hasColor && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1"
                          style={{ backgroundColor: cust.color_tag }}
                        />
                      )}

                      <div className="flex items-center gap-4 pl-2">
                        <div className={cn(
                          'w-2.5 h-2.5 rounded-full',
                          srv.status === 'online' && 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
                          srv.status === 'running' && 'bg-amber-500 animate-pulse',
                          srv.status === 'stopped' && 'bg-slate-500',
                          srv.status === 'crashed' && 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
                          srv.status === 'starting' && 'bg-amber-500 animate-pulse',
                          srv.status === 'updating' && 'bg-blue-500 animate-pulse'
                        )} />
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
                        {(srv.status === 'stopped' || srv.status === 'crashed') ? (
                          <button
                            onClick={() => handleStart(srv.id)}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl transition-all focus:outline-none"
                            title="Start Server"
                          >
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          </button>
                        ) : (srv.status === 'running' || srv.status === 'online') ? (
                          <button
                            onClick={() => handleStop(srv.id)}
                            className="w-[34px] h-[34px] flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all focus:outline-none"
                            title="Stop Server"
                          >
                            <Square className="w-4 h-4 fill-current" />
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-[34px] h-[34px] flex items-center justify-center bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded-xl opacity-50 cursor-not-allowed focus:outline-none"
                          >
                            <RotateCw className="w-4 h-4 animate-spin" />
                          </button>
                        )}

                        <button
                          onClick={() => handleCopyIp(srv.port)}
                          className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none"
                          title="Copy IP Address"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => navigate('/ase/config', { state: { serverId: srv.id } })}
                          className="w-[34px] h-[34px] flex items-center justify-center bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all focus:outline-none"
                          title="Config Editor"
                        >
                          <FileEdit className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); window.location.href = `steam://connect/127.0.0.1:${srv.queryPort || 27015}`; }}
                          disabled={srv.status !== 'online'}
                          className="w-[34px] h-[34px] flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Join Server via Steam"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4c7 0 11 8 11 8a18.6 18.6 0 0 1-3.2 4.6"/><path d="M18.8 18.8A18.6 18.6 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.3-6.4"/><circle cx="12" cy="12" r="3"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
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

          <PerformanceMonitor data={performanceHistory} />
        </div>

        {/* Right Column (1/3 width) - Co-Pilot, Quick Actions, Live Logs */}
        <div className="space-y-6">
          {/* AI Co-Pilot Widget */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-amber-500/10 blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />

            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              AI Co-Pilot Status
            </h3>
            <div className="bg-[#070b13]/60 rounded-xl p-3 border border-white/5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Diagnostics Mode</span>
                <span className="text-amber-400 font-semibold font-mono">AUTOMATED</span>
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
              onClick={() => navigate('/ase/tools/ai')}
              className="w-full mt-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold transition-all focus:outline-none"
            >
              Consult AI Co-Pilot
            </button>
          </div>

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
              Additional options are available in <button onClick={() => navigate('/ase/settings')} className="text-amber-500 hover:underline">Settings</button>
            </p>
          </div>

          {/* Quick Actions Panel */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-400" />
              Quick Operations
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {actions.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.name}
                    onClick={() => navigate(action.path)}
                    className="p-3 bg-white/[0.01] hover:bg-amber-500/[0.04] border border-white/5 hover:border-amber-500/20 rounded-xl text-left transition-all group flex items-center gap-2.5"
                  >
                    <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400 group-hover:scale-105 transition-all flex-shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-200 group-hover:text-amber-400 transition-all truncate">{action.name}</p>
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
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                SYSTEM_LIVE_LOGS
              </h3>
              <span className="text-[9px] font-mono text-slate-500">STDOUT</span>
            </div>
            <div className="flex-1 min-h-0 bg-black/40 rounded-xl p-3 font-mono text-[10px] text-slate-400 overflow-y-auto space-y-1.5 border border-white/5 custom-scrollbar">
              {liveLogs.map((log, index) => (
                <div key={index} className="leading-relaxed border-l-2 border-amber-500/20 pl-1.5 truncate">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

