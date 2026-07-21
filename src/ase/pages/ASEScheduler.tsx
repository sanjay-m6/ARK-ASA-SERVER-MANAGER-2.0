import { useState, useEffect, useRef } from 'react';
import { 
  Clock, Plus, Trash2, ToggleLeft, ToggleRight, Save, Shield, Database, 
  AlertTriangle, Check, Settings2, Info, Calendar, Sliders, Hourglass, HelpCircle, Terminal, Layers,
  ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { 
  getAseScheduledTasks, 
  createAseScheduledTask, 
  toggleAseScheduledTask, 
  deleteAseScheduledTask,
  getAseSchedulerSettings,
  saveAseSchedulerSettings
} from '../utils/aseCommands';
import type { AseScheduledTask, AseSchedulerSettings } from '../types/ase.types';

import { cn } from '../../utils/helpers';

export default function ASEScheduler() {
  const { servers, refreshServers, activeServer } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(() => activeServer?.id || null);
  const [settings, setSettings] = useState<AseSchedulerSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [countdown, setCountdown] = useState<string>('--:--:--');

  // Custom micro-tasks list (cron)
  const [tasks, setTasks] = useState<AseScheduledTask[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState<AseScheduledTask['taskType']>('restart');
  const [newCron, setNewCron] = useState('0 */6 * * *');

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    refreshServers();
  }, []);

  useEffect(() => {
    if (activeServer) {
      setSelectedServer(activeServer.id);
    } else if (servers.length > 0 && selectedServer === null) {
      setSelectedServer(servers[0].id);
    }
  }, [activeServer, servers, selectedServer]);

  useEffect(() => {
    if (selectedServer) {
      loadSettings(selectedServer);
      loadTasks(selectedServer);
    }
  }, [selectedServer]);

  // Real-time ticking countdown logic for both Basic and Advanced scheduler targets
  useEffect(() => {
    const timer = setInterval(() => {
      if (!settings || settings.mode === 'disabled') {
        setCountdown('--:--:--');
        return;
      }

      if (settings.mode === 'basic' && settings.nextRunBasic) {
        const target = new Date(settings.nextRunBasic);
        const now = new Date();
        const diff = target.getTime() - now.getTime();

        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);
          setCountdown(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
        } else {
          setCountdown('Executing...');
        }
      } else if (settings.mode === 'advanced' && settings.advancedTime) {
        const [h, m] = settings.advancedTime.split(':').map(Number);
        const days = settings.advancedDays ? settings.advancedDays.split(',').filter(Boolean).map(Number) : [];

        if (days.length > 0) {
          const now = new Date();
          let minDiff = Infinity;

          for (const day of days) {
            const checkDate = new Date(now);
            checkDate.setHours(h, m, 0, 0);

            const currentDayOfWeek = now.getDay();
            let daysToAdd = (day - currentDayOfWeek + 7) % 7;

            // If it is today and time has passed, jump to next week
            if (daysToAdd === 0 && checkDate.getTime() <= now.getTime()) {
              daysToAdd = 7;
            }

            checkDate.setDate(now.getDate() + daysToAdd);
            const diff = checkDate.getTime() - now.getTime();

            if (diff > 0 && diff < minDiff) {
              minDiff = diff;
            }
          }

          if (minDiff !== Infinity) {
            const hours = Math.floor(minDiff / (1000 * 60 * 60));
            const mins = Math.floor((minDiff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((minDiff % (1000 * 60)) / 1000);
            setCountdown(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
          } else {
            setCountdown('--:--:--');
          }
        } else {
          setCountdown('--:--:--');
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [settings]);

  const loadSettings = async (id: number) => {
    try {
      const s = await getAseSchedulerSettings(id);
      setSettings(s);
      setIsDirty(false);
    } catch (e) {
      toast.error(`Failed to load settings: ${e}`);
    }
  };

  const loadTasks = async (id: number) => {
    try {
      const t = await getAseScheduledTasks(id);
      setTasks(t);
    } catch {
      setTasks([]);
    }
  };

  const handleUpdateSettings = (updates: Partial<AseSchedulerSettings>) => {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, ...updates } : null);
    setIsDirty(true);
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      await saveAseSchedulerSettings(settings);
      setIsDirty(false);
      toast.success('Automation settings saved');
      loadSettings(settings.serverId);
    } catch (e) {
      toast.error(`Failed to save settings: ${e}`);
    }
  };

  const handleDayToggle = (dayNum: number) => {
    if (!settings) return;
    const days = settings.advancedDays ? settings.advancedDays.split(',').filter(Boolean).map(Number) : [];
    let newDays: number[];

    if (days.includes(dayNum)) {
      newDays = days.filter(d => d !== dayNum);
    } else {
      newDays = [...days, dayNum];
    }

    newDays.sort((a, b) => a - b);
    handleUpdateSettings({ advancedDays: newDays.join(',') });
  };

  const isDayEnabled = (dayNum: number) => {
    if (!settings?.advancedDays) return false;
    return settings.advancedDays.split(',').filter(Boolean).map(Number).includes(dayNum);
  };

  const getFormattedDays = (daysStr?: string) => {
    if (!daysStr) return 'No days selected';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return daysStr.split(',')
      .filter(Boolean)
      .map(Number)
      .map(d => dayNames[d])
      .join(', ');
  };

  // Custom micro-tasks commands
  const handleCreateTask = async () => {
    if (!selectedServer) return;
    try {
      const t = await createAseScheduledTask({ serverId: selectedServer, taskType: newType, cronExpr: newCron, enabled: true });
      setTasks(prev => [...prev, t]);
      setShowCreate(false);
      toast.success('Custom cron task created');
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleToggleTask = async (id: number, enabled: boolean) => {
    try {
      await toggleAseScheduledTask(id, !enabled);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, enabled: !enabled } : t));
      toast.success(enabled ? 'Task disabled' : 'Task enabled');
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      await deleteAseScheduledTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      toast.success('Task deleted');
    } catch (e) {
      toast.error(`${e}`);
    }
  };

  const daysOfWeek = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
  ];

  const chainSteps = [
    { key: 'advancedShutdown', label: '1. Graceful Shutdown', desc: 'Performs standard SaveWorld, warns players, and stops process gracefully.' },
    { key: 'advancedBackup', label: '2. Server Backup', desc: 'Creates an automated backup of server files before updating.' },
    { key: 'advancedUpdate', label: '3. SteamCMD Update', desc: 'Safely launches SteamCMD block, fetches game files, and checks mods.' },
    { key: 'advancedRestart', label: '4. Server Auto-Restart', desc: 'Boots the server process back up under the crash guard watchdog.' },
    { key: 'advancedDinoWipe', label: '5. Post-Boot Dino Wipe', desc: 'Cleans up wild dinosaur populations 3 minutes after bootup for performance.' },
  ];

  const typeLabels: Record<string, string> = { restart: '🔄 Restart', update: '📥 Update', backup: '💾 Backup', wipe_dinos: '🦕 Wipe Dinos' };

  const getRestartFrequencyText = (hours: number) => {
    if (hours === 1) return 'Restarting 24 times a day (Hourly restart cycle)';
    if (hours === 2) return 'Restarting 12 times a day (Bi-hourly restart cycle)';
    if (hours === 3) return 'Restarting 8 times a day (Every 3 hours)';
    if (hours === 4) return 'Restarting 6 times a day (Every 4 hours)';
    if (hours === 6) return 'Restarting 4 times a day (Every 6 hours)';
    if (hours === 8) return 'Restarting 3 times a day (Every 8 hours)';
    if (hours === 12) return 'Restarting 2 times a day (Every 12 hours)';
    if (hours === 24) return 'Restarting once a day (24-hour cycle)';
    const frequency = (24 / hours).toFixed(1);
    return `Restarting approximately ${frequency} times a day (Every ${hours} hours)`;
  };

  const parseWarningMinutes = (minutesStr?: string) => {
    if (!minutesStr) return [];
    return minutesStr.split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n))
      .sort((a, b) => b - a);
  };

  const cronPresets = [
    { label: 'Every 6 Hours', cron: '0 */6 * * *', desc: '4x daily' },
    { label: 'Every 12 Hours', cron: '0 */12 * * *', desc: '2x daily' },
    { label: 'Daily 3 AM', cron: '0 3 * * *', desc: 'Offpeak maintenance' },
    { label: 'Weekly backup', cron: '0 0 * * 0', desc: 'Sunday midnight' },
    { label: 'Every Hour', cron: '0 * * * *', desc: 'Hourly test' },
  ];

  return (
    <motion.div className="space-y-8 pb-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Dynamic Keyframe Injection for premium visual effects */}
      <style>{`
        @keyframes radar-sweep {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes line-flow {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.08); opacity: 0.45; }
        }
        .animate-radar-ring {
          animation: radar-sweep 2.5s infinite cubic-bezier(0.1, 0.8, 0.3, 1);
        }
        .animate-flow-dash {
          stroke-dasharray: 8, 4;
          animation: line-flow 1.5s infinite linear;
        }
        .animate-pulse-subtle {
          animation: pulse-ring 3s infinite ease-in-out;
        }
      `}</style>

      {/* HEADER SECTION WITH ANIMATED BACKDROP */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-slate-950/80 to-slate-900/60 p-6 rounded-3xl border border-white/5 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_20%_-20%,rgba(245,158,11,0.06),transparent)] pointer-events-none" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-amber-500/20 to-orange-500/5 rounded-2xl border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.15)] flex-shrink-0 animate-pulse-subtle">
            <Clock className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-amber-400 flex items-center gap-3">
              Server Lifecycle Automation
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl font-medium leading-relaxed">
              Experience zero-overhead server management. Configure auto-starters, automated SteamCMD pipelines, backup retention structures, and crash recovery watchdogs.
            </p>
          </div>
        </div>

        {activeServer && (
          <div className="relative z-10 flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-2xl">
            <Clock className="w-4 h-4 text-amber-400" />
            <div>
              <div className="text-xs font-bold text-white">{activeServer.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">ASE ID #{activeServer.id} • Port {activeServer.port}</div>
            </div>
          </div>
        )}
      </div>

      {/* QUICK PRESET AUTOMATION RECIPES */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-amber-400" /> Quick Automation Recipes
          </h2>
          <span className="text-[10px] text-slate-500 font-mono">Click to load pre-configured automation templates</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={async () => {
              if (!settings) return;
              const newS = { ...settings, mode: 'basic' as const, basicIntervalHours: 6, basicWarningMinutes: '15,10,5,1' };
              setSettings(newS);
              await saveAseSchedulerSettings(newS);
              toast.success('Applied 6-Hour Loop Preset');
            }}
            className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-1">
              <Clock className="w-4 h-4 text-amber-400 group-hover:rotate-180 transition-transform duration-500" />
              6-Hour Auto Loop
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">Restarts server every 6h with 15m, 10m, 5m, 1m warnings & RCON SaveWorld.</p>
          </button>

          <button
            onClick={async () => {
              if (!settings) return;
              const newS = {
                ...settings,
                mode: 'advanced' as const,
                advancedTime: '03:00',
                advancedDays: '0,1,2,3,4,5,6',
                advancedWarningMinutes: '15,10,5,1',
                advancedShutdown: true,
                advancedBackup: true,
                advancedUpdate: true,
                advancedRestart: true,
                advancedDinoWipe: true
              };
              setSettings(newS);
              await saveAseSchedulerSettings(newS);
              toast.success('Applied Daily 3:00 AM Maintenance Preset');
            }}
            className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-xl transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-purple-400 mb-1">
              <Shield className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
              Daily 3 AM Pipeline
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">SaveWorld → Graceful Stop → Pre-Backup → SteamCMD Update → Dino Wipe.</p>
          </button>

          <button
            onClick={async () => {
              if (!selectedServer) return;
              try {
                const t = await createAseScheduledTask({ serverId: selectedServer, taskType: 'wipe_dinos', cronExpr: '0 * * * *', enabled: true });
                setTasks(prev => [...prev, t]);
                toast.success('Created Hourly Dino Wipe Task');
              } catch (e) {
                toast.error('Failed to create task');
              }
            }}
            className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-xl transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-red-400 mb-1">
              <Sliders className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
              Hourly Wild Dino Wipe
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">Runs DestroyWildDinos RCON command every hour on minute 0.</p>
          </button>

          <button
            onClick={async () => {
              if (!selectedServer) return;
              try {
                const t = await createAseScheduledTask({ serverId: selectedServer, taskType: 'backup', cronExpr: '0 */3 * * *', enabled: true });
                setTasks(prev => [...prev, t]);
                toast.success('Created 3-Hour Backup Task');
              } catch (e) {
                toast.error('Failed to create task');
              }
            }}
            className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-blue-400 mb-1">
              <Database className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
              3-Hour Save Snapshot
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">Issues RCON SaveWorld every 3 hours to prevent data loss.</p>
          </button>
        </div>
      </div>

      {settings && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* MAIN SETTINGS INTERACTIVE COGNITIVE FLOW PANELS */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* SCHEDULER MODE SELECTOR */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-5 bg-slate-900/40 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/2 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-md font-bold text-white tracking-wide">
                  Automation Orchestrator Mode
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(['disabled', 'basic', 'advanced'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => handleUpdateSettings({ mode })}
                    className={cn(
                      "p-5 rounded-2xl border text-left transition-all duration-300 focus:outline-none flex flex-col gap-3 relative overflow-hidden group/btn hover:scale-[1.02]",
                      settings.mode === mode
                        ? "bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/40 shadow-[0_4px_30px_rgba(245,158,11,0.15)] text-white"
                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/10"
                    )}
                  >
                    {settings.mode === mode && (
                      <>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
                        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]" />
                      </>
                    )}
                    <span className="font-extrabold text-xs uppercase tracking-widest text-amber-400">
                      {mode === 'disabled' && '🚫 Inactive'}
                      {mode === 'basic' && '🔄 Basic Loop'}
                      {mode === 'advanced' && '⚙️ Advanced Chain'}
                    </span>
                    <span className="text-[11px] text-slate-400 leading-relaxed font-medium">
                      {mode === 'disabled' && 'All scheduled reboots and pipeline sequences are fully suspended.'}
                      {mode === 'basic' && 'Graceful server reboots at simple recurring hourly timelines.'}
                      {mode === 'advanced' && 'Execute multi-step daily or weekly pipeline sequences seamlessly.'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* LIVE ticking TIMER BADGE CARD */}
            <AnimatePresence mode="wait">
              {settings.mode !== 'disabled' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3 }}
                  className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 to-slate-950/80 border border-amber-500/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_4px_30px_rgba(245,158,11,0.06)]"
                >
                  <div className="absolute -top-20 -left-20 w-44 h-44 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="flex items-center gap-4 relative z-10">
                    <div className="p-3 bg-gradient-to-br from-amber-500/25 to-transparent rounded-2xl text-amber-400 shrink-0 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                      <Hourglass className="w-6 h-6 animate-spin" style={{ animationDuration: '6s' }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white flex items-center gap-2">
                        Next Lifecycle Event
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      </p>
                      <p className="text-xs text-slate-400 mt-1 font-medium max-w-sm">
                        {settings.mode === 'basic' 
                          ? `Graceful Restart Loop scheduled at a repeating ${settings.basicIntervalHours}h interval.`
                          : `Maintenance Sequence executes on ${getFormattedDays(settings.advancedDays)} at ${settings.advancedTime || '--:--'}.`
                        }
                      </p>
                    </div>
                  </div>

                  <div className="text-center md:text-right shrink-0 relative z-10">
                    <p className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest">T-MINUS COUNTDOWN</p>
                    <p className="text-4xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 tracking-widest mt-1 drop-shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                      {countdown}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* BASIC SCHEDULER: ADVANCED Rework */}
            {settings.mode === 'basic' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6 bg-slate-900/40 relative"
              >
                <div className="border-b border-white/5 pb-4">
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    Basic Restart Settings
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Configure simple, automated recurring restart timelines.</p>
                </div>

                {/* Slider widget */}
                <div className="space-y-4 bg-slate-950/30 p-5 rounded-2xl border border-white/5 relative overflow-hidden">
                  <div className="flex justify-between items-center text-sm font-semibold">
                    <span className="text-slate-300">Restart Frequency Interval</span>
                    <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold font-mono text-sm rounded-lg shadow-[0_0_10px_rgba(245,158,11,0.05)]">
                      {settings.basicIntervalHours} Hours
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="24"
                    value={settings.basicIntervalHours}
                    onChange={e => handleUpdateSettings({ basicIntervalHours: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-extrabold font-mono">
                    <span>1H</span>
                    <span>4H</span>
                    <span>8H</span>
                    <span>12H</span>
                    <span>16H</span>
                    <span>20H</span>
                    <span>24H</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-400 pt-2 border-t border-white/5 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-400" />
                    {getRestartFrequencyText(settings.basicIntervalHours)}
                  </div>
                </div>

                {/* Pre warning design */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-300">RCON Broadcast Warnings Alerts</label>
                  <input
                    type="text"
                    value={settings.basicWarningMinutes}
                    onChange={e => handleUpdateSettings({ basicWarningMinutes: e.target.value })}
                    placeholder="30,15,10,5,1"
                    className="w-full bg-slate-950/60 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/10 font-mono transition-all text-sm"
                  />
                  
                  {/* Warning bells visual tag indicators */}
                  <div className="flex flex-wrap gap-2 pt-1.5">
                    {parseWarningMinutes(settings.basicWarningMinutes).map((mins) => (
                      <span key={mins} className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/5 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-extrabold shadow-sm animate-pulse-subtle">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        🔔 Alert at {mins}m
                      </span>
                    ))}
                    {parseWarningMinutes(settings.basicWarningMinutes).length === 0 && (
                      <span className="text-xs text-rose-400 font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        No warnings configured. Reboots will execute immediately without player notice!
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ADVANCED PIPELINE SCHEDULER: Complete Premium Rework */}
            {settings.mode === 'advanced' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6 bg-slate-900/40"
              >
                <div className="border-b border-white/5 pb-4">
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    Advanced Scheduler Configuration
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Staged multi-step execution schedules mapped over a weekly day grid.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Time picker */}
                  <div className="space-y-2 bg-slate-950/20 p-4 border border-white/5 rounded-2xl">
                    <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      Execution Time
                    </label>
                    <input
                      type="time"
                      value={settings.advancedTime || '03:00'}
                      onChange={e => handleUpdateSettings({ advancedTime: e.target.value })}
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500/40 font-mono text-sm"
                    />
                  </div>

                  {/* Warning Alerts */}
                  <div className="space-y-2 bg-slate-950/20 p-4 border border-white/5 rounded-2xl">
                    <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-amber-400" />
                      Alert Warning Interval
                    </label>
                    <input
                      type="text"
                      value={settings.advancedWarningMinutes || '30,15,10,5,1'}
                      onChange={e => handleUpdateSettings({ advancedWarningMinutes: e.target.value })}
                      placeholder="30,15,10,5,1"
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500/40 font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Day selector grid */}
                <div className="space-y-3 bg-slate-950/20 p-4 border border-white/5 rounded-2xl">
                  <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    Scheduled Weekly Execution Days
                  </label>
                  <div className="grid grid-cols-7 gap-2">
                    {daysOfWeek.map(d => {
                      const active = isDayEnabled(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => handleDayToggle(d.value)}
                          className={cn(
                            "py-3 rounded-xl border flex flex-col items-center justify-center text-xs transition-all duration-300 font-extrabold select-none focus:outline-none hover:scale-105",
                            active 
                              ? "bg-gradient-to-br from-amber-500/20 via-amber-500/5 to-transparent border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                              : "bg-slate-900/30 border-white/5 text-slate-400 hover:border-white/10 hover:text-white"
                          )}
                        >
                          <span className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">{d.label.slice(0,1)}</span>
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pipeline visualizer */}
                <div className="space-y-5 bg-slate-950/20 p-6 border border-white/5 rounded-2xl">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                    <Layers className="w-4 h-4 text-amber-500 animate-pulse" />
                    <label className="text-sm font-bold text-white">Advanced Execution Staged Pipeline</label>
                  </div>

                  {/* Horizontal Flow layout for large screens, stacked for mobile */}
                  <div className="flex flex-col md:flex-row items-stretch justify-between gap-3 relative">
                    {chainSteps.map((step, idx) => {
                      const isStepEnabled = settings[step.key as keyof AseSchedulerSettings] as boolean;
                      const nextStepKey = chainSteps[idx + 1]?.key;
                      const nextStepEnabled = nextStepKey ? (settings[nextStepKey as keyof AseSchedulerSettings] as boolean) : false;

                      return (
                        <div key={step.key} className="flex-1 flex flex-col items-stretch group/card relative">
                          <button
                            type="button"
                            onClick={() => handleUpdateSettings({ [step.key]: !isStepEnabled })}
                            className={cn(
                              "flex flex-col items-start p-4 rounded-xl border text-left cursor-pointer transition-all duration-300 select-none relative overflow-hidden h-full focus:outline-none hover:scale-[1.02]",
                              isStepEnabled
                                ? "bg-gradient-to-b from-slate-900 via-slate-900/90 to-transparent border-amber-500/30 shadow-md"
                                : "bg-slate-950/10 border-white/5 opacity-50"
                            )}
                          >
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className={cn("text-xs font-extrabold uppercase tracking-widest", isStepEnabled ? "text-amber-400" : "text-slate-500")}>
                                {step.label.split(':')[0]}
                              </span>
                              <div className={cn(
                                "w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0",
                                isStepEnabled ? "bg-amber-500/20 border-amber-500 text-amber-400" : "border-slate-700 bg-slate-950"
                              )}>
                                {isStepEnabled && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                            <span className={cn("text-xs font-bold leading-tight my-1 block", isStepEnabled ? "text-white" : "text-slate-400")}>
                              {step.label.split(':')[1]?.trim() || step.label}
                            </span>
                            <span className="text-[10px] text-slate-500 mt-1 leading-relaxed block font-medium">
                              {step.desc}
                            </span>
                          </button>

                          {/* Connected Flow Line Connector */}
                          {idx < chainSteps.length - 1 && (
                            <div className="hidden md:flex absolute -right-6 top-8 z-20 items-center justify-center shrink-0 w-8 h-8 pointer-events-none">
                              <svg className="w-8 h-8" viewBox="0 0 32 32">
                                <path
                                  d="M 2,16 L 30,16"
                                  fill="none"
                                  stroke={isStepEnabled && nextStepEnabled ? "#f59e0b" : "#334155"}
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  className={isStepEnabled && nextStepEnabled ? "animate-flow-dash text-amber-500" : ""}
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

          </div>

          {/* RIGHT COLUMN SIDEBAR: Watchdog & Backup Cards */}
          <div className="space-y-8">
            
            {/* WATCHDOG RADAR COMPACT CARD */}
            <div 
              className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6 bg-slate-900/40 relative overflow-hidden group shadow-xl"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_80%,rgba(245,158,11,0.04),transparent)] pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-400 shrink-0" />
                  <h3 className="text-md font-bold text-white">Guardian Watchdog</h3>
                </div>
                <button
                  onClick={() => handleUpdateSettings({ watchdogEnabled: !settings.watchdogEnabled })}
                  className={cn(
                    "relative w-14 h-7 rounded-full transition-all duration-300 flex-shrink-0 focus:outline-none hover:scale-105",
                    settings.watchdogEnabled
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                      : "bg-slate-800 border border-white/10"
                  )}
                >
                  <span
                    className={cn(
                      "block w-5 h-5 rounded-full bg-white shadow transform transition-all duration-300",
                      settings.watchdogEnabled ? "translate-x-7" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Heartbeat sweep animation area */}
              <div className="relative w-full h-44 bg-slate-950/50 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 overflow-hidden">
                
                {/* Simulated Radar Circular Rings */}
                {settings.watchdogEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="absolute w-24 h-24 border border-amber-500/10 rounded-full animate-radar-ring" style={{ animationDelay: '0s' }} />
                    <div className="absolute w-24 h-24 border border-amber-500/10 rounded-full animate-radar-ring" style={{ animationDelay: '1.2s' }} />
                    <div className="absolute w-36 h-36 border border-amber-500/5 rounded-full" />
                    <div className="absolute w-16 h-16 border border-amber-500/20 rounded-full" />
                  </div>
                )}

                <div className="p-4 bg-slate-900/80 border border-white/10 rounded-full relative z-10 shadow-lg flex items-center justify-center">
                  <Shield className={cn(
                    "w-8 h-8 transition-transform duration-500",
                    settings.watchdogEnabled ? "text-amber-400 scale-105 animate-pulse-subtle" : "text-slate-600"
                  )} />
                </div>

                <div className="text-center relative z-10">
                  <p className="text-xs font-bold text-white">Watchdog Monitoring Service</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 tracking-wider uppercase font-extrabold flex items-center gap-1.5 justify-center">
                    <span className={cn("w-1.5 h-1.5 rounded-full inline-block shrink-0", settings.watchdogEnabled ? "bg-emerald-400 animate-ping" : "bg-slate-700")} />
                    {settings.watchdogEnabled ? 'ACTIVE • Heartbeat Ticking' : 'INACTIVE • Standby'}
                  </p>
                </div>
              </div>

              {/* Diagnostic data specs */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500 bg-slate-950/30 p-4 border border-white/5 rounded-xl">
                <div>CHECK SPEED: <span className="text-white font-bold">15 SECONDS</span></div>
                <div>SAFE-GUARDS: <span className="text-emerald-400 font-bold">ENABLED</span></div>
                <div>AUTORESTART: <span className={settings.watchdogEnabled ? "text-amber-400 font-bold" : "text-slate-600 font-bold"}>{settings.watchdogEnabled ? 'ON' : 'OFF'}</span></div>
                <div>LAST BEAT: <span className="text-white font-bold">JUST NOW</span></div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                The **Watchdog Heartbeat** scans server connectivity and PID groups. If the server process crashes or terminates unexpectedly, it initiates a secure start sequence automatically.
              </p>
            </div>

            {/* CYCLIC BACKUPS PANEL */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 space-y-6 bg-slate-900/40 relative group">
              <h3 className="text-md font-bold text-white flex items-center gap-2 border-b border-white/5 pb-4">
                <Database className="w-5 h-5 text-amber-400" />
                Cyclic Backups System
              </h3>

              <div className="space-y-4">
                {/* Restart Backup toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/20 border border-white/5 hover:border-amber-500/10 transition-colors cursor-pointer" onClick={() => handleUpdateSettings({ backupOnRestart: !settings.backupOnRestart })}>
                  <div>
                    <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Backup on Restart</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Zip database files prior to reboot.</p>
                  </div>
                  <button
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 focus:outline-none",
                      settings.backupOnRestart ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]" : "bg-slate-800 border border-white/10"
                    )}
                  >
                    <span className={cn("block w-4 h-4 rounded-full bg-white shadow transform transition-all duration-300", settings.backupOnRestart ? "translate-x-6" : "translate-x-1")} />
                  </button>
                </div>

                {/* Update Backup toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/20 border border-white/5 hover:border-amber-500/10 transition-colors cursor-pointer" onClick={() => handleUpdateSettings({ backupOnUpdate: !settings.backupOnUpdate })}>
                  <div>
                    <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Backup on Update</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Ensure rollbacks prior to SteamCMD updates.</p>
                  </div>
                  <button
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 focus:outline-none",
                      settings.backupOnUpdate ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]" : "bg-slate-800 border border-white/10"
                    )}
                  >
                    <span className={cn("block w-4 h-4 rounded-full bg-white shadow transform transition-all duration-300", settings.backupOnUpdate ? "translate-x-6" : "translate-x-1")} />
                  </button>
                </div>

                {/* Cluster backup */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/20 border border-white/5 hover:border-amber-500/10 transition-colors cursor-pointer" onClick={() => handleUpdateSettings({ includeClusterBackup: !settings.includeClusterBackup })}>
                  <div>
                    <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Include Cluster Dir</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Zip shared player transfer archives.</p>
                  </div>
                  <button
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 focus:outline-none",
                      settings.includeClusterBackup ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]" : "bg-slate-800 border border-white/10"
                    )}
                  >
                    <span className={cn("block w-4 h-4 rounded-full bg-white shadow transform transition-all duration-300", settings.includeClusterBackup ? "translate-x-6" : "translate-x-1")} />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* FLOATING ACTION BAR FOR DIRTY STATES */}
      <AnimatePresence>
        {isDirty && (
          <motion.div 
            initial={{ y: 80, opacity: 0, scale: 0.95 }} 
            animate={{ y: 0, opacity: 1, scale: 1 }} 
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 120 }}
            className="fixed bottom-6 left-6 right-6 md:left-[20rem] z-50 bg-slate-900/95 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-amber-500/30 shadow-[0_12px_40px_rgba(245,158,11,0.3)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 max-w-4xl mx-auto"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" style={{ animationDuration: '2s' }} />
              </div>
              <div>
                <p className="text-sm font-black text-white">Unsaved Orchestrator Config</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Synchronize these parameters to activate server boot and watchdog rules.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end">
              <button 
                onClick={() => selectedServer && loadSettings(selectedServer)}
                className="px-4 py-2 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors focus:outline-none"
              >
                Revert
              </button>
              <button 
                onClick={handleSaveSettings} 
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_4px_20px_rgba(245,158,11,0.3)] focus:outline-none"
              >
                <Save className="w-4 h-4" />
                Commit Rules
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADVANCED CUSTOM CRON TASKS (MICRO-TASKS PANEL REWORKED WITH PRESETS) */}
      <div className="space-y-6 border-t border-white/5 pt-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-amber-400" />
              Advanced Custom Cron Tasks
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">Coordinate custom micro-actions using standard cron scheduling expressions.</p>
          </div>
          <button 
            onClick={() => setShowCreate(prev => !prev)} 
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all focus:outline-none hover:scale-105"
          >
            {showCreate ? 'Close Form' : 'Add Custom Task'}
          </button>
        </div>

        <AnimatePresence>
          {showCreate && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className={cn("glass-panel rounded-3xl p-6 space-y-5 border border-amber-500/20 bg-slate-900/30", !isTypeDropdownOpen && "overflow-hidden")}
            >
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-amber-400" />
                Create Custom Scheduled Micro-Task
              </h3>
              
              {/* Preset Quick pills */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Express Cron Presets</span>
                <div className="flex flex-wrap gap-2">
                  {cronPresets.map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setNewCron(preset.cron);
                        toast.success(`Preset "${preset.label}" loaded`);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-xl border text-[11px] font-bold text-left transition-all focus:outline-none hover:scale-105",
                        newCron === preset.cron
                          ? "bg-amber-500/10 border-amber-500 text-amber-400"
                          : "bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10"
                      )}
                    >
                      {preset.label}
                      <span className="block text-[9px] text-slate-500 font-normal mt-0.5">{preset.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="block relative" ref={typeDropdownRef}>
                  <span className="text-xs text-slate-400 mb-1.5 block">Task Action</span>
                  <button
                    type="button"
                    onClick={() => setIsTypeDropdownOpen(prev => !prev)}
                    className="w-full px-4 py-3 bg-slate-950/60 border border-white/10 rounded-2xl text-white text-sm focus:outline-none focus:border-amber-500/30 font-semibold flex items-center justify-between transition-all duration-300 hover:border-white/20 select-none cursor-pointer"
                  >
                    <span>{typeLabels[newType] || newType}</span>
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-300", isTypeDropdownOpen && "rotate-180")} />
                  </button>
                  <AnimatePresence>
                    {isTypeDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl p-1.5 space-y-1"
                      >
                        {Object.entries(typeLabels).map(([k, v]) => {
                          const isSelected = newType === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => {
                                setNewType(k as any);
                                setIsTypeDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-between cursor-pointer select-none",
                                isSelected
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/20"
                                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                              )}
                            >
                              <span>{v}</span>
                              {isSelected && <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <label className="block">
                  <span className="text-xs text-slate-400 mb-1.5 block font-semibold flex justify-between">
                    Cron Expression
                    <a href="https://crontab.cronhub.io" target="_blank" rel="noreferrer" className="text-amber-500 font-bold hover:underline flex items-center gap-0.5">Help <HelpCircle className="w-3 h-3" /></a>
                  </span>
                  <input 
                    type="text" 
                    value={newCron} 
                    onChange={e => setNewCron(e.target.value)} 
                    placeholder="0 */6 * * *" 
                    className="w-full px-4 py-3 bg-slate-950/60 border border-white/10 rounded-2xl text-white font-mono text-sm focus:outline-none focus:border-amber-500/30" 
                  />
                </label>
              </div>
              
              <div className="flex gap-2.5 pt-2">
                <button onClick={handleCreateTask} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all focus:outline-none hover:scale-105">
                  Create Task
                </button>
                <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 text-slate-400 hover:text-white border border-white/10 rounded-2xl text-xs font-bold transition-colors focus:outline-none">
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {tasks.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/5 rounded-3xl bg-slate-900/10">
            <Clock className="w-12 h-12 text-slate-700 mx-auto mb-3 animate-pulse-subtle" />
            <h3 className="text-sm font-semibold text-slate-400">No Custom Scheduled Tasks</h3>
            <p className="text-slate-500 text-xs mt-1">Deploy custom cron rules above to coordinate custom wipes, backups or restarts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasks.map(t => (
              <div key={t.id} className="glass-panel rounded-2xl p-4.5 flex items-center justify-between border border-white/5 hover:border-amber-500/10 transition-all hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-950/60 rounded-xl text-lg shrink-0 shadow-inner">
                    {typeLabels[t.taskType]?.split(' ')[0] || '⏰'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{typeLabels[t.taskType]?.split(' ').slice(1).join(' ') || t.taskType}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-amber-500/70" />
                      {t.cronExpr} 
                      {t.lastRun && (
                        <span className="text-[10px] text-slate-600 bg-white/5 px-2 py-0.5 rounded">Last: {new Date(t.lastRun).toLocaleString()}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={() => handleToggleTask(t.id, t.enabled)} 
                    className={cn(
                      "p-2 rounded-xl transition-colors focus:outline-none hover:scale-105",
                      t.enabled ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-800'
                    )}
                  >
                    {t.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button 
                    onClick={() => handleDeleteTask(t.id)} 
                    className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/5 transition-colors focus:outline-none"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </motion.div>
  );
}


