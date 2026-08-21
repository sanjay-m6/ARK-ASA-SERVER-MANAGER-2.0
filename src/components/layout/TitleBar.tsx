import { useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import { exit } from '@tauri-apps/plugin-process';
import { Minus, Square, Minimize2, X, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import { useServerStore } from '../../stores/serverStore';
import asaLogo from '../../assets/ASA.png';
import aseLogo from '../../assets/ASE.png';
import CloseAppModal from '../modals/CloseAppModal';
import AppUpdateModal from '../modals/AppUpdateModal';

// Apple-inspired spring curves
const appleSpring = { type: 'spring' as const, stiffness: 500, damping: 30, mass: 0.8 };


function LiveClock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    const startClock = () => {
      setCurrentTime(new Date());
      timer = setInterval(() => setCurrentTime(new Date()), 1000);
    };

    const stopClock = () => {
      clearInterval(timer);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        startClock();
      } else {
        stopClock();
      }
    };

    startClock();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopClock();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="flex items-center text-sm font-medium text-[var(--text-primary)] tracking-wide">
      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
    </div>
  );
}

export default function TitleBar() {
  const { activeGame } = useGameStore();
  const { servers } = useServerStore();
  const isASE = activeGame === 'ASE';
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const appWindow = isTauri ? getCurrentWindow() : null;

  // Server stats
  const runningServers = servers.filter((s) => s.status === 'running' || s.status === 'online').length;
  const totalServers = servers.length;

  useEffect(() => {
    if (!appWindow) return;

    const updateMaximizedStatus = async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
      } catch (err) {
        console.error('Failed to get window maximize status:', err);
      }
    };

    updateMaximizedStatus();

    const unlistenResize = appWindow.onResized(() => {
      updateMaximizedStatus();
    });

    return () => {
      unlistenResize.then((unlisten: () => void) => unlisten());
    };
  }, [appWindow]);

  // App version
  useEffect(() => {
    getVersion().then((v) => setAppVersion(v)).catch(() => setAppVersion(''));
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      if (appWindow) await appWindow.minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  }, [appWindow]);

  const handleMaximizeToggle = useCallback(async () => {
    try {
      if (appWindow) {
        const isMax = await appWindow.isMaximized();
        if (isMax) {
          await appWindow.unmaximize();
          setIsMaximized(false);
        } else {
          await appWindow.maximize();
          setIsMaximized(true);
        }
      }
    } catch (err) {
      console.error('Failed to toggle window maximize:', err);
      try {
        if (appWindow) await appWindow.toggleMaximize();
      } catch (fallbackErr) {
        console.error('Fallback toggleMaximize failed:', fallbackErr);
      }
    }
  }, [appWindow]);

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Intercept window close requested event
  useEffect(() => {
    if (!appWindow) return;
    const unlistenPromise = appWindow.onCloseRequested(async (event: any) => {
      const remember = localStorage.getItem('rememberCloseAction') === 'true';
      const pref = localStorage.getItem('closeActionPreference');

      if (remember && pref === 'tray') {
        event.preventDefault();
        try {
          await appWindow.hide();
        } catch (e) {
          await appWindow.minimize();
        }
      } else if (remember && pref === 'exit') {
        event.preventDefault();
        try {
          await exit(0);
        } catch (e) {
          console.error("Failed to exit app:", e);
        }
      } else {
        event.preventDefault();
        setIsCloseModalOpen(true);
      }
    });

    return () => {
      unlistenPromise.then((unlisten: () => void) => unlisten());
    };
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    const remember = localStorage.getItem('rememberCloseAction') === 'true';
    const pref = localStorage.getItem('closeActionPreference');

    if (remember && pref === 'tray') {
      try {
        if (appWindow) await appWindow.hide();
      } catch (err) {
        if (appWindow) await appWindow.minimize();
      }
    } else if (remember && pref === 'exit') {
      try {
        await exit(0);
      } catch (err) {
        if (appWindow) await appWindow.destroy();
      }
    } else {
      setIsCloseModalOpen(true);
    }
  }, [appWindow]);



  return (
    <div
      data-tauri-drag-region
      className="relative flex items-center justify-between w-full h-14 bg-[var(--surface)] text-[var(--text-primary)] border-b border-[var(--border)] shadow-sm overflow-hidden select-none z-50 shrink-0 cursor-default transition-colors duration-300"
    >
      {/* ═══ LEFT: Logo + App Title + Meta ═══ */}
      <div className="flex items-center gap-3 pl-4 pointer-events-none z-10">
        {/* Logo container */}
        <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-[var(--surface-hover)] shadow-sm border border-[var(--border)]">
          <img
            src={isASE ? aseLogo : asaLogo}
            alt="Logo"
            className="w-6 h-6 object-contain relative z-10"
          />
        </div>

        {/* Title */}
        <span className="text-sm font-bold text-[var(--text-primary)] tracking-wide ml-1">
          ARK Server Manager
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 ml-2 pointer-events-auto">
          {appVersion && (
            <button
              onClick={() => setIsUpdateModalOpen(true)}
              className="text-[9px] font-mono font-medium text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 cursor-pointer transition-all"
              title="Click to check for application updates"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
              v{appVersion} (Check Updates)
            </button>
          )}
          <span className="text-[9px] font-bold text-[var(--text-secondary)] bg-[var(--surface-hover)] border border-[var(--border)] px-1.5 py-0.5 rounded-full shadow-sm">
            {isASE ? 'ASE' : 'ASA'}
          </span>
        </div>
      </div>

      {/* ═══ RIGHT: Status + Clock + Controls ═══ */}
      <div className="flex items-center gap-4 pr-3 z-10 h-full">
        {/* Game Server Status Badge */}
        <div 
          title={
            runningServers > 0
              ? `Game Server Status: ${runningServers} active server instance(s) running`
              : totalServers > 0
              ? `Game Server Status: All ${totalServers} configured servers are currently stopped (Standby)`
              : 'Game Server Status: No game servers created or running currently (Offline)'
          }
          className={`flex items-center gap-2 px-2.5 py-1 rounded-full border shadow-sm transition-all cursor-help ${
            runningServers > 0
              ? 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
              : totalServers > 0
              ? 'bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
              : 'bg-slate-500/10 border-slate-500/20'
          }`}
        >
          <div className="relative flex items-center justify-center w-2 h-2">
            {runningServers > 0 && <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />}
            <div className={`w-1.5 h-1.5 rounded-full ${
              runningServers > 0 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : totalServers > 0 ? 'bg-amber-400' : 'bg-slate-400'
            }`} />
          </div>
          <span className={`text-[10px] font-bold tracking-wider ${
            runningServers > 0 ? 'text-emerald-400' : totalServers > 0 ? 'text-amber-400' : 'text-slate-400'
          }`}>
            {runningServers > 0 ? 'SERVERS: ONLINE' : totalServers > 0 ? 'SERVERS: STANDBY' : 'SERVERS: OFFLINE'}
          </span>
        </div>

        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Clock */}
        <LiveClock />

        {/* Window Controls Pill */}
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 ml-2 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] shadow-inner cursor-default"
          data-tauri-drag-region="false"
          style={{ WebkitAppRegion: 'no-drag', AppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Minimize */}
          <motion.button
            onClick={handleMinimize}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag', AppRegion: 'no-drag' } as React.CSSProperties}
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.3)] transition-all hover:bg-yellow-500/20 hover:shadow-[0_0_15px_rgba(234,179,8,0.5)] focus:outline-none cursor-pointer"
            title="Minimize"
            whileTap={{ scale: 0.85 }}
            transition={appleSpring}
          >
            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
          </motion.button>

          {/* Maximize */}
          <motion.button
            onClick={handleMaximizeToggle}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag', AppRegion: 'no-drag' } as React.CSSProperties}
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.5)] focus:outline-none cursor-pointer"
            title={isMaximized ? 'Restore' : 'Maximize'}
            whileTap={{ scale: 0.85 }}
            transition={appleSpring}
          >
            {isMaximized ? (
              <Minimize2 className="w-3 h-3 stroke-[2.5]" />
            ) : (
              <Square className="w-3 h-3 stroke-[2.5]" />
            )}
          </motion.button>

          {/* Close */}
          <motion.button
            onClick={handleClose}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag', AppRegion: 'no-drag' } as React.CSSProperties}
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-red-500/40 bg-red-500/10 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)] transition-all hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] focus:outline-none cursor-pointer"
            title="Close"
            whileTap={{ scale: 0.85 }}
            transition={appleSpring}
          >
            <X className="w-3.5 h-3.5 stroke-[2.5]" />
          </motion.button>
        </div>
      </div>

      <CloseAppModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
      />
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
}
