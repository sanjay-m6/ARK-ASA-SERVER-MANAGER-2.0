import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Server,
  Puzzle,
  FileEdit,
  Network,
  Database,
  ScrollText,
  Terminal,
  Clock,
  Settings as SettingsIcon,
  Wrench,
  Cpu,
  Plug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  Bot,
  Wifi,
  FileText,
  RefreshCw,
  Search,
  Languages,
  Users,
  X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/helpers';
import { useServerStore } from '../../stores/serverStore';
import { useAseServerStore } from '../../ase/stores/aseServerStore';
import { useGameStore } from '../../stores/gameStore';
import asaLogo from '../../assets/ASA.png';
import aseLogo from '../../assets/ASE.png';

import DiscordIcon from '../ui/DiscordIcon';

interface NavigationItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  path?: string;
  children?: {
    name: string;
    path: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  _forceOpen?: boolean;
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState<string>('');
  const [openSections, setOpenSections] = useState<string[]>(['Tools']);
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation();

  const { activeGame, setActiveGame, isSidebarCollapsed, setSidebarCollapsed, showAseMode, setShowAseMode } = useGameStore();
  const isASE = activeGame === 'ASE';

  // Auto-collapse sidebar on narrow screens (e.g. vertical displays)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1200) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setSidebarCollapsed]);

  const asaNavigation = [
    { name: t('sidebar.dashboard', 'Dashboard'), path: '/dashboard', icon: LayoutDashboard },
    { name: t('sidebar.serverManager', 'Server Manager'), path: '/servers', icon: Server },
    { name: t('sidebar.rconConsole', 'RCON Console'), path: '/rcon', icon: Terminal },
    { name: t('sidebar.scheduler', 'Scheduler'), path: '/scheduler', icon: Clock },
    { name: t('sidebar.modManager', 'Mod Manager'), path: '/mods', icon: Puzzle },
    { name: t('sidebar.configEditor', 'Config Editor'), path: '/config', icon: FileEdit },
    { name: t('sidebar.clusterManager', 'Cluster Manager'), path: '/clusters', icon: Network },
    { name: t('sidebar.backups', 'Backups & Rollbacks'), path: '/backups', icon: Database },
    { name: t('sidebar.logsConsole', 'Logs Console'), path: '/logs', icon: ScrollText },
    {
      name: t('sidebar.tools', 'Tools'),
      icon: Wrench,
      children: [
        { name: t('sidebar.aiAssistant', 'AI Assistant'), path: '/tools/ai', icon: Bot },
        { name: t('sidebar.advanced', 'Boot Launch Parameter'), path: '/tools/advanced', icon: Cpu },
        { name: 'Hardware Allocation', path: '/hardware', icon: Cpu },
        { name: t('sidebar.discordBot', 'Discord Bot'), path: '/tools/discord', icon: DiscordIcon },
        { name: t('sidebar.plugins', 'Plugins'), path: '/tools/plugins', icon: Plug },
        { name: t('sidebar.fileManager', 'File Manager'), path: '/tools/files', icon: Folder },
        { name: t('sidebar.tribeLogs', 'Tribe Logs'), path: '/tools/tribe-logs', icon: ScrollText },
        { name: t('sidebar.serverOrganization', 'Server Organization'), path: '/tools/organization', icon: Folder },
      ]
    },
    { name: t('sidebar.wiki', 'Knowledge Base'), path: '/wiki', icon: FileText },
    { name: t('sidebar.settings', 'Settings'), path: '/settings', icon: SettingsIcon },
  ];

  const aseNavigation = [
    { name: 'Dashboard', path: '/ase/dashboard', icon: LayoutDashboard },
    { name: 'Server Manager', path: '/ase/servers', icon: Server },
    { name: 'RCON Console', path: '/ase/rcon', icon: Terminal },
    { name: 'Scheduler', path: '/ase/scheduler', icon: Clock },
    { name: 'Mod Management', path: '/ase/mods', icon: Puzzle },
    { name: 'Player Management', path: '/ase/players', icon: Users },
    { name: 'Server Configuration', path: '/ase/config', icon: FileEdit },
    { name: 'Cluster Manager', path: '/ase/clusters', icon: Network },
    { name: 'Backups', path: '/ase/backups', icon: Database },
    { name: 'Diagnostics & Logs', path: '/ase/logs', icon: ScrollText },
    {
      name: 'Server Utilities',
      icon: Wrench,
      children: [
        { name: 'AI Assistant', path: '/ase/tools/ai', icon: Bot },
        { name: 'Boot Launch Parameter', path: '/ase/tools/advanced', icon: Cpu },
        { name: 'Hardware Allocation', path: '/ase/hardware', icon: Cpu },
        { name: 'File Manager', path: '/ase/files', icon: Folder },
        { name: 'Discord Bot', path: '/ase/discord', icon: DiscordIcon },
        { name: 'Profile Sync', path: '/ase/profile-sync', icon: RefreshCw },
        { name: 'Plugins Manager', path: '/ase/tools/plugins', icon: Plug },
        { name: 'Chat Translator', path: '/ase/tools/chat-translator', icon: Languages },
        { name: 'Tribe Logs', path: '/ase/tools/tribe-logs', icon: ScrollText },
        { name: 'UPnP Ports', path: '/ase/tools/upnp', icon: Wifi },
        { name: 'Server Organization', path: '/ase/tools/organization', icon: Folder },
      ]
    },
    { name: t('sidebar.wiki', 'Knowledge Base'), path: '/wiki', icon: FileText },
    { name: 'ASE Settings', path: '/ase/settings', icon: SettingsIcon },
  ];

  const asaServers = useServerStore((state) => state.servers);
  const aseServers = useAseServerStore((state) => state.servers);
  const activeModeServers = isASE ? aseServers : asaServers;
  const hasInstalledServers = activeModeServers.length > 0;

  const rawNavigation = isASE ? aseNavigation : asaNavigation;
  const navigation = hasInstalledServers
    ? rawNavigation
    : rawNavigation.filter(item => {
        const p = item.path || '';
        return p === '/servers' || p === '/ase/servers' || p === '/wiki' || p === '/settings' || p === '/ase/settings';
      });

  const accentText = isASE ? 'text-amber-400' : 'text-sky-400';
  const accentBg = isASE ? 'bg-amber-500/15' : 'bg-sky-500/15';
  const accentBorder = isASE ? 'border-amber-500/40' : 'border-sky-500/40';
  const accentGlow = isASE ? 'shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'shadow-[0_0_20px_rgba(14,165,233,0.2)]';
  const accentGradient = isASE ? 'from-amber-500/20 via-amber-500/10 to-transparent' : 'from-sky-500/20 via-sky-500/10 to-transparent';
  const accentBar = isASE ? 'bg-gradient-to-b from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(251,191,36,0.8)]' : 'bg-gradient-to-b from-sky-400 to-blue-500 shadow-[0_0_10px_rgba(56,189,248,0.8)]';
  const accentDot = isASE ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]' : 'bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.9)]';

  const handleGameSwitch = (game: 'ASA' | 'ASE') => {
    setActiveGame(game);
    const targetServers = game === 'ASE' ? aseServers : asaServers;
    if (targetServers.length === 0) {
      navigate(game === 'ASE' ? '/ase/servers' : '/servers');
    } else {
      navigate(game === 'ASE' ? '/ase/dashboard' : '/dashboard');
    }
  };

  const runningServers = activeModeServers.filter((s) => 
    s.status === 'running' || 
    s.status === 'online' || 
    s.status === 'starting' || 
    s.status === 'updating' || 
    s.status === 'restarting' || 
    s.status === 'stopping'
  );
  const isAnyServerRunning = runningServers.length > 0;
  const systemStatus = isAnyServerRunning 
    ? t('common.online', 'Online') 
    : t('common.offline', 'Offline');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('?.?.?'));
  }, []);

  const toggleSection = (name: string) => {
    setOpenSections(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name]
    );
  };

  const filteredNavigation = navigation.map(item => {
    if (!searchQuery) return item;
    const query = searchQuery.toLowerCase();
    if (item.children) {
      const matchesParent = item.name.toLowerCase().includes(query);
      const matchingChildren = item.children.filter(child => child.name.toLowerCase().includes(query));
      
      if (matchesParent || matchingChildren.length > 0) {
        return {
          ...item,
          children: matchesParent ? item.children : matchingChildren,
          _forceOpen: true
        };
      }
      return null;
    }
    
    return item.name.toLowerCase().includes(query) ? item : null;
  }).filter(Boolean) as NavigationItem[];

  return (
    <aside className={cn(
      "bg-slate-950/95 border-r border-white/[0.07] flex flex-col h-full relative z-50 transition-all duration-300 ease-in-out backdrop-blur-2xl shadow-2xl select-none",
      isSidebarCollapsed ? "w-20" : "w-72"
    )}>
      {/* Subtle Top Ambient Glow Accent */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-40 bg-gradient-to-b to-transparent pointer-events-none opacity-40 blur-2xl",
        isASE ? "from-amber-500/20" : "from-sky-500/20"
      )} />

      {/* Brand Header */}
      <div className={cn(
        "relative z-10 shrink-0 border-b border-white/[0.04]",
        isSidebarCollapsed ? "p-3 pb-3 flex flex-col items-center gap-3" : "px-5 py-4"
      )}>
        <div className={cn("flex items-center w-full", isSidebarCollapsed ? "flex-col justify-center gap-3" : "justify-between")}>
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo with Soft Ambient Halo */}
            <div className="relative group shrink-0">
              <div className={cn(
                "absolute -inset-1 rounded-2xl blur-md opacity-40 group-hover:opacity-80 transition-opacity",
                isASE ? "bg-amber-500/30" : "bg-sky-500/30"
              )} />
              <img
                src={isASE ? aseLogo : asaLogo}
                alt="ARK Manager"
                className={cn(
                  "relative rounded-xl object-contain transform transition-transform group-hover:scale-105 border border-white/10 bg-slate-900/60 p-1 shadow-lg",
                  isSidebarCollapsed ? "w-10 h-10" : "w-11 h-11"
                )}
              />
            </div>

            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <h1 className={cn(
                  "text-lg font-black tracking-tight leading-tight text-transparent bg-clip-text bg-gradient-to-r truncate",
                  isASE ? "from-amber-400 via-orange-300 to-amber-500" : "from-sky-400 via-cyan-300 to-blue-500"
                )}>
                  ARK Manager
                </h1>
                <p className={cn(
                  "text-[10px] font-bold tracking-[0.18em] uppercase leading-none mt-0.5",
                  isASE ? "text-amber-400/80" : "text-sky-400/80"
                )}>
                  {t('sidebar.commandCenter', 'Command Center')} <span className="text-slate-400 font-mono">2.1</span>
                </p>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
            className={cn(
              "p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shadow-sm active:scale-95 shrink-0",
              isSidebarCollapsed ? "w-10 h-10" : ""
            )}
            title={isSidebarCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Game Mode Switcher (When ASE is toggled ON) */}
      {showAseMode && (
        <div className={cn("pt-3 pb-1 shrink-0", isSidebarCollapsed ? "px-3" : "px-4")}>
          {isSidebarCollapsed ? (
            <button
              onClick={() => handleGameSwitch(activeGame === 'ASA' ? 'ASE' : 'ASA')}
              className={cn(
                "w-10 h-9 mx-auto rounded-xl flex items-center justify-center text-xs font-black tracking-wider transition-all duration-300 border shadow-inner cursor-pointer active:scale-95",
                activeGame === 'ASE'
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                  : "bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
              )}
              title={t('sidebar.switchGame', `Switch to ${activeGame === 'ASA' ? 'ASE' : 'ASA'}`)}
            >
              {activeGame}
            </button>
          ) : (
            <div className="relative flex p-1 bg-black/40 border border-white/[0.08] rounded-xl shadow-inner backdrop-blur-xl">
              {(['ASA', 'ASE'] as const).map((game) => {
                const isActive = activeGame === game;
                return (
                  <button
                    key={game}
                    onClick={() => handleGameSwitch(game)}
                    className={cn(
                      "relative z-10 flex-1 py-1.5 rounded-lg text-[11px] font-black tracking-[0.2em] uppercase transition-colors duration-200 cursor-pointer flex items-center justify-center gap-1.5",
                      isActive 
                        ? (game === 'ASE' ? "text-amber-300 font-extrabold" : "text-sky-300 font-extrabold")
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <span>{game}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeGamePill"
                        className={cn(
                          "absolute inset-0 rounded-lg border z-[-1]",
                          game === 'ASE' 
                            ? "bg-gradient-to-r from-amber-500/25 to-orange-500/25 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]" 
                            : "bg-gradient-to-r from-sky-500/25 to-blue-500/25 border-sky-500/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                        )}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick Search Bar */}
      {!isSidebarCollapsed && (
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-sky-400 transition-colors z-10" />
            <input
              type="text"
              placeholder={t('sidebar.search', 'Search menu...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/30 hover:bg-black/40 focus:bg-black/50 border border-white/[0.08] hover:border-white/15 focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-all relative z-10 shadow-inner font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-slate-300 z-20"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation List */}
      <nav className={cn(
        "flex-1 py-2 space-y-1 overflow-y-auto custom-scrollbar relative z-10",
        isSidebarCollapsed ? "px-2" : "px-3"
      )}>
        <AnimatePresence>
          {filteredNavigation.map((item) => {
            if (item.children) {
              const isOpen = !isSidebarCollapsed && (item._forceOpen || openSections.includes(item.name));
              const isChildActive = item.children.some(child => location.pathname === child.path);

              return (
                <motion.div 
                  key={item.name} 
                  layout="position"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-1"
                >
                  <button
                    onClick={() => {
                      if (isSidebarCollapsed) {
                        setSidebarCollapsed(false);
                        if (!openSections.includes(item.name)) {
                          toggleSection(item.name);
                        }
                      } else {
                        toggleSection(item.name);
                      }
                    }}
                    className={cn(
                      'w-full flex items-center rounded-xl transition-all duration-200 group cursor-pointer border',
                      isSidebarCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-2.5',
                      isChildActive || isOpen
                        ? 'text-white bg-white/[0.04] border-white/[0.08] shadow-sm font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border-transparent'
                    )}
                    title={isSidebarCollapsed ? item.name : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <item.icon className={cn(
                        "w-4 h-4 transition-transform group-hover:scale-110 shrink-0",
                        (isChildActive || isOpen) ? accentText : `text-slate-400 group-hover:${accentText}`
                      )} />
                      {!isSidebarCollapsed && (
                        <span className="text-xs font-bold tracking-wide truncate">{item.name}</span>
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                      </motion.div>
                    )}
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && !isSidebarCollapsed && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 250, damping: 25 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-3.5 pr-1 py-1 space-y-0.5 ml-4 border-l border-white/[0.08] relative">
                          {item.children.map(child => {
                            const isActive = location.pathname === child.path;
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                className={cn(
                                  'flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all duration-200 group relative text-xs',
                                  isActive
                                    ? `text-white font-bold ${accentBg} shadow-sm border ${accentBorder}`
                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                )}
                              >
                                {isActive && (
                                  <motion.div 
                                    layoutId={`sidebar-sub-active-${item.name}`}
                                    className={cn("absolute left-0 w-1 h-3/5 rounded-r-full top-1/5", accentBar)} 
                                  />
                                )}
                                <child.icon className={cn(
                                  "w-3.5 h-3.5 transition-colors shrink-0",
                                  isActive ? accentText : `text-slate-500 group-hover:${accentText}`
                                )} />
                                <span className="font-medium tracking-wide truncate">{child.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            }

            const isActive = location.pathname === item.path;
            return (
              <motion.div
                key={item.path}
                layout="position"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Link
                  to={item.path || '#'}
                  className={cn(
                    'flex items-center rounded-xl transition-all duration-200 group relative overflow-hidden text-xs',
                    isSidebarCollapsed ? 'justify-center p-3' : 'space-x-3 px-3.5 py-2.5',
                    isActive
                      ? `text-white font-bold bg-gradient-to-r ${accentGradient} border ${accentBorder} ${accentGlow}`
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent'
                  )}
                  title={isSidebarCollapsed ? item.name : undefined}
                >
                  {/* Active Left Indicator Bar */}
                  {isActive && (
                    <motion.div 
                      layoutId="sidebar-active-bar" 
                      className={cn("absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full", accentBar)} 
                    />
                  )}

                  <item.icon className={cn(
                    "w-4 h-4 relative z-10 transition-transform group-hover:scale-110 shrink-0",
                    isActive ? `${accentText} drop-shadow-sm` : `text-slate-400 group-hover:${accentText}`
                  )} />

                  {!isSidebarCollapsed && (
                    <span className="font-semibold tracking-wide relative z-10 truncate">{item.name}</span>
                  )}

                  {/* Active Pulse Dot on the right */}
                  {isActive && !isSidebarCollapsed && (
                    <motion.div 
                      layoutId="sidebar-active-dot" 
                      className={cn("absolute right-3 w-1.5 h-1.5 rounded-full animate-pulse", accentDot)} 
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </nav>

      {/* Footer System Status Card */}
      <div className={cn("border-t border-white/[0.06] shrink-0 bg-slate-950/80", isSidebarCollapsed ? "p-3" : "p-3.5")}>
        {isSidebarCollapsed ? (
          <div className="flex flex-col items-center justify-center gap-2.5">
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full animate-pulse",
                isAnyServerRunning
                  ? isASE ? "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.6)]" : "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                  : "bg-slate-600 shadow-sm"
              )}
              title={`${t('sidebar.systemStatus', 'System Status')}: ${systemStatus}`}
            />
            <span className="text-[9px] font-mono text-slate-500 select-none">
              v{appVersion.split('-')[0]}
            </span>
          </div>
        ) : (
          <div className={cn(
            "rounded-2xl p-3.5 border border-white/[0.08] backdrop-blur-xl shadow-lg bg-gradient-to-br space-y-3",
            isASE ? "from-amber-500/[0.08] via-slate-900/60 to-slate-950/80" : "from-sky-500/[0.08] via-slate-900/60 to-slate-950/80"
          )}>
            {/* Header: System Status */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {t('sidebar.systemStatus', 'System Status')}
              </span>
              <span className={cn(
                "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 border",
                isAnyServerRunning 
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]" 
                  : "bg-slate-800/80 border-slate-700 text-slate-400"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isAnyServerRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                )} />
                {systemStatus}
              </span>
            </div>

            {/* Glowing Activity / Progress Bar */}
            <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-white/[0.04]">
              <div className={cn(
                "h-full rounded-full w-full transition-all duration-500",
                isAnyServerRunning
                  ? isASE ? "bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(14,165,233,0.6)]"
                  : "bg-slate-700"
              )} />
            </div>
            
            {/* Evolved Mode Switch */}
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300">Show Evolved (ASE)</span>
              <button
                onClick={() => {
                  const newVal = !showAseMode;
                  setShowAseMode(newVal);
                  if (!newVal && activeGame === 'ASE') {
                    handleGameSwitch('ASA');
                  }
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                  showAseMode ? (isASE ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.4)]") : "bg-slate-800 border-white/[0.08]"
                )}
                role="switch"
                aria-checked={showAseMode}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                    showAseMode ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Version & Brand Footer */}
            <div className="pt-1.5 border-t border-white/[0.04] text-[10px] text-slate-400 font-mono flex items-center justify-between">
              <span className="text-slate-400">v{appVersion.replace('-0', '-beta')}</span>
              <span className="flex items-center gap-1 text-[10px] font-sans font-semibold text-slate-300">
                <span className={cn("w-1.5 h-1.5 rounded-full", isASE ? "bg-amber-400" : "bg-sky-400")} />
                {isASE ? 'ASE Manager' : 'ASA Manager'}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
