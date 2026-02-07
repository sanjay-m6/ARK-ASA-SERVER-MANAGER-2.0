import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Shield, AlertTriangle, Save, RefreshCw, Activity, Terminal } from 'lucide-react';
import { AntiCheatConfig, ViolationEvent, getAntiCheatConfig, saveAntiCheatConfig, getAntiCheatLogs } from '../../utils/tauri';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';

// Sensitivity Mapping
const SENSITIVITY_MAP = {
    0.5: 'Strict (High)',
    1.0: 'Normal',
    2.0: 'Relaxed (Low)'
};

export default function AntiCheatDashboard({ serverId }: { serverId: number | null }) {
    const [config, setConfig] = useState<AntiCheatConfig>({
        enabled: false,
        sensitivity: 1.0,
        actions: {
            log_only: true,
            kick_enabled: false,
            ban_enabled: false,
            discord_alert: false
        },
        mesh_protection: {
            enabled: false,
            threshold: 0.6,
            notify_player: true
        },
        command_protection: {
            enabled: false,
            blacklisted_commands: [],
            whitelist_admin_ids: []
        }
    });
    const [logs, setLogs] = useState<ViolationEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!serverId) return;
        loadData();

        const unlisten = listen<ViolationEvent>('anti-cheat://new-violation', (event) => {
            if (event.payload.server_id === serverId) {
                setLogs(prev => [event.payload, ...prev].slice(0, 50));
                // Optional: Play sound or show toast
                // toast('Violation Detected: ' + event.payload.player_name, { icon: '🚨' });
            }
        });

        return () => {
            unlisten.then(f => f());
        };
    }, [serverId]);

    const loadData = async () => {
        if (!serverId) return;
        setIsLoading(true);
        try {
            const [cfg, logData] = await Promise.all([
                getAntiCheatConfig(serverId),
                getAntiCheatLogs(serverId, 50)
            ]);
            setConfig(cfg);
            setLogs(logData);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load Anti-Cheat data');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!serverId) return;
        setIsSaving(true);
        try {
            await saveAntiCheatConfig(serverId, config);
            toast.success('Anti-Cheat Configuration Saved');
        } catch (error) {
            toast.error('Failed to save configuration');
        } finally {
            setIsSaving(false);
        }
    };

    if (!serverId) return <div className="text-slate-400">Select a server first.</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto p-6">

            {/* Header / Status */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 bg-[#12121f]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all",
                            config.enabled
                                ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
                                : "bg-slate-800"
                        )}>
                            <Shield className={cn("w-6 h-6", config.enabled ? "text-white" : "text-slate-500")} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Anti-Cheat System</h2>
                            <p className="text-slate-400 text-sm">Real-time behavioral monitoring and enforcement</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <span className={cn("font-semibold transition-colors", config.enabled ? "text-emerald-400" : "text-slate-400")}>
                                {config.enabled ? 'SYSTEM ACTIVE' : 'SYSTEM DISABLED'}
                            </span>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.enabled}
                                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </div>
                        </label>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-violet-500/20 transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {isSaving ? 'Saving...' : 'Save Config'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Configuration Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 bg-[#12121f]">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-400" />
                            Detection Sensitivity
                        </h3>

                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Level</span>
                                    <span className="text-indigo-400 font-mono font-bold">
                                        {SENSITIVITY_MAP[config.sensitivity as keyof typeof SENSITIVITY_MAP] || config.sensitivity}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="3"
                                    step="1"
                                    value={config.sensitivity <= 0.5 ? 1 : config.sensitivity >= 2.0 ? 3 : 2}
                                    onChange={(e) => {
                                        const step = parseInt(e.target.value);
                                        const val = step === 1 ? 0.5 : step === 3 ? 2.0 : 1.0;
                                        setConfig({ ...config, sensitivity: val });
                                    }}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <div className="flex justify-between text-xs text-slate-500 mt-2">
                                    <span>Strict</span>
                                    <span>Normal</span>
                                    <span>Relaxed</span>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200">
                                <AlertTriangle className="w-3 h-3 inline mr-1 mb-0.5" />
                                Higher sensitivity means strict enforcement but increases false positives.
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 bg-[#12121f]">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-red-400" />
                            Enforcement Actions
                        </h3>

                        <div className="space-y-3">
                            {/* Checkboxes */}
                            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.actions.log_only}
                                    onChange={(e) => setConfig({ ...config, actions: { ...config.actions, log_only: e.target.checked } })}
                                    className="w-5 h-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                                />
                                <div className="flex flex-col">
                                    <span className="text-slate-200 font-medium text-sm">Log Only (Passive)</span>
                                    <span className="text-slate-500 text-xs">Record violations but take no action.</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.actions.discord_alert}
                                    onChange={(e) => setConfig({ ...config, actions: { ...config.actions, discord_alert: e.target.checked } })}
                                    className="w-5 h-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                                />
                                <div className="flex flex-col">
                                    <span className="text-slate-200 font-medium text-sm">Discord Alerts</span>
                                    <span className="text-slate-500 text-xs">Send notifications to admin channel.</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.actions.kick_enabled}
                                    onChange={(e) => setConfig({ ...config, actions: { ...config.actions, kick_enabled: e.target.checked } })}
                                    className="w-5 h-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                                />
                                <div className="flex flex-col">
                                    <span className="text-slate-200 font-medium text-sm">Auto-Kick</span>
                                    <span className="text-slate-500 text-xs text-red-400">Violators will be disconnected.</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.actions.ban_enabled}
                                    onChange={(e) => setConfig({ ...config, actions: { ...config.actions, ban_enabled: e.target.checked } })}
                                    className="w-5 h-5 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                                />
                                <div className="flex flex-col">
                                    <span className="text-slate-200 font-medium text-sm">Auto-Ban</span>
                                    <span className="text-slate-500 text-xs text-red-500 font-bold">Permanent removal from cluster.</span>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Mesh Protection Panel */}
                <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 bg-[#12121f]">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-400" />
                        Mesh Protection
                    </h3>

                    <div className="space-y-4">
                        <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.mesh_protection.enabled}
                                onChange={(e) => setConfig({ ...config, mesh_protection: { ...config.mesh_protection, enabled: e.target.checked } })}
                                className="w-5 h-5 rounded border-slate-600 text-emerald-600 focus:ring-emerald-500 bg-slate-700"
                            />
                            <div className="flex flex-col">
                                <span className="text-slate-200 font-medium text-sm">Enable Mesh Detection</span>
                                <span className="text-slate-500 text-xs">Prevent structures under the map.</span>
                            </div>
                        </label>

                        {config.mesh_protection.enabled && (
                            <div className="space-y-3 pl-2 border-l-2 border-slate-700 ml-2">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-400">Sensitivity Threshold</span>
                                        <span className="text-emerald-400 font-mono">{(config.mesh_protection.threshold * 100).toFixed(0)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="1.0"
                                        step="0.1"
                                        value={config.mesh_protection.threshold}
                                        onChange={(e) => setConfig({ ...config, mesh_protection: { ...config.mesh_protection, threshold: parseFloat(e.target.value) } })}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-sm text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={config.mesh_protection.notify_player}
                                        onChange={(e) => setConfig({ ...config, mesh_protection: { ...config.mesh_protection, notify_player: e.target.checked } })}
                                        className="rounded border-slate-600 text-emerald-600 bg-slate-700"
                                    />
                                    Notify Player on Violation
                                </label>
                            </div>
                        )}
                    </div>
                </div>

                {/* Command Protection Panel */}
                <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 bg-[#12121f]">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-amber-400" />
                        Command Auto-Ban
                    </h3>

                    <div className="space-y-4">
                        <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.command_protection.enabled}
                                onChange={(e) => setConfig({ ...config, command_protection: { ...config.command_protection, enabled: e.target.checked } })}
                                className="w-5 h-5 rounded border-slate-600 text-amber-600 focus:ring-amber-500 bg-slate-700"
                            />
                            <div className="flex flex-col">
                                <span className="text-slate-200 font-medium text-sm">Enable Command Protection</span>
                                <span className="text-slate-500 text-xs">Auto-ban for prohibited commands.</span>
                            </div>
                        </label>

                        {config.command_protection.enabled && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Blacklisted Commands (comma separated)</label>
                                    <textarea
                                        value={config.command_protection.blacklisted_commands.join(', ')}
                                        onChange={(e) => setConfig({
                                            ...config,
                                            command_protection: {
                                                ...config.command_protection,
                                                blacklisted_commands: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                            }
                                        })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 h-20"
                                        placeholder="God, Fly, Ghost..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Admin Whitelist (Steam IDs, comma separated)</label>
                                    <textarea
                                        value={config.command_protection.whitelist_admin_ids.join(', ')}
                                        onChange={(e) => setConfig({
                                            ...config,
                                            command_protection: {
                                                ...config.command_protection,
                                                whitelist_admin_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                            }
                                        })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 h-20"
                                        placeholder="7656119..."
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Logs Panel */}
            <div className="lg:col-span-2">
                <div className="glass-panel p-6 rounded-2xl border border-slate-700/50 bg-[#12121f] h-[600px] flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-slate-400" />
                            Live Violation Feed
                        </h3>
                        <button
                            onClick={loadData}
                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                            title="Refresh Logs"
                        >
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent space-y-2">
                        {logs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                <Shield className="w-12 h-12 mb-3 opacity-20" />
                                <p>No violations recorded.</p>
                            </div>
                        ) : (
                            logs.map((log, idx) => (
                                <div key={idx} className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:border-indigo-500/30 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-slate-200 font-bold">{log.player_name}</span>
                                        <span className="text-xs text-slate-500 font-mono">
                                            {new Date(log.timestamp * 1000).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                            log.severity > 0.8 ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
                                        )}>
                                            {log.violation_type}
                                        </span>
                                        <span className="text-slate-400 truncate">{log.details}</span>
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
