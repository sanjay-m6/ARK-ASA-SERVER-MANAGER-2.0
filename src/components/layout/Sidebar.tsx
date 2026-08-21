import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { motion } from 'framer-motion';
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
  Users
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
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

  const accentText = isASE ? 'text-amber-500 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400';
  const accentBg = isASE ? 'bg-amber-500/15' : 'bg-sky-500/15';
  const accentGradient = isASE ? 'from-amber-500/20 to-orange-500/20' : 'from-sky-500/20 to-blue-500/20';
  const accentBorder = isASE ? 'border-amber-500/30' : 'border-sky-500/30';
  const accentDot = isASE ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]' : 'bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.6)]';

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
    <div className={cn(
      "glass-panel static-panel border-r border-[var(--border)] flex flex-col h-full relative z-50 transition-all duration-300 ease-in-out",
      isSidebarCollapsed ? "w-20" : "w-72"
    )}>
      {/* Logo / Header */}
      <div className={cn("p-6 pb-4", isSidebarCollapsed ? "flex flex-col items-center justify-center gap-3" : "p-8 pb-6")}>
        <div className={cn("flex items-center w-full", isSidebarCollapsed ? "flex-col justify-center gap-3" : "space-x-4 justify-between")}>
          <div className="flex items-center space-x-4">
            <div className="relative group">
              <div className={cn("absolute inset-0 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity", isASE ? "bg-amber-500/30" : "bg-sky-500/30")}></div>
              <img
                src={isASE ? aseLogo : asaLogo}
                alt="ARK Manager"
                className={cn("rounded-xl object-contain transform transition-transform group-hover:scale-105", isSidebarCollapsed ? "w-10 h-10" : "w-16 h-16", isASE ? "drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]")}
              />
            </div>
            {!isSidebarCollapsed && (
              <div>
                <h1 className={cn("text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r font-display", isASE ? "from-amber-400 to-orange-500" : "from-sky-500 to-blue-600 dark:from-cyan-400 dark:to-blue-500")}>ARK Manager</h1>
                <p className="text-xs text-[var(--text-muted)] font-medium tracking-wide">{t('sidebar.commandCenter', 'Command Center')} 2.1</p>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
            className={cn(
              "p-2 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer flex items-center justify-center shadow-sm",
              isSidebarCollapsed ? "w-10 h-10" : ""
            )}
            title={isSidebarCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Game Switcher */}
      {showAseMode && (
        <div className={cn("pb-4", isSidebarCollapsed ? "px-3" : "px-5")}>
          {isSidebarCollapsed ? (
            <button
              onClick={() => handleGameSwitch(activeGame === 'ASA' ? 'ASE' : 'ASA')}
              className={cn(
                "w-12 h-10 mx-auto rounded-xl flex items-center justify-center text-xs font-black tracking-wider transition-all duration-300 border shadow-inner cursor-pointer",
                activeGame === 'ASE'
                  ? "bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  : "bg-sky-500/20 border-sky-500/30 text-sky-600 dark:text-sky-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
              )}
              title={t('sidebar.switchGame', `Switch to ${activeGame === 'ASA' ? 'ASE' : 'ASA'}`)}
            >
              {activeGame}
            </button>
          ) : (
            <div className="relative flex p-1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-inner backdrop-blur-xl">
              {(['ASA', 'ASE'] as const).map((game) => {
                const isActive = activeGame === game;
                return (
                  <button
                    key={game}
                    onClick={() => handleGameSwitch(game)}
                    className={cn(
                      "relative z-10 flex-1 py-2 rounded-xl text-[11px] font-black tracking-[0.2em] uppercase transition-colors duration-200 cursor-pointer",
                      isActive 
                        ? (game === 'ASE' ? "text-amber-600 dark:text-amber-300 font-bold" : "text-sky-600 dark:text-sky-300 font-bold")
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {game}
                    {isActive && (
                      <motion.div
                        layoutId="activeGamePill"
                        className={cn(
                          "absolute inset-0 rounded-xl border z-[-1]",
                          game === 'ASE' 
                            ? "bg-amber-500/15 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]" 
                            : "bg-sky-500/15 border-sky-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                        )}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search Input */}
      {!isSidebarCollapsed && (
        <div className="px-5 pb-3">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-sky-500 transition-colors z-10" />
            <input
              type="text"
              placeholder={t('sidebar.search', 'Search...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all relative z-10 shadow-sm"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={cn("flex-1 py-2 space-y-1 overflow-y-auto scrollbar-hide", isSidebarCollapsed ? "px-2" : "px-4")}>
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
                      'w-full flex items-center rounded-xl transition-all duration-200 group cursor-pointer',
                      isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3',
                      isChildActive || isOpen
                        ? 'text-[var(--text-primary)] bg-[var(--surface-active)] border border-[var(--border)] shadow-sm font-bold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                    )}
                    title={isSidebarCollapsed ? item.name : undefined}
                  >
                    <div className="flex items-center space-x-3">
                      <item.icon className={cn(
                        "w-5 h-5 transition-colors shrink-0",
                        (isChildActive || isOpen) ? accentText : `text-[var(--text-muted)] group-hover:${accentText}`
                      )} />
                      {!isSidebarCollapsed && (
                        <span className="text-sm font-semibold tracking-wide">{item.name}</span>
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
                        <ChevronDown className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
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
                        <div className="pl-3 pr-1 py-1 space-y-1 border-l-2 border-[var(--border)] ml-6">
                          {item.children.map(child => {
                            const isActive = location.pathname === child.path;
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                className={cn(
                                  'flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 group relative',
                                  isActive
                                    ? `text-[var(--text-primary)] font-bold ${accentBg} shadow-sm border ${accentBorder}`
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                                )}
                              >
                                {isActive && (
                                  <motion.div layoutId={`sidebar-active-indicator-${item.name}`} className={cn("absolute left-0 w-1 h-1/2 rounded-r-full top-1/4", isASE ? "bg-amber-500" : "bg-sky-500")} />
                                )}
                                <child.icon className={cn(
                                  "w-4 h-4 transition-colors shrink-0",
                                  isActive ? accentText : `text-[var(--text-muted)] group-hover:${accentText}`
                                )} />
                                <span className="text-xs font-semibold tracking-wide">{child.name}</span>
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
                    'flex items-center rounded-xl transition-all duration-200 group relative overflow-hidden',
                    isSidebarCollapsed ? 'justify-center p-3.5' : 'space-x-3 px-4 py-3',
                    isActive
                      ? `text-[var(--text-primary)] font-bold ${accentBg} border ${accentBorder} shadow-sm`
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  )}
                  title={isSidebarCollapsed ? item.name : undefined}
                >
                  {isActive && (
                    <motion.div layoutId="sidebar-active-bg" className={cn("absolute inset-0 bg-gradient-to-r border rounded-xl", accentGradient, accentBorder)}></motion.div>
                  )}
                  <item.icon className={cn(
                    "w-5 h-5 relative z-10 transition-colors shrink-0",
                    isActive ? accentText : `text-[var(--text-muted)] group-hover:${accentText}`
                  )} />
                  {!isSidebarCollapsed && (
                    <span className="text-[13px] font-semibold tracking-wide relative z-10">{item.name}</span>
                  )}

                  {isActive && !isSidebarCollapsed && (
                    <motion.div layoutId="sidebar-active-dot" className={cn("absolute right-3 w-1.5 h-1.5 rounded-full", accentDot)}></motion.div>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-[var(--border)]", isSidebarCollapsed ? "p-4" : "p-5")}>
        {isSidebarCollapsed ? (
          <div className="flex flex-col items-center justify-center gap-3">
            <div
              className={cn(
                "w-3 h-3 rounded-full animate-pulse",
                isAnyServerRunning
                  ? isASE ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]"
                  : "bg-slate-400 dark:bg-slate-500 shadow-sm"
              )}
              title={`${t('sidebar.systemStatus', 'System Status')}: ${systemStatus}`}
            />
            <span className="text-[9px] font-mono text-[var(--text-muted)] select-none">
              v{appVersion.split('-')[0]}
            </span>
          </div>
        ) : (
          <div className={cn("glass-panel rounded-2xl p-4 border border-[var(--border)] shadow-sm bg-gradient-to-br", isASE ? "from-amber-500/10 to-orange-500/10" : "from-sky-500/10 to-blue-500/10")}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[var(--text-primary)]">{t('sidebar.systemStatus', 'System Status')}</span>
              <span className={cn(
                "text-xs font-bold",
                isAnyServerRunning ? accentText : "text-[var(--text-muted)]"
              )}>
                {systemStatus}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5">
              <div className={cn(
                "h-1.5 rounded-full w-full",
                isAnyServerRunning
                  ? isASE ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]"
                  : "bg-slate-400 dark:bg-slate-600"
              )}></div>
            </div>
            
            {/* Evolved support Toggle */}
            <div className="mt-3.5 pt-3 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--text-secondary)]">Show Evolved (ASE)</span>
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
                  showAseMode ? (isASE ? "bg-amber-500" : "bg-sky-500") : "bg-slate-300 dark:bg-slate-700"
                )}
                role="switch"
                aria-checked={showAseMode}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    showAseMode ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            <div className="mt-3 text-[10px] text-[var(--text-muted)] flex items-center justify-center gap-1 font-mono">
              <span>v{appVersion.replace('-0', '-beta')}</span>
              {(appVersion.includes('beta') || appVersion.includes('-0')) && (
                <span className={cn(
                  "px-1 py-0.2 text-[8px] font-extrabold tracking-wider rounded uppercase scale-90 origin-center leading-none",
                  isASE
                    ? "bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400"
                    : "bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400"
                )}>
                  Beta
                </span>
              )}
              <span>• 🐲 {isASE ? 'ASE' : 'ASA'} Manager</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
