import { useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import { Minus, Maximize2, Minimize2, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/helpers';
import { useGameStore } from '../../stores/gameStore';
import { useServerStore } from '../../stores/serverStore';
import asaLogo from '../../assets/ASA.png';
import aseLogo from '../../assets/ASE.png';

// Apple-inspired spring curves
const appleSpring = { type: 'spring' as const, stiffness: 500, damping: 30, mass: 0.8 };
const appleSoft = { type: 'spring' as const, stiffness: 300, damping: 25, mass: 1 };

export default function TitleBar() {
  const { activeGame } = useGameStore();
  const { servers } = useServerStore();
  const isASE = activeGame === 'ASE';
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hoveredControls, setHoveredControls] = useState(false);
  const [clickedBtn, setClickedBtn] = useState<string | null>(null);
  const appWindow = getCurrentWindow();

  // Server stats
  const runningServers = servers.filter((s) => s.status === 'running' || s.status === 'online').length;
  const totalServers = servers.length;

  useEffect(() => {
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
    setClickedBtn('minimize');
    setTimeout(() => setClickedBtn(null), 400);
    try {
      await appWindow.minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  }, [appWindow]);

  const handleMaximizeToggle = useCallback(async () => {
    setClickedBtn('maximize');
    setTimeout(() => setClickedBtn(null), 400);
    try {
      await appWindow.toggleMaximize();
    } catch (err) {
      console.error('Failed to toggle window maximize:', err);
    }
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    setClickedBtn('close');
    setTimeout(async () => {
      try {
        await appWindow.close();
      } catch (err) {
        console.error('Failed to close window:', err);
      }
    }, 180);
  }, [appWindow]);



  return (
    <div
      data-tauri-drag-region
      className="relative flex items-center justify-between w-full h-10 bg-gradient-to-r from-[#020617] via-[#0a0f1e] to-[#020617] border-b border-white/[0.03] select-none z-50 shrink-0 cursor-default"
    >
      {/* Subtle top-edge highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* ═══ LEFT: Logo + App Title + Meta ═══ */}
      <div className="flex items-center gap-2.5 pl-4 pointer-events-none">
        {/* Logo with glow */}
        <div className="relative">
          <div className={cn(
            "absolute -inset-1 rounded-full blur-lg opacity-30",
            isASE ? "bg-amber-500/40" : "bg-cyan-500/40"
          )} />
          <img
            src={isASE ? aseLogo : asaLogo}
            alt="Logo"
            className={cn(
              "w-[18px] h-[18px] object-contain rounded-[3px] relative z-10",
              isASE ? "drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]" : "drop-shadow-[0_0_6px_rgba(6,182,212,0.35)]"
            )}
          />
        </div>

        {/* Title */}
        <span className="text-[11px] font-semibold text-slate-300/90 tracking-[0.01em]">
          ARK Server Manager
        </span>

        {/* Game Badge */}
        <motion.span
          key={isASE ? 'ase' : 'asa'}
          initial={{ y: -8, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={appleSoft}
          className={cn(
            "text-[7px] font-black tracking-[0.2em] uppercase px-1.5 py-[2px] rounded-[3px] border",
            isASE
              ? "bg-amber-500/10 text-amber-400/90 border-amber-500/15"
              : "bg-cyan-500/10 text-cyan-400/90 border-cyan-500/15"
          )}
        >
          {isASE ? 'ASE' : 'ASA'}
        </motion.span>

        {/* Version */}
        {appVersion && (
          <>
            <div className="w-px h-3 bg-slate-700/30" />
            <span className="text-[9px] font-mono text-slate-600 tracking-tight">
              v{appVersion}
            </span>
          </>
        )}
      </div>

      {/* ═══ CENTER: Status Bar ═══ */}
      <div className="flex items-center gap-3 pointer-events-none absolute left-1/2 -translate-x-1/2">
        {/* Server Status */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <div className={cn(
              "w-[5px] h-[5px] rounded-full",
              runningServers > 0 ? "bg-emerald-400" : "bg-slate-600"
            )} />
            {runningServers > 0 && (
              <div className="absolute inset-0 w-[5px] h-[5px] rounded-full bg-emerald-400 animate-ping opacity-50" />
            )}
          </div>
          <span className="text-[8px] font-semibold text-slate-500/80 tracking-[0.08em] uppercase">
            {runningServers > 0
              ? `${runningServers}/${totalServers} Online`
              : totalServers > 0 ? 'Standby' : 'No Servers'
            }
          </span>
        </div>

        <div className="w-[3px] h-[3px] rounded-full bg-slate-700/40" />

        {/* Clock */}
        <div className="flex items-center gap-1">
          <Clock className="w-[9px] h-[9px] text-slate-600/70" />
          <span className="text-[8px] font-mono text-slate-500/70 tabular-nums tracking-tight">
            {formatTime(currentTime)}
          </span>
        </div>
      </div>

      {/* ═══ RIGHT: Window Controls (Always Visible Colors) ═══ */}
      <div
        className="flex items-center gap-2.5 pr-4 pl-8 h-full border-l border-white/[0.05] ml-4"
        onMouseEnter={() => setHoveredControls(true)}
        onMouseLeave={() => setHoveredControls(false)}
        data-no-drag
      >
        {/* Minimize — Yellow/Amber — ALWAYS colored */}
        <motion.button
          onClick={handleMinimize}
          className="relative flex items-center justify-center w-4 h-4 rounded-full focus:outline-none"
          title="Minimize"
          whileTap={{ scale: 0.7 }}
          transition={appleSpring}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-200",
              clickedBtn === 'minimize'
                ? "bg-yellow-700 shadow-none"
                : "bg-[#febc2e] shadow-[0_0_6px_rgba(254,188,46,0.3)]"
            )}
          />
          {/* Icon appears on hover */}
          <AnimatePresence>
            {hoveredControls && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={appleSpring}
                className="relative z-10"
              >
                <Minus className="w-2.5 h-2.5 text-black/80 stroke-[3]" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {clickedBtn === 'minimize' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-yellow-300"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </motion.button>

        {/* Maximize/Restore — Green — ALWAYS colored */}
        <motion.button
          onClick={handleMaximizeToggle}
          className="relative flex items-center justify-center w-4 h-4 rounded-full focus:outline-none"
          title={isMaximized ? 'Restore' : 'Maximize'}
          whileTap={{ scale: 0.7 }}
          transition={appleSpring}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-200",
              clickedBtn === 'maximize'
                ? "bg-green-700 shadow-none"
                : "bg-[#28c840] shadow-[0_0_6px_rgba(40,200,64,0.3)]"
            )}
          />
          <AnimatePresence mode="wait">
            {hoveredControls && (
              <motion.div
                key={isMaximized ? 'restore' : 'maximize'}
                initial={{ scale: 0, opacity: 0, rotate: -45 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0, rotate: 45 }}
                transition={appleSpring}
                className="relative z-10"
              >
                {isMaximized ? (
                  <Minimize2 className="w-2.5 h-2.5 text-black/80 stroke-[3]" />
                ) : (
                  <Maximize2 className="w-2.5 h-2.5 text-black/80 stroke-[3]" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {clickedBtn === 'maximize' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-green-300"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </motion.button>

        {/* Close — Red — ALWAYS colored */}
        <motion.button
          onClick={handleClose}
          className="relative flex items-center justify-center w-4 h-4 rounded-full focus:outline-none"
          title="Close"
          whileTap={{ scale: 0.7 }}
          transition={appleSpring}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-200",
              clickedBtn === 'close'
                ? "bg-red-700 shadow-none"
                : "bg-[#ff5f57] shadow-[0_0_6px_rgba(255,95,87,0.3)]"
            )}
          />
          <AnimatePresence>
            {hoveredControls && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={appleSpring}
                className="relative z-10"
              >
                <X className="w-2.5 h-2.5 text-black/80 stroke-[3]" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {clickedBtn === 'close' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-red-400"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
