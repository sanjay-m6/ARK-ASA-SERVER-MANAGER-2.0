import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Swords, Trash2, ShieldAlert, Award, Play, Square, Activity, Zap } from 'lucide-react';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface CombatEvent {
  event: string;
  attacker: string;
  tribe: string;
  target: string;
  damage: number;
  timestamp: number;
}

interface PlayerStats {
  name: string;
  tribe: string;
  totalDamage: number;
  maxHit: number;
  hitsCount: number;
}

export default function CombatMetrics() {
  const [isListening, setIsListening] = useState(true);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [stats, setStats] = useState<Record<string, PlayerStats>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Sound play helper for high damage critical hits
  const playCritSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime); // High pitch pitch
      oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15); // Ramp down
      
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // Ignore audio context errors
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      if (!isListening) return;

      const unlistenFn = await listen<CombatEvent>('combat_event', (event) => {
        const payload = event.payload;
        
        // 1. Play crit sound and toast for massive hits
        if (payload.damage >= 10000) {
          playCritSound();
          toast(`${payload.attacker} dealt a CRITICAL hit of ${payload.damage.toLocaleString()} to ${payload.target}!`, {
            icon: '🔥',
            style: {
              background: '#111827',
              color: '#F43F5E',
              border: '1px solid #F43F5E'
            }
          });
        }

        // 2. Append event to logs (keep last 100)
        setEvents((prev) => [payload, ...prev].slice(0, 100));

        // 3. Update aggregated statistics
        setStats((prev) => {
          const name = payload.attacker;
          const current = prev[name] || {
            name,
            tribe: payload.tribe || 'None',
            totalDamage: 0,
            maxHit: 0,
            hitsCount: 0,
          };

          return {
            ...prev,
            [name]: {
              ...current,
              totalDamage: current.totalDamage + payload.damage,
              maxHit: Math.max(current.maxHit, payload.damage),
              hitsCount: current.hitsCount + 1,
            },
          };
        });
      });

      unlisten = unlistenFn;
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [isListening]);

  // Clean stats and events
  const handleClear = () => {
    setEvents([]);
    setStats({});
    toast.success('Combat metrics cleared.');
  };

  // Compute leaderboard sorted by total damage
  const sortedLeaderboard = Object.values(stats).sort((a, b) => b.totalDamage - a.totalDamage);
  const maxDamageOnLeaderboard = sortedLeaderboard.length > 0 ? sortedLeaderboard[0].totalDamage : 1;

  return (
    <div className="flex flex-col h-full space-y-6 p-6 overflow-y-auto" ref={containerRef}>
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/10 via-blue-950/10 to-transparent backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
            <Swords className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Combat Metrics
              {isListening && (
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-400">
              Real-time damage telemetry, DPS leaderboards, and structural damage alarms.
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsListening(!isListening)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-300 shadow-lg",
              isListening
                ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30"
                : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            )}
          >
            {isListening ? (
              <>
                <Square className="w-4 h-4" /> Stop Server Stream
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Start Server Stream
              </>
            )}
          </button>

          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-700/50 bg-slate-800/40 text-slate-300 hover:bg-slate-700/40 hover:text-white transition-all"
          >
            <Trash2 className="w-4 h-4" /> Clear Local
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Leaderboards (Left side) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 backdrop-blur-xl">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <Award className="w-5 h-5 text-yellow-400" />
              Damage Leaderboard
            </h2>

            {sortedLeaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                <Activity className="w-12 h-12 text-slate-700 animate-pulse" />
                <p className="text-sm">No combat telemetry received yet.</p>
                <p className="text-xs text-slate-600">Start the game server and engage in combat.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedLeaderboard.slice(0, 10).map((player, index) => {
                  const pct = Math.max(1, (player.totalDamage / maxDamageOnLeaderboard) * 100);
                  return (
                    <div key={player.name} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2 text-white font-medium">
                          <span className="text-xs text-slate-500 w-4 font-mono">#{index + 1}</span>
                          <span className="truncate max-w-[200px]">{player.name}</span>
                          {player.tribe !== 'None' && (
                            <span className="text-[10px] text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded bg-cyan-950/20 font-mono">
                              {player.tribe}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-white font-semibold font-mono">
                            {player.totalDamage.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Max Hit: {player.maxHit.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800/50 rounded-full h-2.5 overflow-hidden border border-slate-800/80">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick stats box */}
          <div className="p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 backdrop-blur-xl">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-400" /> Server Combat Stats
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950/30 border border-slate-800/80 rounded-xl">
                <span className="text-xs text-slate-500 block uppercase font-semibold">Total Hits Logged</span>
                <span className="text-xl font-bold text-white font-mono mt-1 block">
                  {events.length > 0 ? events.length : '0'}
                </span>
              </div>
              <div className="p-4 bg-slate-950/30 border border-slate-800/80 rounded-xl">
                <span className="text-xs text-slate-500 block uppercase font-semibold">Top Combat Hit</span>
                <span className="text-xl font-bold text-rose-400 font-mono mt-1 block">
                  {sortedLeaderboard.length > 0
                    ? Math.max(...sortedLeaderboard.map((p) => p.maxHit)).toLocaleString()
                    : '0'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time event log (Right side) */}
        <div className="lg:col-span-7 p-6 rounded-2xl border border-slate-800/80 bg-slate-900/20 backdrop-blur-xl flex flex-col h-[600px]">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 border-b border-slate-800/80 pb-2">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            Live Damage Stream
          </h2>

          <div className="flex-1 overflow-y-auto pr-2 space-y-2 font-mono scrollbar-thin">
            {events.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 italic">
                Waiting for incoming game server socket events...
              </div>
            ) : (
              events.map((e, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-3 rounded-lg border flex flex-col md:flex-row justify-between gap-2 text-xs transition-all hover:bg-slate-950/40",
                    e.damage >= 10000
                      ? "bg-rose-950/20 border-rose-500/20 text-rose-300"
                      : "bg-slate-950/20 border-slate-800/80 text-slate-300"
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="font-semibold text-slate-200">{e.attacker}</span>
                      {e.tribe !== 'None' && (
                        <span className="text-[9px] bg-slate-800 px-1 py-0.5 rounded text-slate-400 border border-slate-700/50">
                          {e.tribe}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400">Target: </span>
                      <span className="text-slate-200">{e.target}</span>
                    </div>
                  </div>
                  <div className="flex items-center md:justify-end gap-2 text-right">
                    <span className="text-slate-500">Dealt:</span>
                    <span
                      className={cn(
                        "font-bold font-mono text-sm",
                        e.damage >= 10000 ? "text-rose-400" : "text-cyan-400"
                      )}
                    >
                      {e.damage.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
