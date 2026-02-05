import { useState, useEffect } from 'react';
import { useServerStore } from '../../stores/serverStore';
import { updateServerSettings, optimizeMemory, setProcessPriority, toggleEcoMode } from '../../utils/tauri';
import { Cpu, Save, Loader2, AlertTriangle, Zap, Activity, Eraser, BarChart2, Leaf } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function AdvancedPage() {
    const location = useLocation();
    const { servers, refreshServers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [customArgs, setCustomArgs] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);

    // Initialize from navigation or default
    useEffect(() => {
        if (location.state?.serverId) setSelectedServerId(location.state.serverId);
        else if (servers.length > 0 && !selectedServerId) setSelectedServerId(servers[0].id);
    }, [servers, selectedServerId, location.state]);

    // Load custom args
    useEffect(() => {
        if (!selectedServerId) return;
        const server = servers.find(s => s.id === selectedServerId);
        if (server) {
            setCustomArgs(server.config.custom_args || '');
        }
    }, [selectedServerId, servers]);

    const handleSave = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            await updateServerSettings({
                serverId: selectedServerId,
                customArgs: customArgs
            });
            await refreshServers();
            toast.success('Advanced settings saved');
        } catch (err) {
            console.error(err);
            toast.error('Failed to save settings');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOptimizeMemory = async () => {
        setIsOptimizing(true);
        try {
            await optimizeMemory();
            toast.success('Memory optimized successfully');
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
            toast.success(`Priority set to ${high ? 'High' : 'Normal'}`);
        } catch (err) {
            console.error(err);
            toast.error('Failed to change priority');
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-950/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-800/50">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex flex-col gap-4 bg-slate-900/50">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <h2 className="text-xl font-bold bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent flex items-center gap-2">
                            <Cpu className="w-5 h-5 text-red-500" />
                            Advanced Configuration
                        </h2>

                        <div className="h-6 w-px bg-slate-700 mx-2" />

                        <select
                            value={selectedServerId || ''}
                            onChange={(e) => setSelectedServerId(Number(e.target.value))}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                        >
                            {servers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={isLoading || !selectedServerId}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-lg shadow-lg shadow-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <Cpu className="w-6 h-6 text-red-400" />
                            Advanced Launch Arguments
                        </h2>
                        <p className="text-slate-400 mb-6">
                            Specify additional command-line arguments to be passed to the server executable.
                            <br />
                            <span className="flex items-center gap-1 text-red-400/80 text-xs font-semibold uppercase tracking-wider mt-2">
                                <AlertTriangle className="w-3 h-3" />
                                Warning: Incorrect arguments may prevent the server from starting.
                            </span>
                        </p>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Custom Arguments</label>
                                <input
                                    type="text"
                                    value={customArgs}
                                    onChange={(e) => setCustomArgs(e.target.value)}
                                    placeholder="-NoBattlEye -forceallowcaveflyers ..."
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-red-500 outline-none font-mono text-sm"
                                />
                                <p className="text-xs text-slate-500">
                                    Arguments are appended to the start command. Do not use quotes unless necessary.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <Zap className="w-6 h-6 text-yellow-400" />
                            Performance Optimizer
                        </h2>
                        <p className="text-slate-400 mb-6">
                            Tools to optimize the Server Manager's performance and system resource usage.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-white">Memory Optimization</h3>
                                    <Activity className="w-4 h-4 text-slate-400" />
                                </div>
                                <p className="text-sm text-slate-400 mb-4">
                                    Trim unused memory from the application to free up resources for your servers.
                                </p>
                                <button
                                    onClick={handleOptimizeMemory}
                                    disabled={isOptimizing}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700"
                                >
                                    {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                                    Optimize RAM Now
                                </button>
                            </div>

                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-white">Process Priority</h3>
                                    <BarChart2 className="w-4 h-4 text-slate-400" />
                                </div>
                                <p className="text-sm text-slate-400 mb-4">
                                    Set the application process priority to High to ensure responsiveness under load.
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
                                        className="flex-1 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded-lg transition-colors text-sm border border-yellow-600/30 font-medium"
                                    >
                                        High Priority
                                    </button>
                                </div>
                            </div>

                            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 md:col-span-2">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-white flex items-center gap-2">
                                        <Leaf className="w-4 h-4 text-green-400" />
                                        Ultra Eco Mode
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-green-400/80 font-mono bg-green-400/10 px-2 py-0.5 rounded">Target &lt;50MB RAM</span>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-400 mb-4">
                                    Aggressively trims memory every few seconds. May cause slight stuttering when returning to the app.
                                </p>
                                <button
                                    onClick={() => toggleEcoMode(true).then(() => toast.success('Eco Mode Enabled')).catch(() => toast.error('Failed'))}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-green-900/20 hover:bg-green-900/30 text-green-400 rounded-lg transition-colors border border-green-900/30"
                                >
                                    Enable Eco Mode
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
