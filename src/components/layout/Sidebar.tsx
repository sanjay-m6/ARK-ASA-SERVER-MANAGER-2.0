import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
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
  ChevronRight,
  Folder
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useServerStore } from '../../stores/serverStore';
import logo from '../../assets/logo.png';

const navigation = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Server Manager', path: '/servers', icon: Server },
  { name: 'RCON Console', path: '/rcon', icon: Terminal },
  { name: 'Scheduler', path: '/scheduler', icon: Clock },
  { name: 'Mod Manager', path: '/mods', icon: Puzzle },
  { name: 'Config Editor', path: '/config', icon: FileEdit },
  { name: 'Cluster Manager', path: '/clusters', icon: Network },
  { name: 'Backups & Rollbacks', path: '/backups', icon: Database },
  { name: 'Logs Console', path: '/logs', icon: ScrollText },
  {
    name: 'Tools',
    icon: Wrench,
    children: [
      { name: 'Advanced', path: '/tools/advanced', icon: Cpu },
      { name: 'Discord Bot', path: '/tools/discord', icon: MessageSquare },
      { name: 'Plugins', path: '/tools/plugins', icon: Plug },
      { name: 'File Manager', path: '/tools/files', icon: Folder },
    ]
  },
  { name: 'Settings', path: '/settings', icon: SettingsIcon },
];

export default function Sidebar() {
  const location = useLocation();
  const [appVersion, setAppVersion] = useState<string>('');
  const servers = useServerStore((state) => state.servers);
  const [openSections, setOpenSections] = useState<string[]>(['Tools']);

  // Check if any server is running
  const runningServers = servers.filter((s) => s.status === 'running');
  const isAnyServerRunning = runningServers.length > 0;
  const systemStatus = isAnyServerRunning ? 'RUNNING' : 'ONLINE';

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
    <div className="w-72 glass-panel border-r-0 border-r-white/5 flex flex-col h-screen relative z-50">
      {/* Logo */}
      <div className="p-8 pb-6">
        <div className="flex items-center space-x-4">
          <div className="relative group">
            <div className="absolute inset-0 bg-cyan-500/30 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity"></div>
            <img
              src={logo}
              alt="ASA Manager"
              className="w-16 h-16 rounded-xl object-contain drop-shadow-[0_0_15px_rgba(6,182,212,0.3)] transform transition-transform group-hover:scale-105"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 font-display">ARK Manager</h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide">COMMAND CENTER 2.1</p>
          </div>
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
                      (isChildActive || isOpen) ? "text-cyan-400" : "group-hover:text-cyan-400"
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
                              ? 'text-white bg-cyan-500/10'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          )}
                        >
                          <child.icon className={cn(
                            "w-4 h-4 transition-colors",
                            isActive ? "text-cyan-400" : "group-hover:text-cyan-400"
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
                  ? 'text-white shadow-lg shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 rounded-xl"></div>
              )}
              <item.icon className={cn(
                "w-5 h-5 relative z-10 transition-colors",
                isActive ? "text-cyan-400" : "group-hover:text-cyan-400"
              )} />
              <span className="text-sm font-medium relative z-10">{item.name}</span>

              {isActive && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-6 border-t border-white/5">
        <div className="glass-panel rounded-xl p-4 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-300">System Status</span>
            <span className={cn(
              "text-xs font-bold",
              isAnyServerRunning ? "text-cyan-400" : "text-green-400"
            )}>
              {systemStatus}
            </span>
          </div>
          <div className="w-full bg-slate-700/50 rounded-full h-1">
            <div className={cn(
              "h-1 rounded-full w-full",
              isAnyServerRunning
                ? "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                : "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
            )}></div>
          </div>
          <div className="mt-3 text-[10px] text-slate-500 text-center font-mono">
            v{appVersion} • 🐲 ASA Manager
          </div>
        </div>
      </div>
    </div>
  );
}
