import { useState, useEffect, useMemo } from 'react';
import { useAseServerStore } from '../stores/aseServerStore';
import { updateAseServer } from '../utils/aseCommands';
import { optimizeMemory, setProcessPriority } from '../../utils/tauri';
import { 
  Cpu, Save, Loader2, AlertTriangle, Zap, Activity, Eraser, BarChart2, Copy, 
  Flame, Shield, Check, Terminal, Sparkles, Filter, RotateCcw, 
  Globe, Radio, Settings2
} from 'lucide-react';
import { MODDED_MAP_PRESETS, buildLaunchArgs } from '../../data/moddedMapRegistry';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

interface FlagDefinition {
  flag: string;
  label: string;
  desc: string;
  category: 'security' | 'gameplay' | 'performance' | 'network' | 'events';
}

const ASE_COMMON_FLAGS: FlagDefinition[] = [
  // Security & Anti-Cheat
  { flag: '-NoBattlEye', label: 'Disable BattlEye', desc: 'Disables BattlEye anti-cheat verification for client connections.', category: 'security' },
  { flag: '-insecure', label: 'Insecure Mode', desc: 'Disables VAC security checks on the server process.', category: 'security' },
  { flag: '-AdditionalDupeProtection', label: 'Dupe Protection', desc: 'Enforces strict item and dino duplicate validation on transfer.', category: 'security' },
  { flag: '-ValidateItemDinoSpawns', label: 'Validate Spawns', desc: 'Validates spawned item and creature data structures.', category: 'security' },

  // Gameplay & World Rules
  { flag: '-ForceAllowCaveFlyers', label: 'Force Allow Cave Flyers', desc: 'Allows players to mount and ride flying creatures inside cave volumes.', category: 'gameplay' },
  { flag: '-PreventUploadDinos', label: 'Prevent Dino Uploads', desc: 'Blocks players from uploading tamed dinosaurs to cluster transfer.', category: 'gameplay' },
  { flag: '-ForceRespawnDinos', label: 'Force Wipe Wild Dinos', desc: 'Executes wild dinosaur wipe on server boot up.', category: 'gameplay' },
  { flag: '-ServerAllowAnsel', label: 'Allow NVIDIA Ansel', desc: 'Enables 3D Ansel photography mode for connected clients.', category: 'gameplay' },

  // Engine & Performance
  { flag: '-structurememopts', label: 'Structure Memory Opts', desc: 'Compresses structure mesh footprint in system RAM.', category: 'performance' },
  { flag: '-StructureStasisGrid', label: 'Structure Stasis Grid', desc: 'Puts distant structures into low-overhead stasis grids.', category: 'performance' },
  { flag: '-NoMemoryBias', label: 'No Memory Bias', desc: 'Bypasses engine memory allocation bias thresholds.', category: 'performance' },
  { flag: '-lowmemory', label: 'Low RAM Mode (4GB)', desc: 'Optimizes engine buffers for system memory constraints.', category: 'performance' },
  { flag: '-nomansky', label: 'Disable Dynamic Sky', desc: 'Disables clouds and sky mesh rendering to reduce GPU/CPU load.', category: 'performance' },
  { flag: '-d3d10', label: 'DirectX 10 Shader Fallback', desc: 'Forces legacy D3D10 renderer pipeline.', category: 'performance' },
  { flag: '-sm4', label: 'Shader Model 4', desc: 'Forces Shader Model 4 for lower hardware rendering.', category: 'performance' },
  { flag: '-DisablePhysX', label: 'Disable PhysX Check', desc: 'Disables strict PhysX movement validation checks.', category: 'performance' },
  { flag: '-usecache', label: 'Use Disk Cache', desc: 'Utilizes cached world assets for faster level loading.', category: 'performance' },

  // Network & Connectivity
  { flag: '-crossplay', label: 'Enable Crossplay', desc: 'Enables multi-platform player crossplay connectivity (Steam + Epic).', category: 'network' },
  { flag: '-PublicIPForEpic', label: 'Public IP for EGS', desc: 'Broadcasting public IP for Epic Games Store master server.', category: 'network' },
  { flag: '-epiconly', label: 'Epic Players Only', desc: 'Restricts server connection exclusively to Epic Games clients.', category: 'network' },
  { flag: '-AllowSharedConnections', label: 'Shared Connections', desc: 'Allows multiple client connections from shared network adapters.', category: 'network' },
  { flag: '-exclusivejoin', label: 'Exclusive Join Only', desc: 'Only permits players listed in the exclusive join whitelist.', category: 'network' },

  // Seasonal Events
  { flag: '-activeevent=WinterWonderland', label: 'Winter Wonderland', desc: 'Activates the Winter Wonderland holiday event.', category: 'events' },
  { flag: '-activeevent=Easter', label: 'Eggcellent Adventure', desc: 'Activates the Easter holiday event.', category: 'events' },
  { flag: '-activeevent=vday', label: 'Love Evolved', desc: 'Activates the Valentine\'s Day event.', category: 'events' },
  { flag: '-activeevent=Summer', label: 'Summer Bash', desc: 'Activates the Summer Bash event.', category: 'events' },
  { flag: '-activeevent=FearEvolved', label: 'Fear Evolved', desc: 'Activates the Halloween Fear Evolved event.', category: 'events' },
  { flag: '-activeevent=Thanksgiving', label: 'Turkey Trial', desc: 'Activates the Thanksgiving event.', category: 'events' },
];

export default function ASEAdvancedPage() {
    const location = useLocation();
    const { servers, refreshServers, activeServer } = useAseServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);
    const [customArgs, setCustomArgs] = useState('');
    const [originalArgs, setOriginalArgs] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [highPriority, setHighPriority] = useState(false);

    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        } else if (selectedServerId === null) {
            if (location.state?.serverId) setSelectedServerId(location.state.serverId);
            else if (servers.length > 0) setSelectedServerId(servers[0].id);
        }
    }, [activeServer, servers, selectedServerId, location.state]);

    // Load custom args
    useEffect(() => {
        if (!selectedServerId) return;
        const server = servers.find(s => s.id === selectedServerId);
        if (server) {
            const args = server.extraArgs || '';
            setCustomArgs(args);
            setOriginalArgs(args);
        }
    }, [selectedServerId, servers]);

    const isDirty = useMemo(() => customArgs !== originalArgs, [customArgs, originalArgs]);

    const activeFlagCount = useMemo(() => {
        if (!customArgs.trim()) return 0;
        return customArgs.trim().split(/\s+/).filter(Boolean).length;
    }, [customArgs]);

    const handleSave = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            await updateAseServer(selectedServerId, {
                extraArgs: customArgs
            });
            await refreshServers();
            setOriginalArgs(customArgs);
            toast.success('ASE Boot Launch Parameters saved');
        } catch (err) {
            console.error(err);
            toast.error('Failed to save ASE settings');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOptimizeMemory = async () => {
        setIsOptimizing(true);
        try {
            await optimizeMemory();
            toast.success('System memory optimized successfully');
        } catch (err) {
            console.error(err);
            toast.error('Failed to optimize memory');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleSetPriority = async (high: boolean) => {
        try {
            await setProcessPriority(high);
            setHighPriority(high);
            toast.success(`Process priority set to ${high ? 'High' : 'Normal'}`);
        } catch (err) {
            console.error(err);
            toast.error('Failed to change process priority');
        }
    };

    const toggleFlag = (flag: string) => {
        const lowerArgs = customArgs.toLowerCase();
        const lowerFlag = flag.toLowerCase();

        if (lowerArgs.includes(lowerFlag)) {
            const regex = new RegExp(`\\s*${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'gi');
            const updated = customArgs.replace(regex, '').trim();
            setCustomArgs(updated);
        } else {
            const updated = customArgs ? `${customArgs.trim()} ${flag}` : flag;
            setCustomArgs(updated);
        }
    };

    const isFlagActive = (flag: string) => {
        return customArgs.toLowerCase().includes(flag.toLowerCase());
    };

    const applyTuningPreset = (presetFlags: string, name: string) => {
        let current = customArgs;
        const flags = presetFlags.split(/\s+/).filter(Boolean);
        flags.forEach(f => {
            if (!current.toLowerCase().includes(f.toLowerCase())) {
                current = current ? `${current.trim()} ${f}` : f;
            }
        });
        setCustomArgs(current);
        toast.success(`Applied ${name} profile`);
    };

    const currentServer = useMemo(() => {
        return servers.find(s => s.id === selectedServerId);
    }, [servers, selectedServerId]);

    const filteredFlags = useMemo(() => {
        return ASE_COMMON_FLAGS.filter(f => {
            const matchesCat = selectedCategory === 'all' || f.category === selectedCategory;
            const matchesSearch = !searchQuery || 
                f.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                f.flag.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.desc.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [selectedCategory, searchQuery]);

    const assembledCommandLine = useMemo(() => {
        if (!currentServer) return 'ShooterGameServer.exe TheIsland?listen';
        const map = currentServer.mapName || 'TheIsland';
        const port = currentServer.port || 7777;
        const queryPort = currentServer.queryPort || 27015;
        const rconPort = currentServer.rconPort || 32330;
        const maxPlayers = currentServer.maxPlayers || 70;
        let base = `ShooterGameServer.exe ${map}?listen?SessionName="${currentServer.sessionName || currentServer.name}"?Port=${port}?QueryPort=${queryPort}?RCONPort=${rconPort}?MaxPlayers=${maxPlayers}?RCONEnabled=True`;
        if (customArgs.trim()) {
            base += ` ${customArgs.trim()}`;
        }
        return base;
    }, [currentServer, customArgs]);

    return (
        <div className="h-full flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 rounded-xl overflow-hidden border border-amber-500/20 shadow-2xl">
            {/* Top Control Bar */}
            <div className="px-6 py-4 border-b border-amber-500/20 bg-slate-900/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl shadow-inner">
                        <Cpu className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-white tracking-tight">ASE Boot Launch Parameters</h1>
                            {isDirty && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full animate-pulse">
                                    Unsaved Changes
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Manage command-line switches, performance flags, and process priority for ShooterGameServer.exe
                        </p>
                    </div>
                </div>

                {/* Server Switcher & Save Action */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Server Selector */}
                    <div className="flex items-center gap-2 bg-slate-950/80 border border-amber-500/20 rounded-xl px-3 py-1.5 shadow-inner">
                        <Radio className="w-4 h-4 text-amber-400" />
                        <select
                            value={selectedServerId || ''}
                            onChange={(e) => setSelectedServerId(Number(e.target.value))}
                            className="bg-transparent text-sm text-white font-medium outline-none cursor-pointer pr-2"
                        >
                            {servers.length === 0 ? (
                                <option value="">No ASE servers available</option>
                            ) : (
                                servers.map(s => (
                                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                                        {s.name} ({s.status})
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Reset Button */}
                    {isDirty && (
                        <button
                            onClick={() => setCustomArgs(originalArgs)}
                            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 rounded-xl text-xs font-semibold transition-all border border-slate-700/60 flex items-center gap-1.5"
                            title="Discard unsaved changes"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Discard
                        </button>
                    )}

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={isLoading || !selectedServerId}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all ${
                            isDirty 
                                ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-slate-950 shadow-amber-950/40 hover:scale-[1.02] active:scale-[0.98]'
                                : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>{isLoading ? 'Saving...' : 'Save Parameters'}</span>
                    </button>
                </div>
            </div>

            {/* Scrollable Main Workspace */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {/* 1. Notice Banner */}
                <div className="bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-slate-900/40 border border-amber-500/20 rounded-2xl p-4 flex items-start justify-between gap-4 shadow-xl">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 flex-shrink-0 mt-0.5">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                ASE ShooterGame Boot Command Matrix
                            </h3>
                            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                Parameters added here are directly appended to <code className="text-amber-400 font-mono bg-slate-950/80 px-1.5 py-0.5 rounded border border-amber-500/20">ShooterGameServer.exe</code> execution string on boot up.
                            </p>
                        </div>
                    </div>
                    {activeFlagCount > 0 && (
                        <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-right flex-shrink-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Active Switches</span>
                            <span className="text-sm font-mono font-black text-white">{activeFlagCount} Flags</span>
                        </div>
                    )}
                </div>

                {/* 2. Raw Command Input & Real-Time Terminal Preview (MOVED TO TOP) */}
                <div className="bg-slate-900/50 border border-amber-500/20 rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-amber-400" />
                            Raw Custom Arguments & Executable Inspector
                        </h2>
                        {customArgs.trim() && (
                            <button
                                onClick={() => setCustomArgs('')}
                                className="text-xs text-slate-400 hover:text-amber-400 transition-colors flex items-center gap-1"
                            >
                                <Eraser className="w-3.5 h-3.5" /> Clear All Flags
                            </button>
                        )}
                    </div>

                    {/* Input Field */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300">Custom Command Line Arguments</label>
                        <input
                            type="text"
                            value={customArgs}
                            onChange={(e) => setCustomArgs(e.target.value)}
                            placeholder="-NoBattlEye -ForceAllowCaveFlyers -structurememopts ..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none font-mono text-xs shadow-inner"
                        />
                        <p className="text-[11px] text-slate-400">
                            Space-separated arguments appended to ShooterGameServer.exe.
                        </p>
                    </div>

                    {/* Mods Warning Box */}
                    {customArgs.toLowerCase().includes('-mods=') && (
                        <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <p className="font-bold text-amber-300">Conditional -mods= configuration detected</p>
                                <p className="text-amber-400/80 mt-0.5">
                                    If active mods are enabled in the Mod Manager, any manual <code className="font-mono bg-amber-500/20 px-1 rounded">-mods=</code> here will be automatically formatted at boot time.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Live Terminal Synthesizer Box */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 relative overflow-hidden shadow-inner">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                <span className="text-xs font-mono text-slate-400 ml-2">ShooterGameServer.exe Command Line</span>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(assembledCommandLine);
                                    toast.success('Full command line copied to clipboard');
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                            >
                                <Copy className="w-3.5 h-3.5" /> Copy Command
                            </button>
                        </div>
                        <pre className="text-xs font-mono text-amber-400/90 whitespace-pre-wrap break-all leading-relaxed p-1">
                            {assembledCommandLine}
                        </pre>
                    </div>
                </div>

                {/* 3. Quick Profile Presets Bar */}
                <div className="bg-slate-900/50 border border-amber-500/20 rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            Optimized Server Profile Presets
                        </h2>
                        <span className="text-xs text-slate-400">Click to append pre-tuned flag combinations</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Preset 1: Max Performance */}
                        <button
                            onClick={() => applyTuningPreset('-usecache -nomansky -lowmemory -structurememopts -StructureStasisGrid', 'Classic RAM & Thread Tuning')}
                            className="p-3.5 bg-gradient-to-br from-amber-500/10 to-slate-900/60 hover:from-amber-500/20 hover:to-slate-900/80 border border-amber-500/20 hover:border-amber-500/40 rounded-xl text-left transition-all group flex items-start gap-3"
                        >
                            <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div>
                                <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">⚡ Classic RAM & Thread Optimization</h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">-usecache -nomansky -lowmemory -structurememopts</p>
                            </div>
                        </button>

                        {/* Preset 2: Hardened PvP */}
                        <button
                            onClick={() => applyTuningPreset('-NoBattlEye -AdditionalDupeProtection -ValidateItemDinoSpawns -PreventUploadDinos', 'Hardened Security')}
                            className="p-3.5 bg-gradient-to-br from-amber-500/10 to-slate-900/60 hover:from-amber-500/20 hover:to-slate-900/80 border border-amber-500/20 hover:border-amber-500/40 rounded-xl text-left transition-all group flex items-start gap-3"
                        >
                            <Shield className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div>
                                <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">🛡️ Hardened Security & Anti-Dupe</h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">Strict spawn validation & dupe prevention flags</p>
                            </div>
                        </button>

                        {/* Preset 3: Cave Flyer Unlocked */}
                        <button
                            onClick={() => applyTuningPreset('-ForceAllowCaveFlyers', 'Cave Flyers Unlocked')}
                            className="p-3.5 bg-gradient-to-br from-emerald-500/10 to-slate-900/60 hover:from-emerald-500/20 hover:to-slate-900/80 border border-emerald-500/20 hover:border-emerald-500/40 rounded-xl text-left transition-all group flex items-start gap-3"
                        >
                            <Globe className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div>
                                <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">🦅 Cave Flyer Unlocked</h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">Force allow mounting & flying in cave volumes</p>
                            </div>
                        </button>
                    </div>

                    {/* Modded Maps Presets */}
                    <div className="pt-2 border-t border-slate-800/60">
                        <div className="text-xs font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-amber-400" />
                            Modded Map Launch Presets
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASE').map(preset => {
                                const hasPreset = preset.mapModId ? customArgs.includes(`-MapModID=${preset.mapModId}`) : false;
                                return (
                                    <button
                                        key={preset.id}
                                        onClick={() => {
                                            if (!preset.mapModId) return;
                                            if (hasPreset) {
                                                toast('Map preset already applied', { icon: '✓' });
                                                return;
                                            }
                                            const newArgs = buildLaunchArgs(preset, customArgs);
                                            setCustomArgs(newArgs);
                                            toast.success(`${preset.name} launch arguments applied`);
                                        }}
                                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all text-xs ${
                                            hasPreset 
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-semibold' 
                                                : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700 text-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <span>{preset.icon}</span>
                                            <span className="truncate">{preset.name}</span>
                                            {preset.author && <span className="text-[10px] text-slate-500 font-normal">({preset.author})</span>}
                                        </div>
                                        {hasPreset ? (
                                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">Active</span>
                                        ) : (
                                            <span className="text-[10px] text-amber-400 font-mono">+ Apply</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 4. Visual Parameter Matrix (Interactive Flag Switcher) */}
                <div className="bg-slate-900/50 border border-amber-500/20 rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-amber-400" />
                                Visual Parameter Switcher
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Toggle standard shooter game server switches directly into your boot configuration
                            </p>
                        </div>

                        {/* Search & Category Filter */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Filter parameters..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 outline-none w-44"
                                />
                            </div>

                            <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
                                {['all', 'security', 'gameplay', 'performance', 'network', 'events'].map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-2.5 py-1 rounded-lg capitalize font-semibold transition-colors text-[11px] ${
                                            selectedCategory === cat 
                                                ? 'bg-amber-500 text-slate-950 shadow-md font-bold' 
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Flag Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredFlags.map(f => {
                            const active = isFlagActive(f.flag);
                            return (
                                <button
                                    key={f.flag}
                                    onClick={() => toggleFlag(f.flag)}
                                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden ${
                                        active 
                                            ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/40 shadow-lg shadow-amber-950/20' 
                                            : 'bg-slate-950/50 hover:bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                                    }`}
                                >
                                    {active && (
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-bl-full pointer-events-none" />
                                    )}

                                    <div>
                                        <div className="flex items-center justify-between gap-2">
                                            <code className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                                                active 
                                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                                                    : 'bg-slate-900 text-slate-400 border-slate-800 group-hover:text-slate-200'
                                            }`}>
                                                {f.flag}
                                            </code>
                                            <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                                                active ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-600'
                                            }`}>
                                                <Check className="w-3 h-3 stroke-[3]" />
                                            </div>
                                        </div>
                                        <h4 className="text-xs font-bold text-white mt-2">{f.label}</h4>
                                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{f.desc}</p>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800/40 mt-1">
                                        <span className="uppercase tracking-wider font-semibold">{f.category}</span>
                                        <span className={`font-bold uppercase tracking-wider ${active ? 'text-amber-400' : 'text-slate-600'}`}>
                                            {active ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 5. Performance & Hardware Optimizer Suite */}
                <div className="bg-slate-900/50 border border-amber-500/20 rounded-2xl p-5 shadow-xl space-y-4">
                    <div>
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            ASE Global Resource & Hardware Optimizer
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Real-time memory vacuuming, process scheduling priority, and eco-mode controls
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Memory Vacuum */}
                        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between gap-3">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-amber-400" /> Memory Vacuum
                                    </h3>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                    Force garbage collection to trim unused background RAM allocation.
                                </p>
                            </div>
                            <button
                                onClick={handleOptimizeMemory}
                                disabled={isOptimizing}
                                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
                                Optimize System Memory
                            </button>
                        </div>

                        {/* Process Priority */}
                        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between gap-3">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <BarChart2 className="w-3.5 h-3.5 text-amber-400" /> Process Execution Priority
                                    </h3>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                    Configure core scheduler allocation priority for the management service.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleSetPriority(false)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                        !highPriority 
                                            ? 'bg-slate-800 text-white border-slate-600' 
                                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                                    }`}
                                >
                                    Normal
                                </button>
                                <button
                                    onClick={() => handleSetPriority(true)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                        highPriority 
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-md' 
                                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                                    }`}
                                >
                                    High
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
