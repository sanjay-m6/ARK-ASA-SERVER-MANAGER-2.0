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
  MessageSquare,
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
    { name: t('sidebar.dashboard'), path: '/dashboard', icon: LayoutDashboard },
    { name: t('sidebar.serverManager'), path: '/servers', icon: Server },
    { name: t('sidebar.rconConsole'), path: '/rcon', icon: Terminal },
    { name: t('sidebar.scheduler'), path: '/scheduler', icon: Clock },
    { name: t('sidebar.modManager'), path: '/mods', icon: Puzzle },
    { name: t('sidebar.configEditor'), path: '/config', icon: FileEdit },
    { name: t('sidebar.clusterManager'), path: '/clusters', icon: Network },
    { name: t('sidebar.backups'), path: '/backups', icon: Database },
    { name: t('sidebar.logsConsole'), path: '/logs', icon: ScrollText },
    {
      name: t('sidebar.tools'),
      icon: Wrench,
      children: [
        { name: t('sidebar.aiAssistant', 'AI Assistant'), path: '/tools/ai', icon: Bot },
        { name: t('sidebar.advanced', 'Boot Launch Parameter'), path: '/tools/advanced', icon: Cpu },
        { name: 'Hardware Allocation', path: '/hardware', icon: Cpu },
        { name: t('sidebar.discordBot'), path: '/tools/discord', icon: MessageSquare },
        { name: t('sidebar.plugins'), path: '/tools/plugins', icon: Plug },
        { name: t('sidebar.fileManager'), path: '/tools/files', icon: Folder },
        { name: t('sidebar.tribeLogs', 'Tribe Logs'), path: '/tools/tribe-logs', icon: ScrollText },
        { name: t('sidebar.serverOrganization', 'Server Organization'), path: '/tools/organization', icon: Folder },
      ]
    },
    { name: t('sidebar.wiki', 'Knowledge Base'), path: '/wiki', icon: FileText },
    { name: t('sidebar.settings'), path: '/settings', icon: SettingsIcon },
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
        { name: 'Discord Bot', path: '/ase/discord', icon: MessageSquare },
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

  const accentText = isASE ? 'text-amber-400' : 'text-cyan-400';
  const accentBg = isASE ? 'bg-amber-500/10' : 'bg-cyan-500/10';
  const accentGlow = isASE ? 'shadow-amber-500/20' : 'shadow-cyan-500/20';
  const accentGradient = isASE ? 'from-amber-500/20 to-orange-500/20' : 'from-cyan-500/20 to-blue-500/20';
  const accentBorder = isASE ? 'border-amber-500/20' : 'border-cyan-500/20';
  const accentDot = isASE ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]';

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
      "glass-panel static-panel border-r-0 border-r-white/5 flex flex-col h-full relative z-50 transition-all duration-300 ease-in-out",
      isSidebarCollapsed ? "w-20" : "w-72"
    )}>
      {/* Logo / Header */}
      <div className={cn("p-6 pb-4", isSidebarCollapsed ? "flex flex-col items-center justify-center gap-3" : "p-8 pb-6")}>
        <div className={cn("flex items-center w-full", isSidebarCollapsed ? "flex-col justify-center gap-3" : "space-x-4 justify-between")}>
          <div className="flex items-center space-x-4">
            <div className="relative group">
              <div className={cn("absolute inset-0 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity", isASE ? "bg-amber-500/30" : "bg-cyan-500/30")}></div>
              <img
                src={isASE ? aseLogo : asaLogo}
                alt="ARK Manager"
                className={cn("rounded-xl object-contain transform transition-transform group-hover:scale-105", isSidebarCollapsed ? "w-10 h-10" : "w-16 h-16", isASE ? "drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]")}
              />
            </div>
            {!isSidebarCollapsed && (
              <div>
                <h1 className={cn("text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r font-display", isASE ? "from-amber-400 to-orange-500" : "from-cyan-400 to-blue-500")}>ARK Manager</h1>
                <p className="text-xs text-slate-400 font-medium tracking-wide">{t('sidebar.commandCenter')} 2.1</p>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
            className={cn(
              "p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-white/5 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shadow-sm",
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
                  ? "bg-amber-500/20 border-amber-500/30 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  : "bg-cyan-500/20 border-cyan-500/30 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
              )}
              title={t('sidebar.switchGame', `Switch to ${activeGame === 'ASA' ? 'ASE' : 'ASA'}`)}
            >
              {activeGame}
            </button>
          ) : (
            <div className="relative flex p-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-2xl shadow-inner backdrop-blur-xl">
              {(['ASA', 'ASE'] as const).map((game) => {
                const isActive = activeGame === game;
                return (
                  <button
                    key={game}
                    onClick={() => handleGameSwitch(game)}
                    className={cn(
                      "relative z-10 flex-1 py-2 rounded-xl text-[11px] font-black tracking-[0.2em] uppercase transition-colors duration-300 cursor-pointer",
                      isActive 
                        ? (game === 'ASE' ? "text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]" : "text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.8)]")
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {game}
                    {isActive && (
                      <motion.div
                        layoutId="activeGamePill"
                        className={cn(
                          "absolute inset-0 rounded-xl border z-[-1]",
                          game === 'ASE' 
                            ? "bg-amber-500/20 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]" 
                            : "bg-cyan-500/20 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
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
            <div className={cn("absolute inset-0 blur-md rounded-xl opacity-0 group-focus-within:opacity-50 transition-opacity duration-500", isASE ? "bg-amber-500/20" : "bg-cyan-500/20")}></div>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-slate-300 transition-colors z-10" />
            <input
              type="text"
              placeholder={t('sidebar.search', 'Search...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0A0F1C]/80 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-white/10 transition-all relative z-10 shadow-inner"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className={cn("flex-1 py-2 space-y-1.5 overflow-y-auto scrollbar-hide", isSidebarCollapsed ? "px-2" : "px-4")}>
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
                        // Also open the section if we are expanding
                        if (!openSections.includes(item.name)) {
                          toggleSection(item.name);
                        }
                      } else {
                        toggleSection(item.name);
                      }
                    }}
                    className={cn(
                      'w-full flex items-center rounded-xl transition-all duration-300 group cursor-pointer',
                      isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5',
                      isChildActive || isOpen
                        ? 'text-white bg-white/5 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    )}
                    title={isSidebarCollapsed ? item.name : undefined}
                  >
                    <div className="flex items-center space-x-3">
                      <item.icon className={cn(
                        "w-5 h-5 transition-colors",
                        (isChildActive || isOpen) ? accentText : `group-hover:${accentText}`
                      )} />
                      {!isSidebarCollapsed && (
                        <span className="text-sm font-medium tracking-wide">{item.name}</span>
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
                        <ChevronDown className="w-4 h-4 text-slate-500" />
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
                        <div className="pl-4 pr-1 py-1 space-y-1 border-l-2 border-white/5 ml-6">
                          {item.children.map(child => {
                            const isActive = location.pathname === child.path;
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                className={cn(
                                  'flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-all duration-300 group relative',
                                  isActive
                                    ? `text-white ${accentBg} shadow-sm border border-white/5`
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                )}
                              >
                                {isActive && (
                                  <motion.div layoutId={`sidebar-active-indicator-${item.name}`} className={cn("absolute left-0 w-1 h-1/2 rounded-r-full top-1/4", isASE ? "bg-amber-400" : "bg-cyan-400")} />
                                )}
                                <child.icon className={cn(
                                  "w-4 h-4 transition-colors",
                                  isActive ? accentText : `group-hover:${accentText}`
                                )} />
                                <span className="text-[13px] font-medium tracking-wide">{child.name}</span>
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
                    'flex items-center rounded-xl transition-all duration-300 group relative overflow-hidden',
                    isSidebarCollapsed ? 'justify-center p-3.5' : 'space-x-3 px-4 py-3.5',
                    isActive
                      ? `text-white shadow-lg ${accentGlow}`
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  )}
                  title={isSidebarCollapsed ? item.name : undefined}
                >
                  {isActive && (
                    <motion.div layoutId="sidebar-active-bg" className={cn("absolute inset-0 bg-gradient-to-r border rounded-xl", accentGradient, accentBorder)}></motion.div>
                  )}
                  <item.icon className={cn(
                    "w-5 h-5 relative z-10 transition-colors",
                    isActive ? accentText : `group-hover:${accentText}`
                  )} />
                  {!isSidebarCollapsed && (
                    <span className="text-[13px] font-medium tracking-wide relative z-10">{item.name}</span>
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
      <div className={cn("border-t border-white/5", isSidebarCollapsed ? "p-4" : "p-6")}>
        {isSidebarCollapsed ? (
          <div className="flex flex-col items-center justify-center gap-3">
            <div
              className={cn(
                "w-3 h-3 rounded-full animate-pulse",
                isAnyServerRunning
                  ? isASE ? "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                  : "bg-slate-500 shadow-[0_0_10px_rgba(100,116,139,0.3)]"
              )}
              title={`${t('sidebar.systemStatus', 'System Status')}: ${systemStatus}`}
            />
            <span className="text-[9px] font-mono text-slate-500 select-none">
              v{appVersion.split('-')[0]}
            </span>
          </div>
        ) : (
          <div className={cn("glass-panel rounded-xl p-4 bg-gradient-to-br border-white/5", isASE ? "from-amber-500/10 to-orange-500/10" : "from-cyan-500/10 to-blue-500/10")}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-300">{t('sidebar.systemStatus')}</span>
              <span className={cn(
                "text-xs font-bold",
                isAnyServerRunning ? accentText : "text-slate-500"
              )}>
                {systemStatus}
              </span>
            </div>
            <div className="w-full bg-slate-700/50 rounded-full h-1">
              <div className={cn(
                "h-1 rounded-full w-full",
                isAnyServerRunning
                  ? isASE ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                  : "bg-slate-600"
              )}></div>
            </div>
            
            {/* Evolved support Toggle */}
            <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400">Show Evolved (ASE)</span>
              <button
                onClick={() => {
                  const newVal = !showAseMode;
                  setShowAseMode(newVal);
                  if (!newVal && activeGame === 'ASE') {
                    handleGameSwitch('ASA');
                  }
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75",
                  showAseMode ? (isASE ? "bg-amber-500" : "bg-cyan-500") : "bg-slate-700"
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

            <div className="mt-3 text-[10px] text-slate-500 flex items-center justify-center gap-1 font-mono">
              <span>v{appVersion.replace('-0', '-beta')}</span>
              {(appVersion.includes('beta') || appVersion.includes('-0')) && (
                <span className={cn(
                  "px-1 py-0.2 text-[8px] font-extrabold tracking-wider rounded uppercase scale-90 origin-center leading-none",
                  isASE
                    ? "bg-amber-500/10 border border-amber-500/30 text-amber-400"
                    : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
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
