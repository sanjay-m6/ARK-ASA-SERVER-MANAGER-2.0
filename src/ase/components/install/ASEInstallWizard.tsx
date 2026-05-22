import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, ChevronRight, ChevronLeft, MapPin, Wifi, Shield, Rocket, 
  AlertTriangle, HardDrive, GitBranch, Server, Check, FolderOpen, 
  Search, Loader2, Terminal, Clock, Copy, ChevronUp, ChevronDown, 
  ArrowDownToLine, CheckCircle, AlertCircle, Zap, Settings 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../../utils/helpers';
import { ASE_MAPS, ASE_BRANCHES } from '../../data/aseMaps';
import { installAseServer } from '../../utils/aseCommands';
import { suggestNextAsePorts } from '../../utils/aseLaunchArgs';
import { useAseServerStore } from '../../stores/aseServerStore';
import { selectFolder } from '../../../utils/tauri';
import { listen } from '@tauri-apps/api/event';
import type { AseMapName } from '../../types/ase.types';

interface Props { onClose: () => void; }
type Step = 'name' | 'version' | 'map' | 'ports' | 'admin' | 'confirm';
const STEPS: Step[] = ['name', 'version', 'map', 'ports', 'admin', 'confirm'];
const STEP_LABELS: Record<Step, string> = { name: 'Identity', version: 'Version', map: 'Map', ports: 'Network', admin: 'Security', confirm: 'Deploy' };
const STEP_ICONS: Record<Step, React.ReactNode> = { 
  name: <Server className="w-4 h-4" />, 
  version: <GitBranch className="w-4 h-4" />, 
  map: <MapPin className="w-4 h-4" />, 
  ports: <Wifi className="w-4 h-4" />, 
  admin: <Shield className="w-4 h-4" />, 
  confirm: <Rocket className="w-4 h-4" /> 
};

interface InstallProgress {
  stage: string;
  progress: number;
  message: string;
  isComplete: boolean;
  isError: boolean;
}

interface ConsoleOutput {
  timestamp: string;
  line: string;
  lineType: string;
}

export default function ASEInstallWizard({ onClose }: Props) {
  const servers = useAseServerStore(s => s.servers);
  const suggested = suggestNextAsePorts(servers);
  const refreshServers = useAseServerStore(s => s.refreshServers);

  const [step, setStep] = useState<Step>('name');
  const [isInstalling, setIsInstalling] = useState(false);
  const [mapFilter, setMapFilter] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [mapName, setMapName] = useState<AseMapName>('TheIsland');
  const [branch, setBranch] = useState('default');
  const [gamePort, setGamePort] = useState(suggested.gamePort);
  const [queryPort, setQueryPort] = useState(suggested.queryPort);
  const [rconPort, setRconPort] = useState(suggested.rconPort);
  const [adminPassword, setAdminPassword] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [installPath, setInstallPath] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(70);

  // Realtime progress & console states
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleOutput[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const consoleRef = useRef<HTMLDivElement>(null);
  const stepIdx = STEPS.indexOf(step);

  const canNext = () => {
    if (step === 'name') return name.trim().length > 0;
    if (step === 'version') return true;
    if (step === 'map') return true;
    if (step === 'ports') return gamePort > 0 && queryPort > 0 && rconPort > 0;
    if (step === 'admin') return adminPassword.length >= 4;
    return true;
  };

  const next = () => { if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1]); };
  const prev = () => { if (stepIdx > 0) setStep(STEPS[stepIdx - 1]); };

  const handleBrowse = async () => {
    try {
      const selected = await selectFolder('Select Installation Folder');
      if (selected) setInstallPath(selected);
    } catch { /* user cancelled */ }
  };

  const handleInstall = async () => {
    setConsoleLogs([]);
    setProgress({
      stage: 'preparing',
      progress: 0,
      message: 'Initializing ARK: Survival Evolved Dedicated Server installation...',
      isComplete: false,
      isError: false,
    });
    setIsInstalling(true);

    try {
      const path = installPath || `C:\\ARKServerManager\\ase\\${name.replace(/\s+/g, '_')}`;
      await installAseServer(
        name,
        path,
        mapName,
        gamePort,
        queryPort,
        rconPort,
        adminPassword,
        sessionName || name
      );
      
      // Complete!
      setProgress({
        stage: 'complete',
        progress: 100,
        message: 'ARK: Survival Evolved Server installed successfully!',
        isComplete: true,
        isError: false
      });
      
      await refreshServers();
    } catch (e) {
      setProgress({
        stage: 'error',
        progress: 0,
        message: e instanceof Error ? e.message : String(e),
        isComplete: false,
        isError: true,
      });
    }
  };

  // Listen for install progress events
  useEffect(() => {
    if (!isInstalling) return;
    const unlisten = listen<InstallProgress>('install-progress', (event) => {
      setProgress(event.payload);
      if (event.payload.isComplete) {
        toast.success('ASE Server installed successfully!');
      } else if (event.payload.isError) {
        toast.error(event.payload.message);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [isInstalling]);

  // Listen for console output events
  useEffect(() => {
    if (!isInstalling) return;
    const unlisten = listen<ConsoleOutput>('install-console', (event) => {
      setConsoleLogs(prev => [...prev.slice(-200), event.payload]); // Keep last 200 lines
    });
    return () => { unlisten.then(fn => fn()); };
  }, [isInstalling]);

  // Auto-scroll console to bottom (only when auto-scroll is enabled)
  useEffect(() => {
    if (consoleRef.current && showConsole && isAutoScrollEnabled) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLogs, showConsole, isAutoScrollEnabled]);

  // Detect scroll position for scroll-to-bottom button
  const handleConsoleScroll = useCallback(() => {
    if (!consoleRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShowScrollToBottom(!isNearBottom);
    setIsAutoScrollEnabled(isNearBottom);
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTo({
        top: consoleRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setIsAutoScrollEnabled(true);
    }
  }, []);

  // Copy logs to clipboard
  const copyLogsToClipboard = useCallback(() => {
    const logText = consoleLogs.map(log =>
      showTimestamps ? `[${log.timestamp}] ${log.line}` : log.line
    ).join('\n');
    navigator.clipboard.writeText(logText);
    toast.success('Logs copied to clipboard!');
  }, [consoleLogs, showTimestamps]);

  const mapInfo = ASE_MAPS.find(m => m.serverArg === mapName);
  const branchInfo = ASE_BRANCHES.find(b => b.id === branch);
  const filteredMaps = ASE_MAPS.filter(m => !mapFilter || m.name.toLowerCase().includes(mapFilter.toLowerCase()));

  const dlcColor = (t: string) => t === 'Free' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : t === 'Paid DLC' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' : 'bg-sky-500/15 text-sky-400 border-sky-500/20';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25 }}
        className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/10 rounded-xl border border-amber-500/20">
                <Rocket className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {isInstalling ? 'Installing ASE Server' : 'Deploy ASE Server'}
                </h2>
                <p className="text-xs text-slate-500 font-medium">ARK: Survival Evolved • SteamCMD AppID 376030</p>
              </div>
            </div>
            {!isInstalling && (
              <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Step indicators */}
          {!isInstalling && (
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => {
                const isActive = i === stepIdx;
                const isDone = i < stepIdx;
                return (
                  <button key={s} onClick={() => { if (isDone) setStep(s); }}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center border border-transparent',
                      isActive ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                      isDone ? 'text-emerald-400 hover:bg-white/5 cursor-pointer' :
                      'text-slate-600')}>
                    {isDone ? <Check className="w-3 h-3" /> : STEP_ICONS[s]}
                    <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <AnimatePresence mode="wait">
            {isInstalling && progress ? (
              <motion.div key="installing-progress" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
                className="space-y-6 max-w-lg mx-auto py-2">
                
                {/* Server Identity Card */}
                <div className="p-5 rounded-2xl border bg-amber-500/5 border-amber-500/20">
                  <div className="flex items-center gap-4">
                    {mapInfo?.image ? (
                      <img src={mapInfo.image} alt={mapInfo.name} className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                        <Server className="w-6 h-6 text-amber-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white text-base truncate">{name}</h4>
                      <p className="text-xs text-slate-400">{mapInfo?.name || mapName} • {branchInfo?.name || 'Default'}</p>
                    </div>
                  </div>
                </div>

                {/* Progress Circle & Status */}
                <div className="text-center py-4">
                  {progress.isComplete ? (
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 mb-4 animate-bounce">
                      <CheckCircle className="w-10 h-10 text-emerald-400" />
                    </div>
                  ) : progress.isError ? (
                    <div className="space-y-5">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-1">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Installation Failed</h3>
                      <p className="text-red-300/80 text-xs max-w-md mx-auto bg-red-500/10 border border-red-500/20 rounded-xl p-3 leading-relaxed">{progress.message}</p>

                      {/* Recovery Actions */}
                      <div className="flex flex-wrap justify-center gap-2.5 pt-1">
                        <button onClick={handleInstall}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20 text-xs">
                          <Zap className="w-3.5 h-3.5" />
                          Try Again
                        </button>
                        <button onClick={async () => {
                            try {
                              const { repairSteamcmd } = await import('../../../utils/tauri');
                              toast.loading('Repairing SteamCMD...', { id: 'repair' });
                              await repairSteamcmd();
                              toast.success('SteamCMD repaired! Try installing again.', { id: 'repair' });
                            } catch (e) { toast.error(`Repair failed: ${e}`, { id: 'repair' }); }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-amber-500/20 text-xs">
                          <Settings className="w-3.5 h-3.5" />
                          Repair SteamCMD
                        </button>
                        <button onClick={async () => {
                            try {
                              const { clearSteamcmdCache } = await import('../../../utils/tauri');
                              toast.loading('Clearing cache...', { id: 'cache' });
                              await clearSteamcmdCache();
                              toast.success('Cache cleared! Try installing again.', { id: 'cache' });
                            } catch (e) { toast.error(`Clear cache failed: ${e}`, { id: 'cache' }); }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all text-xs">
                          <HardDrive className="w-3.5 h-3.5" />
                          Clear Cache
                        </button>
                      </div>

                      {/* Diagnostic Tips */}
                      <div className="text-left bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-xs space-y-1.5 max-w-md mx-auto leading-normal">
                        <p className="text-slate-300 font-semibold mb-1">Troubleshooting Tips:</p>
                        <p className="text-slate-400">• Ensure at least 30 GB of free disk space (ASE requires ~18 GB)</p>
                        <p className="text-slate-400">• Check that your antivirus or firewall is not blocking SteamCMD</p>
                        <p className="text-slate-400">• Verify stable internet connection</p>
                        <p className="text-slate-400">• Try running the app as Administrator</p>
                        <p className="text-slate-400">• Avoid special characters or spaces in the install path</p>
                      </div>
                    </div>
                  ) : (
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 mb-4 border border-amber-500/20 shadow-lg shadow-amber-500/5">
                      <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                    </div>
                  )}

                  {!progress.isError && (
                    <>
                      <h3 className="text-lg font-bold text-white">
                        {progress.isComplete ? 'Ready to Play!' : 'Installing Server files...'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">{progress.message}</p>
                    </>
                  )}
                </div>

                {/* Progress Bar */}
                {!progress.isError && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-mono">
                      <span className="text-slate-400 capitalize font-medium">{progress.stage}</span>
                      <span className="text-white font-bold">{Math.round(progress.progress)}%</span>
                    </div>
                    <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden border border-white/5 shadow-inner">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          progress.isComplete 
                            ? "bg-emerald-500 shadow-lg shadow-emerald-500/30" 
                            : "bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30"
                        )}
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Scrolling Console Terminal */}
                <div className="rounded-xl overflow-hidden border border-white/5 bg-slate-950/80 shadow-2xl">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      <span className="text-xs font-semibold text-slate-300">SteamCMD Console</span>
                      <span className="text-[10px] text-slate-500 font-mono">({consoleLogs.length} lines)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Toggle Timestamps */}
                      <button onClick={() => setShowTimestamps(!showTimestamps)}
                        className={cn('p-1 rounded transition-all text-xs', showTimestamps ? 'bg-amber-500/10 text-amber-400' : 'hover:bg-white/5 text-slate-500')}
                        title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
                        aria-label="Toggle Timestamps">
                        <Clock className="w-3.5 h-3.5" />
                      </button>
                      {/* Copy Logs */}
                      <button onClick={copyLogsToClipboard} disabled={consoleLogs.length === 0}
                        className="p-1 hover:bg-white/5 rounded transition-all text-slate-500 hover:text-slate-300 disabled:opacity-50"
                        title="Copy logs"
                        aria-label="Copy Logs">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {/* Toggle Console */}
                      <button onClick={() => setShowConsole(!showConsole)}
                        className="p-1 hover:bg-white/5 rounded transition-all"
                        aria-label="Toggle Console">
                        {showConsole ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </button>
                    </div>
                  </div>

                  {showConsole && (
                    <div className="relative">
                      <div
                        ref={consoleRef}
                        onScroll={handleConsoleScroll}
                        className="h-44 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed custom-scrollbar bg-slate-950/40 select-text"
                      >
                        {consoleLogs.length === 0 ? (
                          <div className="text-slate-600 italic flex items-center gap-2 py-1 select-none">
                            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                            Waiting for SteamCMD output...
                          </div>
                        ) : (
                          consoleLogs.map((log, idx) => (
                            <div key={idx} className="flex gap-2 hover:bg-white/5 px-1 -mx-1 rounded transition-colors py-0.5">
                              {showTimestamps && (
                                <span className="text-slate-600 flex-shrink-0 select-none">[{log.timestamp}]</span>
                              )}
                              <span className={cn('break-all', 
                                log.lineType === 'error' ? 'text-red-400 font-semibold' :
                                log.lineType === 'success' ? 'text-emerald-400 font-semibold' :
                                log.lineType === 'warning' ? 'text-amber-400' :
                                log.lineType === 'progress' ? 'text-sky-400' :
                                'text-slate-300'
                              )}>
                                {log.line}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      {/* Scroll to Bottom FAB */}
                      {showScrollToBottom && consoleLogs.length > 5 && (
                        <button onClick={scrollToBottom}
                          className="absolute bottom-2.5 right-2.5 p-1.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-full shadow-lg transition-all hover:scale-105"
                          title="Scroll to bottom"
                          aria-label="Scroll to bottom">
                          <ArrowDownToLine className="w-3.5 h-3.5 text-slate-300" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

                {/* Step 1: Identity */}
                {step === 'name' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2"><Server className="w-4 h-4 text-amber-400" />Server Identity</h3>
                      <p className="text-xs text-slate-500">Name your server and choose where to install it</p>
                    </div>
                    <div className="space-y-4">
                      <label className="block"><span className="text-xs font-medium text-slate-400 mb-1.5 block uppercase tracking-wider">Server Name *</span>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My ASE Server" autoFocus
                          className="w-full px-4 py-3 bg-slate-800/60 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 focus:bg-slate-800 transition-all text-sm" />
                      </label>
                      <label className="block"><span className="text-xs font-medium text-slate-400 mb-1.5 block uppercase tracking-wider">Session Name (Browser Display)</span>
                        <input type="text" value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder={name || 'My ASE Server'}
                          className="w-full px-4 py-3 bg-slate-800/60 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all text-sm" />
                      </label>
                      <div>
                        <span className="text-xs font-medium text-slate-400 mb-1.5 block uppercase tracking-wider">Installation Directory</span>
                        <div className="flex gap-2">
                          <input type="text" value={installPath} onChange={e => setInstallPath(e.target.value)} placeholder={`C:\\ARKServerManager\\ase\\${(name || 'server').replace(/\s+/g, '_')}`}
                            className="flex-1 px-4 py-3 bg-slate-800/60 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all font-mono text-xs" />
                          <button onClick={handleBrowse} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-xl transition-all text-slate-400 hover:text-white">
                            <FolderOpen className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <label className="block"><span className="text-xs font-medium text-slate-400 mb-1.5 block uppercase tracking-wider">Max Players</span>
                        <input type="number" value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))} min={1} max={500}
                          className="w-32 px-4 py-3 bg-slate-800/60 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-500/40 transition-all font-mono text-sm" />
                      </label>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span className="text-xs text-amber-300/80 font-medium">ASE dedicated server requires ~18 GB disk space</span>
                    </div>
                  </div>
                )}

                {/* Step 2: Version / Branch Control */}
                {step === 'version' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2"><GitBranch className="w-4 h-4 text-amber-400" />Server Version</h3>
                      <p className="text-xs text-slate-500">Select which game branch to install via SteamCMD</p>
                    </div>
                    <div className="space-y-2">
                      {ASE_BRANCHES.map(b => (
                        <button key={b.id} onClick={() => setBranch(b.id)}
                          className={cn('w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all',
                            branch === b.id ? 'bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5' : 'bg-slate-800/30 border-white/5 hover:border-white/10 hover:bg-slate-800/50')}>
                          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                            branch === b.id ? 'bg-amber-500/20' : 'bg-slate-700/50')}>
                            <GitBranch className={cn('w-5 h-5', branch === b.id ? 'text-amber-400' : 'text-slate-500')} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn('text-sm font-semibold', branch === b.id ? 'text-white' : 'text-slate-300')}>{b.name}</span>
                              {b.id === 'default' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">RECOMMENDED</span>}
                              {b.betaFlag && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500">-beta {b.betaFlag}</span>}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-normal">{b.description}</p>
                          </div>
                          {branch === b.id && <Check className="w-5 h-5 text-amber-400 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-slate-800/50 border border-white/5 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-400 leading-normal">Clients must use the same branch to connect. Check SteamDB for active branches.</span>
                    </div>
                  </div>
                )}

                {/* Step 3: Map Selection */}
                {step === 'map' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-400" />Select Map</h3>
                        <p className="text-xs text-slate-500">Choose the world for your server</p>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input type="text" value={mapFilter} onChange={e => setMapFilter(e.target.value)} placeholder="Filter..."
                          className="pl-8 pr-3 py-2 bg-slate-800/60 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 w-40 transition-all" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                      {filteredMaps.map(m => (
                        <button key={m.serverArg} onClick={() => setMapName(m.serverArg)}
                          className={cn('group relative rounded-xl border overflow-hidden text-left transition-all',
                            mapName === m.serverArg ? 'border-amber-500/40 ring-1 ring-amber-500/20 shadow-lg shadow-amber-500/10' : 'border-white/5 hover:border-white/15')}>
                          {/* Map image */}
                          <div className="relative h-24 bg-slate-800 overflow-hidden">
                            {m.image ? (
                              <img src={m.image} alt={m.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                                <MapPin className="w-8 h-8 text-slate-600" />
                              </div>
                            )}
                            {mapName === m.serverArg && <div className="absolute inset-0 bg-amber-500/10 border-2 border-amber-500/40 rounded-t-xl" />}
                            <div className="absolute top-1.5 right-1.5">
                              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-md border backdrop-blur-sm', dlcColor(m.dlcType))}>{m.dlcType}</span>
                            </div>
                            {mapName === m.serverArg && (
                              <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-500 rounded-md flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                          {/* Map info */}
                          <div className="p-2.5 bg-slate-900/80">
                            <div className="flex items-center justify-between">
                              <span className={cn('text-xs font-semibold truncate flex-1 mr-1', mapName === m.serverArg ? 'text-amber-400' : 'text-slate-300')}>{m.name}</span>
                              <span className="text-[9px] text-slate-600 font-mono flex-shrink-0">{m.size}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{m.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4: Network */}
                {step === 'ports' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2"><Wifi className="w-4 h-4 text-amber-400" />Network Configuration</h3>
                      <p className="text-xs text-slate-500">Configure the ports for your server — ensure they are forwarded in your router</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[{ label: 'Game Port', sub: 'UDP', val: gamePort, set: setGamePort, def: 7777 },
                        { label: 'Query Port', sub: 'UDP/TCP', val: queryPort, set: setQueryPort, def: 27015 },
                        { label: 'RCON Port', sub: 'TCP', val: rconPort, set: setRconPort, def: 27020 }].map(p => (
                        <div key={p.label} className="p-4 bg-slate-800/40 border border-white/5 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-300">{p.label}</span>
                            <span className="text-[10px] text-slate-600 font-mono">{p.sub}</span>
                          </div>
                          <input type="number" value={p.val} onChange={e => p.set(Number(e.target.value))}
                            className="w-full px-3 py-2.5 bg-slate-900/60 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-amber-500/40 transition-all" />
                          <button onClick={() => p.set(p.def)} className="text-[10px] text-slate-600 hover:text-amber-400 mt-1.5 transition-colors font-medium">Reset to {p.def}</button>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 bg-slate-800/30 border border-white/5 rounded-xl">
                      <p className="text-xs text-slate-500 leading-normal">Raw UDP port will be auto-assigned as Game Port + 1 (<span className="font-mono text-slate-400 font-bold">{gamePort + 1}</span>)</p>
                    </div>
                  </div>
                )}

                {/* Step 5: Security */}
                {step === 'admin' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2"><Shield className="w-4 h-4 text-amber-400" />Security Configuration</h3>
                      <p className="text-xs text-slate-500">Set the admin password for RCON and in-game admin commands</p>
                    </div>
                    <label className="block"><span className="text-xs font-medium text-slate-400 mb-1.5 block uppercase tracking-wider">Admin Password *</span>
                      <input type="text" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Minimum 4 characters"
                        className="w-full px-4 py-3 bg-slate-800/60 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all font-mono text-sm" />
                      {adminPassword.length > 0 && adminPassword.length < 4 && <p className="text-xs text-red-400 mt-1.5 font-medium">Password must be at least 4 characters</p>}
                    </label>
                  </div>
                )}

                {/* Step 6: Confirm & Deploy — Pre-flight Review */}
                {step === 'confirm' && (() => {
                  const resolvedPath = installPath || `C:\\ARKServerManager\\ase\\${name.replace(/\s+/g, '_')}`;
                  const hasDuplicatePorts = gamePort === queryPort || gamePort === rconPort || queryPort === rconPort;
                  const hasPrivilegedPorts = gamePort < 1024 || queryPort < 1024 || rconPort < 1024;
                  const weakPassword = adminPassword.length < 6;
                  const hasWarnings = hasDuplicatePorts || hasPrivilegedPorts || weakPassword;

                  return (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2"><Rocket className="w-4 h-4 text-amber-400" />Pre-flight Review</h3>
                      <p className="text-xs text-slate-500">Verify every detail before the installation begins</p>
                    </div>

                    {/* Global Status Banner */}
                    <div className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border text-xs font-medium',
                      hasWarnings
                        ? 'bg-amber-500/5 border-amber-500/15 text-amber-300/90'
                        : 'bg-emerald-500/5 border-emerald-500/15 text-emerald-300/90'
                    )}>
                      {hasWarnings ? (
                        <><AlertTriangle className="w-4 h-4 flex-shrink-0" />Some settings need attention — review the warnings below</>
                      ) : (
                        <><CheckCircle className="w-4 h-4 flex-shrink-0" />All settings look good — ready to deploy</>
                      )}
                    </div>

                    {/* Map Preview Card */}
                    {mapInfo && (
                      <div className="relative h-24 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                        {mapInfo.image ? (
                          <img src={mapInfo.image} alt={mapInfo.name} className="w-full h-full object-cover opacity-60" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                        <div className="absolute bottom-3 left-4">
                          <p className="text-sm font-bold text-white">{mapInfo.name}</p>
                          <p className="text-[10px] text-slate-300 leading-normal">{mapInfo.description}</p>
                        </div>
                        <div className="absolute top-3 right-3">
                          <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-md border backdrop-blur-sm', dlcColor(mapInfo.dlcType))}>{mapInfo.dlcType}</span>
                        </div>
                      </div>
                    )}

                    {/* ── Section 1: Server Identity ── */}
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/50 border-b border-white/5">
                        <Server className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Identity</span>
                        <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />
                      </div>
                      <div className="divide-y divide-white/5">
                        {[
                          { label: 'Server Name', value: name },
                          { label: 'Session Name', value: sessionName || name, sub: 'Shown in server browser' },
                          { label: 'Max Players', value: String(maxPlayers) },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5">
                            <div>
                              <span className="text-[11px] text-slate-500">{row.label}</span>
                              {row.sub && <span className="text-[9px] text-slate-600 ml-1.5">({row.sub})</span>}
                            </div>
                            <span className="text-xs font-semibold text-white font-mono truncate max-w-[180px]" title={row.value}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Section 2: Version ── */}
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/50 border-b border-white/5">
                        <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Version</span>
                        <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />
                      </div>
                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-[11px] text-slate-500">Branch</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white">{branchInfo?.name || 'Default'}</span>
                          {branchInfo?.betaFlag && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-500">-beta {branchInfo.betaFlag}</span>}
                          {branch === 'default' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">STABLE</span>}
                        </div>
                      </div>
                    </div>

                    {/* ── Section 3: Network ── */}
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/50 border-b border-white/5">
                        <Wifi className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Network</span>
                        {(hasDuplicatePorts || hasPrivilegedPorts) ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 ml-auto" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />
                        )}
                      </div>
                      <div className="divide-y divide-white/5">
                        {[
                          { label: 'Game Port', value: gamePort, protocol: 'UDP' },
                          { label: 'Raw UDP Port', value: gamePort + 1, protocol: 'UDP', sub: 'auto-assigned' },
                          { label: 'Query Port', value: queryPort, protocol: 'UDP/TCP' },
                          { label: 'RCON Port', value: rconPort, protocol: 'TCP' },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500">{row.label}</span>
                              {row.sub && <span className="text-[9px] text-slate-600">({row.sub})</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-slate-600">{row.protocol}</span>
                              <span className="text-xs font-bold text-white font-mono">{row.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Port warnings */}
                      {hasDuplicatePorts && (
                        <div className="flex items-start gap-2 px-3.5 py-2 bg-red-500/5 border-t border-red-500/10">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                          <span className="text-[10px] text-red-300/80">Port collision detected — game, query, and RCON ports must all be different</span>
                        </div>
                      )}
                      {hasPrivilegedPorts && (
                        <div className="flex items-start gap-2 px-3.5 py-2 bg-amber-500/5 border-t border-amber-500/10">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <span className="text-[10px] text-amber-300/80">Ports below 1024 are privileged and may require administrator access</span>
                        </div>
                      )}
                    </div>

                    {/* ── Section 4: Security ── */}
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/50 border-b border-white/5">
                        <Shield className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Security</span>
                        {weakPassword ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 ml-auto" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />
                        )}
                      </div>
                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-[11px] text-slate-500">Admin Password</span>
                        <span className="text-xs font-mono text-white tracking-widest">{'•'.repeat(Math.min(adminPassword.length, 12))}</span>
                      </div>
                      {weakPassword && (
                        <div className="flex items-start gap-2 px-3.5 py-2 bg-amber-500/5 border-t border-amber-500/10">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <span className="text-[10px] text-amber-300/80">Password is short — consider using 6+ characters for better security</span>
                        </div>
                      )}
                    </div>

                    {/* ── Section 5: Install Path ── */}
                    <div className="rounded-xl border border-white/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/50 border-b border-white/5">
                        <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Storage</span>
                        <Check className="w-3.5 h-3.5 text-emerald-400 ml-auto" />
                      </div>
                      <div className="px-3.5 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-slate-500">Install Path</span>
                        </div>
                        <span className="text-[10px] font-mono text-white/80 break-all leading-relaxed" title={resolvedPath}>{resolvedPath}</span>
                      </div>
                    </div>

                    {/* Download Warning */}
                    <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                      <HardDrive className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span className="text-xs text-amber-300/80 font-medium">SteamCMD will download ~18 GB (AppID 376030){branchInfo?.betaFlag ? ` on branch "${branchInfo.betaFlag}"` : ''}</span>
                    </div>
                  </div>
                  );
                })()}

              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-slate-950/50">
          {isInstalling ? (
            progress ? (
              <div className="w-full flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  {progress.isComplete ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5 select-none animate-pulse">
                      <Check className="w-4 h-4" /> Ready to play
                    </span>
                  ) : progress.isError ? (
                    <span className="text-red-400 font-bold flex items-center gap-1.5 select-none">
                      <AlertTriangle className="w-4 h-4" /> Installation failed
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 select-none text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      Downloading files via SteamCMD...
                    </span>
                  )}
                </span>

                <button
                  onClick={onClose}
                  disabled={!progress.isComplete && !progress.isError}
                  className={cn(
                    "px-6 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg",
                    progress.isComplete 
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 hover:scale-105 active:scale-95"
                      : progress.isError
                      ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 hover:scale-105 active:scale-95"
                      : "bg-slate-900 text-slate-600 border border-white/5 cursor-not-allowed"
                  )}
                >
                  {progress.isComplete ? 'Finish' : 'Close'}
                </button>
              </div>
            ) : null
          ) : (
            <>
              <button onClick={stepIdx > 0 ? prev : onClose}
                className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5">
                <ChevronLeft className="w-4 h-4" />{stepIdx > 0 ? 'Back' : 'Cancel'}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-mono">{stepIdx + 1} / {STEPS.length}</span>
                {step === 'confirm' ? (
                  <button onClick={handleInstall}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95">
                    Deploy Server<Rocket className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={next} disabled={!canNext()}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95">
                    Continue<ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
