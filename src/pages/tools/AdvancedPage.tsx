import { useState, useEffect, useMemo, useRef } from 'react';
import { useServerStore } from '../../stores/serverStore';
import { updateServerSettings, optimizeMemory, setProcessPriority, toggleEcoMode, startServer, restartServer } from '../../utils/tauri';
import { 
  Cpu, Save, Loader2, AlertTriangle, Zap, Activity, Eraser, BarChart2, Leaf, Copy, 
  Flame, Shield, Check, Terminal, Sparkles, Filter, CheckCircle2, RotateCcw, 
  Globe, Radio, Settings2, FileText, Play
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MODDED_MAP_PRESETS, buildLaunchArgs } from '../../data/moddedMapRegistry';
import LaunchArgsEditor from '../../components/ui/LaunchArgsEditor';
import PlatformSelector from '../../components/config/PlatformSelector';

interface FlagDefinition {
  flag: string;
  label: string;
  desc: string;
  category: 'security' | 'gameplay' | 'performance' | 'network' | 'events';
}

const COMMON_FLAGS: FlagDefinition[] = [
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
  { flag: '-StructureMemoryOptimizations', label: 'Structure Memory Opts', desc: 'Compresses structure mesh footprint in system RAM.', category: 'performance' },
  { flag: '-StructureStasisGrid', label: 'Structure Stasis Grid', desc: 'Puts distant structures into low-overhead stasis grids.', category: 'performance' },
  { flag: '-NoMemoryBias', label: 'No Memory Bias', desc: 'Bypasses engine memory allocation bias thresholds.', category: 'performance' },
  { flag: '-lowmemory', label: 'Low RAM Mode (4GB)', desc: 'Optimizes engine buffers for system memory constraints.', category: 'performance' },
  { flag: '-nomansky', label: 'Disable Dynamic Sky', desc: 'Disables clouds and sky mesh rendering to reduce GPU/CPU load.', category: 'performance' },
  { flag: '-d3d10', label: 'DirectX 10 Shader Fallback', desc: 'Forces legacy D3D10 renderer pipeline.', category: 'performance' },
  { flag: '-sm4', label: 'Shader Model 4', desc: 'Forces Shader Model 4 for lower hardware rendering.', category: 'performance' },
  { flag: '-DisablePhysX', label: 'Disable PhysX Check', desc: 'Disables strict PhysX movement validation checks.', category: 'performance' },

  // Network & Connectivity
  { flag: '-crossplay', label: 'Enable Crossplay', desc: 'Enables multi-platform player crossplay connectivity.', category: 'network' },
  { flag: '-UseServerPCOnly', label: 'PC-Only Mode', desc: 'Restricts server connection exclusively to PC players (Disables Crossplay).', category: 'network' },
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

export default function AdvancedPage() {
    const location = useLocation();
    const { servers, refreshServers, activeServer } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);
    const [customArgs, setCustomArgs] = useState('');
    const [originalArgs, setOriginalArgs] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [highPriority, setHighPriority] = useState(false);
    const [ecoModeActive, setEcoModeActive] = useState(false);

    const loadedServerIdRef = useRef<number | null>(null);

    // Initialize selectedServerId on mount or location state without overriding manual dropdown switches
    useEffect(() => {
        if (selectedServerId === null) {
            if (location.state?.serverId) setSelectedServerId(location.state.serverId);
            else if (activeServer) setSelectedServerId(activeServer.id);
            else if (servers.length > 0) setSelectedServerId(servers[0].id);
        }
    }, [activeServer, servers, selectedServerId, location.state]);

    // Load custom args when selected server ID changes or initial server list loads
    useEffect(() => {
        if (!selectedServerId) return;
        const server = servers.find(s => s.id === selectedServerId) || (activeServer?.id === selectedServerId ? activeServer : null);
        if (server) {
            const args = server.config?.customArgs || server.config?.custom_args || '';
            if (loadedServerIdRef.current !== selectedServerId) {
                setCustomArgs(args);
                setOriginalArgs(args);
                loadedServerIdRef.current = selectedServerId;
            } else if (args !== originalArgs) {
                if (customArgs === originalArgs) {
                    setCustomArgs(args);
                }
                setOriginalArgs(args);
            }
        }
    }, [selectedServerId, servers, activeServer, customArgs, originalArgs]);

    const isDirty = useMemo(() => customArgs !== originalArgs, [customArgs, originalArgs]);

    const activeFlagCount = useMemo(() => {
        if (!customArgs.trim()) return 0;
        return customArgs.trim().split(/\s+/).filter(Boolean).length;
    }, [customArgs]);

    const [isExecuting, setIsExecuting] = useState(false);

    const handleSave = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            await updateServerSettings({
                serverId: selectedServerId,
                customArgs: customArgs
            });
            await refreshServers();
            setOriginalArgs(customArgs);
            loadedServerIdRef.current = selectedServerId;
            toast.success('Boot Launch Parameters saved successfully');
        } catch (err) {
            console.error('Failed to save boot launch parameters:', err);
            toast.error(`Failed to save settings: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecute = async () => {
        if (!selectedServerId) {
            toast.error('No server selected');
            return;
        }
        setIsExecuting(true);
        try {
            if (isDirty) {
                await updateServerSettings({
                    serverId: selectedServerId,
                    customArgs: customArgs
                });
                setOriginalArgs(customArgs);
                loadedServerIdRef.current = selectedServerId;
            }

            const currentSrv = servers.find(s => s.id === selectedServerId) || activeServer;
            const isRunning = currentSrv?.status === 'running' || currentSrv?.status === 'online' || currentSrv?.status === 'starting';

            if (isRunning) {
                toast.loading('Restarting server with updated boot parameters...', { id: 'execute-server-toast' });
                await restartServer(selectedServerId);
                toast.success('Server restart initiated with custom boot parameters!', { id: 'execute-server-toast' });
            } else {
                toast.loading('Launching server with custom boot parameters...', { id: 'execute-server-toast' });
                await startServer(selectedServerId);
                toast.success('Server executed successfully with custom boot parameters!', { id: 'execute-server-toast' });
            }
            await refreshServers();
        } catch (err) {
            console.error('Failed to execute server:', err);
            toast.error(`Execution failed: ${err}`, { id: 'execute-server-toast' });
        } finally {
            setIsExecuting(false);
        }
    };

    const handleOptimizeMemory = async () => {
        setIsOptimizing(true);
        try {
            await optimizeMemory();
            toast.success('Memory vacuumed & optimized successfully');
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

    const handleToggleEco = async () => {
        try {
            const nextState = !ecoModeActive;
            await toggleEcoMode(nextState);
            setEcoModeActive(nextState);
            toast.success(nextState ? 'Ultra Eco Mode Enabled' : 'Eco Mode Disabled');
        } catch (err) {
            console.error(err);
            toast.error('Failed to toggle Eco Mode');
        }
    };

    const isFlagActive = (flag: string) => {
        if (!customArgs.trim()) return false;
        if (flag.includes('=')) {
            const [key, val] = flag.split('=');
            const regex = new RegExp(`(?:^|\\s)${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}=([^\\s]+)`, 'i');
            const match = customArgs.match(regex);
            return match ? match[1].toLowerCase() === val.toLowerCase() : false;
        }
        const regex = new RegExp(`(?:^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\s|$)`, 'i');
        return regex.test(customArgs);
    };

    const toggleFlag = (flag: string) => {
        if (flag.includes('=')) {
            const [key] = flag.split('=');
            const keyRegex = new RegExp(`(?:^|\\s)${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}=([^\\s]+)`, 'gi');
            if (isFlagActive(flag)) {
                // Remove existing flag
                const updated = customArgs.replace(keyRegex, '').trim();
                setCustomArgs(updated);
            } else {
                // Remove any existing instance of this key first, then append new value
                let updated = customArgs.replace(keyRegex, '').trim();
                updated = updated ? `${updated} ${flag}` : flag;
                setCustomArgs(updated.trim());
            }
        } else {
            const flagRegex = new RegExp(`(?:^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\s|$)`, 'gi');
            if (isFlagActive(flag)) {
                const updated = customArgs.replace(flagRegex, '').trim();
                setCustomArgs(updated);
            } else {
                const updated = customArgs ? `${customArgs.trim()} ${flag}` : flag;
                setCustomArgs(updated);
            }
        }
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
        return COMMON_FLAGS.filter(f => {
            const matchesCat = selectedCategory === 'all' || f.category === selectedCategory;
            const matchesSearch = !searchQuery || 
                f.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                f.flag.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.desc.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [selectedCategory, searchQuery]);

    const assembledCommandLine = useMemo(() => {
        if (!currentServer) return 'ArkAscendedServer.exe TheIsland_WP?listen';
        const map = currentServer.config?.mapName || 'TheIsland_WP';
        const port = currentServer.ports?.gamePort || 7777;
        const queryPort = currentServer.ports?.queryPort || 27015;
        const rconPort = currentServer.ports?.rconPort || 32330;
        const maxPlayers = currentServer.config?.maxPlayers || 70;
        let base = `ArkAscendedServer.exe ${map}?listen?SessionName="${currentServer.name}"?Port=${port}?QueryPort=${queryPort}?RCONPort=${rconPort}?MaxPlayers=${maxPlayers}?RCONEnabled=True`;
        if (customArgs.trim()) {
            base += ` ${customArgs.trim()}`;
        }
        return base;
    }, [currentServer, customArgs]);

    return (
        <div className="h-full flex flex-col glass-panel text-[var(--text-primary)] rounded-xl overflow-hidden border border-[var(--border)] shadow-2xl">
            {/* Top Control Bar */}
            <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-xl shadow-inner">
                        <Cpu className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Boot Launch Parameters</h1>
                            {isDirty && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                    Unsaved Changes
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Manage command-line switches, performance flags, and execution priority
                        </p>
                    </div>
                </div>

                {/* Server Switcher & Save Action */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Server Selector */}
                    <div className="flex items-center gap-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl px-3 py-1.5 shadow-inner">
                        <Radio className="w-4 h-4 text-red-400" />
                        <select
                            value={selectedServerId || ''}
                            onChange={(e) => {
                                const newId = Number(e.target.value);
                                setSelectedServerId(newId);
                                const server = servers.find(s => s.id === newId);
                                const args = server?.config?.customArgs || server?.config?.custom_args || '';
                                setCustomArgs(args);
                                setOriginalArgs(args);
                                loadedServerIdRef.current = newId;
                            }}
                            className="bg-transparent text-sm text-[var(--text-primary)] font-medium outline-none cursor-pointer pr-2"
                        >
                            {servers.length === 0 ? (
                                <option value="" className="bg-[var(--card-background)] text-[var(--text-primary)]">No servers available</option>
                            ) : (
                                servers.map(s => (
                                    <option key={s.id} value={s.id} className="bg-[var(--card-background)] text-[var(--text-primary)]">
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
                            className="px-3 py-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-all border border-[var(--border)] flex items-center gap-1.5 cursor-pointer"
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
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all cursor-pointer ${
                            isDirty 
                                ? 'bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-red-900/40 hover:scale-[1.02] active:scale-[0.98]'
                                : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)] hover:text-[var(--text-primary)]'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>{isLoading ? 'Saving...' : 'Save Parameters'}</span>
                    </button>

                    {/* Execute Button */}
                    <button
                        onClick={handleExecute}
                        disabled={isExecuting || !selectedServerId}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-950/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        title="Execute server directly with configured boot parameters"
                    >
                        {isExecuting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Play className="w-4 h-4 fill-white text-white" />}
                        <span>{isExecuting ? 'Executing...' : 'Execute Server'}</span>
                    </button>
                </div>
            </div>

            {/* Scrollable Main Workspace */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent">
                {/* 1. Notice Banner */}
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start justify-between gap-4 shadow-md">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 flex-shrink-0 mt-0.5">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                Boot Command Line Safety & Override Matrix
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                                Parameters added here are directly passed to <code className="text-red-400 font-mono bg-[var(--surface)] px-1.5 py-0.5 rounded border border-red-500/30">ArkAscendedServer.exe</code> on boot. Use visual flag toggles below to prevent syntax typos.
                            </p>
                        </div>
                    </div>
                    {activeFlagCount > 0 && (
                        <div className="px-3 py-1.5 bg-red-500/15 border border-red-500/30 rounded-xl text-right flex-shrink-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block">Active Switches</span>
                            <span className="text-sm font-mono font-black text-[var(--text-primary)]">{activeFlagCount} Flags</span>
                        </div>
                    )}
                </div>

                {/* Platform Selection Checklist */}
                <PlatformSelector
                    serverId={selectedServerId}
                    customArgs={customArgs}
                    onChange={setCustomArgs}
                />

                {/* 2. Raw Command Input & Real-Time Terminal Preview (MOVED TO TOP) */}
                <div className="glass-panel border border-[var(--border)] rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-emerald-400" />
                            Raw Custom Arguments & Command Inspector
                        </h2>
                        {customArgs.trim() && (
                            <button
                                onClick={() => setCustomArgs('')}
                                className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                                <Eraser className="w-3.5 h-3.5" /> Clear All Flags
                            </button>
                        )}
                    </div>

                    {/* Tag & Text Launch Args Editor */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[var(--text-primary)]">Custom Launch Arguments</label>
                        <LaunchArgsEditor
                            value={customArgs}
                            onChange={setCustomArgs}
                            accentColor="red"
                            placeholder="e.g. -NoBattlEye -ForceAllowCaveFlyers (toggle flags below to add)"
                        />
                    </div>

                    {/* Mods Warning Box */}
                    {customArgs.toLowerCase().includes('-mods=') && (
                        <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <p className="font-bold text-amber-400">Conditional -mods= configuration detected</p>
                                <p className="text-amber-500/90 mt-0.5">
                                    If active mods are enabled in the Mod Manager, any manual <code className="font-mono bg-amber-500/20 px-1 rounded">-mods=</code> here will be automatically formatted at boot time.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Live Terminal Synthesizer Box */}
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2 relative overflow-hidden shadow-inner">
                        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                <span className="text-xs font-mono text-[var(--text-muted)] ml-2">Boot Executable Command Line</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={handleExecute}
                                    disabled={isExecuting || !selectedServerId}
                                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/40 border border-emerald-400/30 flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    {isExecuting ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                    ) : (
                                        <Play className="w-3.5 h-3.5 fill-white text-white" />
                                    )}
                                    Execute Server
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(assembledCommandLine);
                                        toast.success('Full command line copied to clipboard');
                                    }}
                                    className="px-2.5 py-1.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-[var(--border)] cursor-pointer"
                                >
                                    <Copy className="w-3.5 h-3.5" /> Copy Command
                                </button>
                                <button
                                    onClick={() => {
                                        const server = servers.find(s => s.id === selectedServerId);
                                        const pathStr = server ? (typeof server.installPath === 'string' ? server.installPath : String(server.installPath)) : 'C:/path/to/ShooterGame';
                                        const win64Path = `${pathStr.replace(/\\/g, '/')}/ShooterGame/Binaries/Win64`;
                                        const batContent = `@echo off\r\n:: Auto-generated launch script by ARK ASA Server Manager\r\ntitle ASA Server - ${server?.name || 'Server'}\r\ncd /d "${win64Path}"\r\n"ArkAscendedServer.exe" ${assembledCommandLine}\r\npause\r\n`;
                                        navigator.clipboard.writeText(batContent);
                                        toast.success('Copied start_server.bat script to clipboard! (Also auto-generated in server folder on boot)');
                                    }}
                                    className="px-2.5 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 border border-violet-500/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    <FileText className="w-3.5 h-3.5 text-violet-400" /> Copy .bat Script
                                </button>
                            </div>
                        </div>
                        <pre className="text-xs font-mono text-emerald-500 whitespace-pre-wrap break-all leading-relaxed p-1">
                            {assembledCommandLine}
                        </pre>
                    </div>
                </div>

                {/* 3. Quick Profile Presets Bar */}
                <div className="glass-panel border border-[var(--border)] rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            One-Click Parameter Presets
                        </h2>
                        <span className="text-xs text-[var(--text-secondary)]">Click to append optimized flag profiles</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Preset 1: Max Performance */}
                        <button
                            onClick={() => applyTuningPreset('-structurememopts -StructureStasisGrid -NoMemoryBias -lowmemory -nomansky', 'Max Performance')}
                            className="p-3.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-amber-500/40 rounded-xl text-left transition-all group flex items-start gap-3 cursor-pointer shadow-sm"
                        >
                            <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-amber-400 transition-colors">⚡ Max Performance Profile</h4>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">RAM & mesh stasis tuning (-structurememopts -nomansky -lowmemory)</p>
                            </div>
                        </button>

                        {/* Preset 2: Hardened PvP */}
                        <button
                            onClick={() => applyTuningPreset('-NoBattlEye -AdditionalDupeProtection -ValidateItemDinoSpawns -PreventUploadDinos', 'Hardened Security')}
                            className="p-3.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-red-500/40 rounded-xl text-left transition-all group flex items-start gap-3 cursor-pointer shadow-sm"
                        >
                            <Shield className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-red-400 transition-colors">🛡️ Hardened Security & Anti-Dupe</h4>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Strict spawn validation & dupe prevention flags</p>
                            </div>
                        </button>

                        {/* Preset 3: Cave Flyer Unlocked */}
                        <button
                            onClick={() => applyTuningPreset('-ForceAllowCaveFlyers', 'Cave Flyers Unlocked')}
                            className="p-3.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] hover:border-emerald-500/40 rounded-xl text-left transition-all group flex items-start gap-3 cursor-pointer shadow-sm"
                        >
                            <Globe className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-emerald-400 transition-colors">🦅 Cave Flyer Unlocked</h4>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Force allow mounting & flying in cave volumes</p>
                            </div>
                        </button>
                    </div>

                    {/* Modded Maps Presets */}
                    <div className="pt-2 border-t border-[var(--border)]">
                        <div className="text-xs font-semibold text-[var(--text-muted)] mb-2.5 flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-orange-400" />
                            Modded Map Launch Presets
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASA').map(preset => {
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
                                            toast.success(`${preset.name} launch parameters applied`);
                                        }}
                                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all text-xs cursor-pointer ${
                                            hasPreset 
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold' 
                                                : 'bg-[var(--surface)] hover:bg-[var(--surface-hover)] border-[var(--border)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <span>{preset.icon}</span>
                                            <span className="truncate">{preset.name}</span>
                                            {preset.author && <span className="text-[10px] text-[var(--text-muted)] font-normal">({preset.author})</span>}
                                        </div>
                                        {hasPreset ? (
                                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">Active</span>
                                        ) : (
                                            <span className="text-[10px] text-orange-400 font-mono">+ Apply</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 4. Interactive Parameter Matrix (Visual Flag Switcher) */}
                <div className="glass-panel border border-[var(--border)] rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-red-400" />
                                Visual Parameter Matrix
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                Toggle standard server switches directly into your boot configuration
                            </p>
                        </div>

                        {/* Search & Category Filter */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Filter parameters..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-red-500 outline-none w-44"
                                />
                            </div>

                            <div className="flex items-center gap-1 bg-[var(--surface-hover)] p-1 border border-[var(--border)] rounded-xl text-xs">
                                {['all', 'security', 'gameplay', 'performance', 'network', 'events'].map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-2.5 py-1 rounded-lg capitalize font-semibold transition-colors text-[11px] cursor-pointer ${
                                            selectedCategory === cat 
                                                ? 'bg-red-600 text-white shadow-md' 
                                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
                                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden cursor-pointer shadow-sm ${
                                        active 
                                            ? 'bg-red-500/10 border-red-500/40 shadow-sm' 
                                            : 'bg-[var(--surface)] hover:bg-[var(--surface-hover)] border-[var(--border)] hover:border-[var(--border-hover)]'
                                    }`}
                                >
                                    {active && (
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-bl-full pointer-events-none" />
                                    )}

                                    <div>
                                        <div className="flex items-center justify-between gap-2">
                                            <code className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                                                active 
                                                    ? 'bg-red-500/20 text-red-400 border-red-500/40' 
                                                    : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] border-[var(--border)] group-hover:text-[var(--text-primary)]'
                                            }`}>
                                                {f.flag}
                                            </code>
                                            <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                                                active ? 'bg-red-500 text-white' : 'bg-[var(--surface-hover)] text-[var(--text-muted)]'
                                            }`}>
                                                <Check className="w-3 h-3 stroke-[3]" />
                                            </div>
                                        </div>
                                        <h4 className="text-xs font-bold text-[var(--text-primary)] mt-2">{f.label}</h4>
                                        <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">{f.desc}</p>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-2 border-t border-[var(--border)] mt-1">
                                        <span className="uppercase tracking-wider font-semibold">{f.category}</span>
                                        <span className={`font-bold uppercase tracking-wider ${active ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                                            {active ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 5. Performance & Hardware Optimizer Suite */}
                <div className="glass-panel border border-[var(--border)] rounded-2xl p-5 shadow-xl space-y-4">
                    <div>
                        <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            Server Manager Performance & Hardware Optimizer
                        </h2>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Real-time memory vacuuming, process scheduling priority, and eco-mode controls
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Memory Vacuum */}
                        <div className="bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] flex flex-col justify-between gap-3 shadow-sm">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-sky-400" /> Memory Vacuum
                                    </h3>
                                </div>
                                <p className="text-[11px] text-[var(--text-secondary)]">
                                    Force garbage collection to trim unused background RAM allocation.
                                </p>
                            </div>
                            <button
                                onClick={handleOptimizeMemory}
                                disabled={isOptimizing}
                                className="w-full py-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] rounded-xl transition-all border border-[var(--border)] text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                            >
                                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
                                Optimize System RAM
                            </button>
                        </div>

                        {/* Process Priority */}
                        <div className="bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] flex flex-col justify-between gap-3 shadow-sm">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <BarChart2 className="w-3.5 h-3.5 text-amber-400" /> Process Priority
                                    </h3>
                                </div>
                                <p className="text-[11px] text-[var(--text-secondary)]">
                                    Raise manager CPU scheduling thread priority under heavy cluster load.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleSetPriority(false)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                                        !highPriority 
                                            ? 'bg-[var(--surface-active)] text-[var(--text-primary)] border-[var(--border)]' 
                                            : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)]'
                                    }`}
                                >
                                    Normal
                                </button>
                                <button
                                    onClick={() => handleSetPriority(true)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                                        highPriority 
                                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm' 
                                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                                    }`}
                                >
                                    High Priority
                                </button>
                            </div>
                        </div>

                        {/* Ultra Eco Mode */}
                        <div className="bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] flex flex-col justify-between gap-3 shadow-sm">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Leaf className="w-3.5 h-3.5 text-emerald-400" /> Ultra Eco Mode
                                    </h3>
                                    <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">&lt;50MB RAM</span>
                                </div>
                                <p className="text-[11px] text-[var(--text-secondary)]">
                                    Aggressively trims memory footprint when running idle in background.
                                </p>
                            </div>
                            <button
                                onClick={handleToggleEco}
                                className={`w-full py-2 rounded-xl transition-all border text-xs font-semibold flex items-center justify-center gap-2 ${
                                    ecoModeActive
                                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/40'
                                        : 'bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 border-emerald-800/40'
                                }`}
                            >
                                {ecoModeActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Leaf className="w-3.5 h-3.5" />}
                                {ecoModeActive ? 'Eco Mode Active' : 'Enable Eco Mode'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
