import { useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
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


export default function TitleBar() {
  const { activeGame } = useGameStore();
  const { servers } = useServerStore();
  const isASE = activeGame === 'ASE';
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
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
      unlistenResize.then((unlisten) => unlisten());
    };
  }, [appWindow]);

  // App version
  useEffect(() => {
    getVersion().then((v) => setAppVersion(v)).catch(() => setAppVersion(''));
  }, []);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);



  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const handleMinimize = useCallback(async () => {
    try {
      if (appWindow) await appWindow.minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  }, [appWindow]);

  const handleMaximizeToggle = useCallback(async () => {
    try {
      if (appWindow) await appWindow.toggleMaximize();
    } catch (err) {
      console.error('Failed to toggle window maximize:', err);
    }
  }, [appWindow]);

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Intercept window close requested event
  useEffect(() => {
    if (!appWindow) return;
    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
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
        // Allow default close
      } else {
        event.preventDefault();
        setIsCloseModalOpen(true);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
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
        if (appWindow) await appWindow.close();
      } catch (err) {
        console.error('Failed to close window:', err);
      }
    } else {
      setIsCloseModalOpen(true);
    }
  }, [appWindow]);



  return (
    <div
      data-tauri-drag-region
      className="relative flex items-center justify-between w-full h-14 bg-gradient-to-r from-[#111729] via-[#1a2238] to-[#111729] border-b border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden select-none z-50 shrink-0 cursor-default"
    >
      {/* Subtle top-edge highlight and star-like specks */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-screen" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* ═══ LEFT: Logo + App Title + Meta ═══ */}
      <div className="flex items-center gap-3 pl-4 pointer-events-none z-10">
        {/* Logo with strong blue glow */}
        <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-[#0a0f1e] shadow-[0_0_20px_rgba(59,130,246,0.6)] border border-blue-500/20">
          <img
            src={isASE ? aseLogo : asaLogo}
            alt="Logo"
            className="w-6 h-6 object-contain relative z-10"
          />
        </div>

        {/* Title */}
        <span className="text-sm font-semibold text-white tracking-wide ml-1 drop-shadow-md">
          ARK Server Manager
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 ml-2 pointer-events-auto">
          {appVersion && (
            <button
              onClick={() => setIsUpdateModalOpen(true)}
              className="text-[9px] font-mono font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 cursor-pointer transition-all"
              title="Click to check for application updates"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
              v{appVersion} (Check Updates)
            </button>
          )}
          <span className="text-[9px] font-bold text-slate-300 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full shadow-sm">
            {isASE ? 'ASE' : 'ASA'}
          </span>
        </div>
      </div>

      {/* ═══ RIGHT: Status + Clock + Controls ═══ */}
      <div className="flex items-center gap-4 pr-3 z-10 h-full">
        {/* Status Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
          <div className="relative flex items-center justify-center w-2 h-2">
            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>
          <span className="text-[10px] font-bold text-emerald-400 tracking-wider">
            {runningServers > 0 ? 'ONLINE' : totalServers > 0 ? 'STANDBY' : 'OFFLINE'}
          </span>
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* Clock */}
        <div className="flex items-center text-sm font-medium text-white tracking-wide">
          {formatTime(currentTime)}
        </div>

        {/* Window Controls Pill */}
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 ml-2 rounded-full bg-black/40 border border-white/5 shadow-inner"
          data-no-drag
        >
          {/* Minimize */}
          <motion.button
            onClick={handleMinimize}
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.3)] transition-all hover:bg-yellow-500/20 hover:shadow-[0_0_15px_rgba(234,179,8,0.5)] focus:outline-none"
            title="Minimize"
            whileTap={{ scale: 0.85 }}
            transition={appleSpring}
          >
            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
          </motion.button>

          {/* Maximize */}
          <motion.button
            onClick={handleMaximizeToggle}
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.5)] focus:outline-none"
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
            className="relative flex items-center justify-center w-6 h-6 rounded-full border border-red-500/40 bg-red-500/10 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)] transition-all hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] focus:outline-none"
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
