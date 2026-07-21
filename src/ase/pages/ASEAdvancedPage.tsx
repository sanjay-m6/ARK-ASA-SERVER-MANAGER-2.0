import { useState, useEffect } from 'react';
import { useAseServerStore } from '../stores/aseServerStore';

import { updateAseServer } from '../utils/aseCommands';
import { optimizeMemory, setProcessPriority } from '../../utils/tauri';
import { Cpu, Save, Loader2, AlertTriangle, Zap, Activity, Eraser, BarChart2, Copy, Flame } from 'lucide-react';
import { MODDED_MAP_PRESETS, buildLaunchArgs } from '../../data/moddedMapRegistry';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function ASEAdvancedPage() {
    const location = useLocation();
    const { servers, refreshServers, activeServer } = useAseServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);
    const [customArgs, setCustomArgs] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);

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
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCustomArgs(server.extraArgs || '');
        }
    }, [selectedServerId, servers]);

    const handleSave = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            await updateAseServer(selectedServerId, {
                extraArgs: customArgs
            });
            await refreshServers();
            toast.success('ASE Advanced settings saved successfully');
        } catch (err) {
            console.error(err);
            toast.error('Failed to save advanced settings');
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
            toast.success(`Process priority set to ${high ? 'High' : 'Normal'}`);
        } catch (err) {
            console.error(err);
            toast.error('Failed to change process priority');
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-950/50 backdrop-blur-sm rounded-xl overflow-hidden border border-amber-500/10">
            {/* Header */}
            <div className="p-4 border-b border-amber-500/10 flex flex-col gap-4 bg-slate-900/50">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <h2 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent flex items-center gap-2">
                            <Cpu className="w-5 h-5 text-amber-500" />
                            ASE Advanced Configuration
                        </h2>


                    </div>

                    <button
                        onClick={handleSave}
                        disabled={isLoading || !selectedServerId}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-2xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] text-xs font-black uppercase tracking-wider h-[42px]"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Settings
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-slate-800/30 rounded-xl p-6 border border-amber-500/10">
                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <Cpu className="w-6 h-6 text-amber-400" />
                            ASE Custom Launch Arguments
                        </h2>
                        <p className="text-slate-400 mb-6">
                            Specify additional command-line parameters to append to the shooter game server.
                            <br />
                            <span className="flex items-center gap-1 text-amber-400/80 text-xs font-semibold uppercase tracking-wider mt-2">
                                <AlertTriangle className="w-3 h-3" />
                                Warning: Incorrect parameters may cause server crashes on boot.
                            </span>
                        </p>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Command Line Arguments</label>
                                <input
                                    type="text"
                                    value={customArgs}
                                    onChange={(e) => setCustomArgs(e.target.value)}
                                    placeholder="-NoBattlEye -forceallowcaveflyers -structurememopts"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-amber-500 outline-none font-mono text-sm"
                                />
                                <p className="text-xs text-slate-500">
                                    Arguments will be appended directly to the server command line.
                                </p>
                                {customArgs.toLowerCase().includes('-mods=') && (
                                    <div className="flex items-start gap-2 mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs font-semibold text-amber-300">
                                                Conditional -mods= configuration
                                            </p>
                                            <p className="text-xs text-amber-400/80 mt-0.5">
                                                If there are active mods enabled in the Mod Manager, any <code className="font-mono bg-amber-500/10 px-1 rounded">-mods=</code> arguments here will be stripped at launch. Otherwise, your manual list will be preserved.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Active Arguments Preview */}
                            {selectedServerId && (() => {
                                const server = servers.find(s => s.id === selectedServerId);
                                if (!server) return null;
                                const mapName = server.mapName || 'TheIsland';
                                const activeArgs = customArgs ? customArgs.trim() : '(none)';
                                return (
                                    <div className="bg-slate-900/70 rounded-lg p-4 border border-amber-500/10 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-slate-300">Active Boot Parameters Preview</h4>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`Map: ${mapName}\nArguments: ${activeArgs}`);
                                                    toast.success('Copied parameters to clipboard');
                                                }}
                                                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Active Map</span>
                                                <p className="text-sm text-white font-mono mt-0.5">{mapName}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Custom Launch Flags</span>
                                                <p className={`text-sm font-mono mt-0.5 ${activeArgs === '(none)' ? 'text-slate-500 italic' : 'text-amber-400'}`}>{activeArgs}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Quick Presets */}
                            <div className="border-t border-slate-700/30 pt-4">
                                <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                                    <Flame className="w-4 h-4 text-amber-400" />
                                    Optimized Server Presets
                                </h4>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => {
                                            const preset = '-usecache -nomansky -lowmemory -structurememopts';
                                            if (customArgs.includes('-structurememopts')) {
                                                toast('Preset already applied', { icon: '✓' });
                                                return;
                                            }
                                            setCustomArgs(prev => prev ? `${prev.trim()} ${preset}` : preset);
                                            toast.success('Performance tuning parameters applied');
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 hover:border-amber-500/30 rounded-lg transition-all group text-left"
                                    >
                                        <span className="text-lg">⚡</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-white">Classic RAM & Thread Optimization</div>
                                            <div className="text-xs text-slate-400 font-mono truncate">-usecache -nomansky -lowmemory -structurememopts</div>
                                        </div>
                                        <span className="text-xs text-amber-400/70 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Apply</span>
                                    </button>

                                    {MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASE').map(preset => {
                                        const hasPreset = preset.mapModId ? customArgs.includes(`-MapModID=${preset.mapModId}`) : false;
                                        return (
                                            <button
                                                key={preset.id}
                                                onClick={() => {
                                                    if (!preset.mapModId) return;
                                                    if (hasPreset) {
                                                        toast('Already applied', { icon: '✓' });
                                                        return;
                                                    }
                                                    const newArgs = buildLaunchArgs(preset, customArgs);
                                                    setCustomArgs(newArgs);
                                                    toast.success(`${preset.name} launch arguments applied`);
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 border rounded-lg transition-all group text-left ${
                                                    hasPreset 
                                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-slate-300' 
                                                        : 'bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/10 hover:border-amber-500/30 text-slate-200'
                                                }`}
                                            >
                                                <span className="text-lg">{preset.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-white flex items-center gap-1.5">
                                                        <span>{preset.name}</span>
                                                        {preset.author && <span className="text-[10px] text-slate-400 font-normal">by {preset.author}</span>}
                                                        {hasPreset && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Applied</span>}
                                                    </div>
                                                    <div className="text-xs text-slate-400 font-mono truncate">
                                                        -MapModID={preset.mapModId} -mods={preset.mapModId}
                                                    </div>
                                                </div>
                                                {!hasPreset && (
                                                    <span className="text-xs text-amber-400/70 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Apply</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/30 rounded-xl p-6 border border-amber-500/10">
                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <Zap className="w-6 h-6 text-amber-400" />
                            Global Resource Optimizer
                        </h2>
                        <p className="text-slate-400 mb-6">
                            Tools to optimize hardware thread allocation and free unreferenced system memory blocks.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-white">Memory Optimizations</h3>
                                    <Activity className="w-4 h-4 text-slate-400" />
                                </div>
                                <p className="text-sm text-slate-400 mb-4">
                                    Trigger global garbage collection to minimize server manager RAM footprints.
                                </p>
                                <button
                                    onClick={handleOptimizeMemory}
                                    disabled={isOptimizing}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700"
                                >
                                    {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                                    Optimize Memory
                                </button>
                            </div>

                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-white">Execution Priority</h3>
                                    <BarChart2 className="w-4 h-4 text-slate-400" />
                                </div>
                                <p className="text-sm text-slate-400 mb-4">
                                    Configure core scheduler allocation priority for the management service.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleSetPriority(false)}
                                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm border border-slate-700"
                                    >
                                        Normal
                                    </button>
                                    <button
                                        onClick={() => handleSetPriority(true)}
                                        className="flex-1 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors text-sm border border-amber-500/20 font-bold"
                                    >
                                        High
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
