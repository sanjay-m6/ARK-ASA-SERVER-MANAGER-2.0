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
  History,
  MessageSquare,
  Settings as SettingsIcon,
  Wrench,
  Cpu,
  Plug,
  ChevronDown,
  ChevronRight,
  Folder,
  Bot,
  Wifi,
  FileText,
  RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/helpers';
import { useServerStore } from '../../stores/serverStore';
import { useGameStore } from '../../stores/gameStore';
import logo from '../../assets/logo.png';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState<string>('');
  const servers = useServerStore((state) => state.servers);
  const [openSections, setOpenSections] = useState<string[]>(['Tools']);
  const { t } = useTranslation();

  const { activeGame, setActiveGame } = useGameStore();
  const isASE = activeGame === 'ASE';

  const asaNavigation = [
    { name: t('sidebar.dashboard'), path: '/dashboard', icon: LayoutDashboard },
    { name: t('sidebar.serverManager'), path: '/servers', icon: Server },
    { name: t('sidebar.rconConsole'), path: '/rcon', icon: Terminal },
    { name: t('sidebar.scheduler'), path: '/scheduler', icon: Clock },
    { name: t('sidebar.modManager'), path: '/mods', icon: Puzzle },
    { name: t('sidebar.configEditor'), path: '/config', icon: FileEdit },
    { name: t('sidebar.clusterManager'), path: '/clusters', icon: Network },
    { name: t('sidebar.backups'), path: '/backups', icon: Database },
    { name: t('sidebar.autoSaves', 'Auto-Saves'), path: '/autosaves', icon: History },
    { name: t('sidebar.logsConsole'), path: '/logs', icon: ScrollText },
    {
      name: t('sidebar.tools'),
      icon: Wrench,
      children: [
        { name: t('sidebar.aiAssistant', 'AI Assistant'), path: '/tools/ai', icon: Bot },
        { name: t('sidebar.advanced'), path: '/tools/advanced', icon: Cpu },
        { name: 'Hardware Allocation', path: '/hardware', icon: Cpu },
        { name: t('sidebar.discordBot'), path: '/tools/discord', icon: MessageSquare },
        { name: t('sidebar.plugins'), path: '/tools/plugins', icon: Plug },
        { name: t('sidebar.fileManager'), path: '/tools/files', icon: Folder },
        { name: t('sidebar.tribeLogs', 'Tribe Logs'), path: '/tools/tribe-logs', icon: ScrollText },
        { name: t('sidebar.upnp', 'UPnP Ports'), path: '/tools/upnp', icon: Wifi },
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
    { name: 'Mod Manager', path: '/ase/mods', icon: Puzzle },
    { name: 'Config Editor', path: '/ase/config', icon: FileEdit },
    { name: 'Cluster Manager', path: '/ase/clusters', icon: Network },
    { name: 'Backups', path: '/ase/backups', icon: Database },
    { name: 'Auto-Saves', path: '/ase/autosaves', icon: History },
    { name: 'Logs Console', path: '/ase/logs', icon: ScrollText },
    {
      name: 'Tools',
      icon: Wrench,
      children: [
        { name: 'AI Assistant', path: '/ase/tools/ai', icon: Bot },
        { name: 'Advanced Config', path: '/ase/tools/advanced', icon: Cpu },
        { name: 'Hardware Allocation', path: '/ase/hardware', icon: Cpu },
        { name: 'File Manager', path: '/ase/files', icon: Folder },
        { name: 'Discord Bot', path: '/ase/discord', icon: MessageSquare },
        { name: 'Profile Sync', path: '/ase/profile-sync', icon: RefreshCw },
        { name: 'Plugins Manager', path: '/ase/tools/plugins', icon: Plug },
        { name: 'Tribe Logs', path: '/ase/tools/tribe-logs', icon: ScrollText },
        { name: 'UPnP Ports', path: '/ase/tools/upnp', icon: Wifi },
        { name: 'Server Organization', path: '/ase/tools/organization', icon: Folder },
      ]
    },
    { name: t('sidebar.wiki', 'Knowledge Base'), path: '/wiki', icon: FileText },
    { name: 'ASE Settings', path: '/ase/settings', icon: SettingsIcon },
  ];

  const navigation = isASE ? aseNavigation : asaNavigation;
  const accentText = isASE ? 'text-amber-400' : 'text-cyan-400';
  const accentBg = isASE ? 'bg-amber-500/10' : 'bg-cyan-500/10';
  const accentGlow = isASE ? 'shadow-amber-500/20' : 'shadow-cyan-500/20';
  const accentGradient = isASE ? 'from-amber-500/20 to-orange-500/20' : 'from-cyan-500/20 to-blue-500/20';
  const accentBorder = isASE ? 'border-amber-500/20' : 'border-cyan-500/20';
  const accentDot = isASE ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]';

  const handleGameSwitch = (game: 'ASA' | 'ASE') => {
    setActiveGame(game);
    navigate(game === 'ASE' ? '/ase/dashboard' : '/dashboard');
  };

  // Check if any server is running
  const runningServers = servers.filter((s) => s.status === 'running');
  const isAnyServerRunning = runningServers.length > 0;
  const systemStatus = isAnyServerRunning ? t('serverManager.serverStatus.running') : t('serverManager.serverStatus.online');

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

  return (
    <div className="w-72 glass-panel static-panel border-r-0 border-r-white/5 flex flex-col h-screen relative z-50">
      {/* Logo */}
      <div className="p-8 pb-6">
        <div className="flex items-center space-x-4">
          <div className="relative group">
            <div className={cn("absolute inset-0 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity", isASE ? "bg-amber-500/30" : "bg-cyan-500/30")}></div>
            <img
              src={logo}
              alt="ARK Manager"
              className={cn("w-16 h-16 rounded-xl object-contain transform transition-transform group-hover:scale-105", isASE ? "drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]")}
            />
          </div>
          <div>
            <h1 className={cn("text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r font-display", isASE ? "from-amber-400 to-orange-500" : "from-cyan-400 to-blue-500")}>ARK Manager</h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide">{t('sidebar.commandCenter')} 2.1</p>
          </div>
        </div>
      </div>

      {/* Game Switcher */}
      <div className="px-5 pb-4">
        <div className="relative flex p-1.5 bg-[#0A0F1C]/80 border border-white/5 rounded-2xl shadow-inner backdrop-blur-xl">
          {(['ASA', 'ASE'] as const).map((game) => {
            const isActive = activeGame === game;
            return (
              <button
                key={game}
                onClick={() => handleGameSwitch(game)}
                className={cn(
                  "relative z-10 flex-1 py-2 rounded-xl text-[11px] font-black tracking-[0.2em] uppercase transition-colors duration-300",
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
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto scrollbar-hide">
        {navigation.map((item) => {
          if (item.children) {
            const isOpen = openSections.includes(item.name);
            const isChildActive = item.children.some(child => location.pathname === child.path);

            return (
              <div key={item.name} className="space-y-1">
                <button
                  onClick={() => toggleSection(item.name)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group',
                    isChildActive || isOpen
                      ? 'text-white bg-white/5'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className={cn(
                      "w-5 h-5 transition-colors",
                      (isChildActive || isOpen) ? accentText : `group-hover:${accentText}`
                    )} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {isOpen && (
                  <div className="pl-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {item.children.map(child => {
                      const isActive = location.pathname === child.path;
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={cn(
                            'flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-all duration-300 group relative',
                            isActive
                              ? `text-white ${accentBg}`
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          )}
                        >
                          <child.icon className={cn(
                            "w-4 h-4 transition-colors",
                            isActive ? accentText : `group-hover:${accentText}`
                          )} />
                          <span className="text-sm font-medium">{child.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path || '#'}
              className={cn(
                'flex items-center space-x-3 px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden',
                isActive
                  ? `text-white shadow-lg ${accentGlow}`
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              {isActive && (
                <div className={cn("absolute inset-0 bg-gradient-to-r border rounded-xl", accentGradient, accentBorder)}></div>
              )}
              <item.icon className={cn(
                "w-5 h-5 relative z-10 transition-colors",
                isActive ? accentText : `group-hover:${accentText}`
              )} />
              <span className="text-sm font-medium relative z-10">{item.name}</span>

              {isActive && (
                <div className={cn("absolute right-3 w-1.5 h-1.5 rounded-full", accentDot)}></div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-6 border-t border-white/5">
        <div className={cn("glass-panel rounded-xl p-4 bg-gradient-to-br border-white/5", isASE ? "from-amber-500/10 to-orange-500/10" : "from-cyan-500/10 to-blue-500/10")}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-300">{t('sidebar.systemStatus')}</span>
            <span className={cn(
              "text-xs font-bold",
              isAnyServerRunning ? accentText : "text-green-400"
            )}>
              {systemStatus}
            </span>
          </div>
          <div className="w-full bg-slate-700/50 rounded-full h-1">
            <div className={cn(
              "h-1 rounded-full w-full",
              isAnyServerRunning
                ? isASE ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                : "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
            )}></div>
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
      </div>
    </div>
  );
}
