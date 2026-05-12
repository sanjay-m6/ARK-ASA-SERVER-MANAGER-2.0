import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Save, RefreshCw, Clock, ShieldCheck, Power } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';

interface WatchdogConfig {
    server_id: number;
    enabled: boolean;
    polling_interval_minutes: number;
    safe_restart_mode: boolean;
    maintenance_windows: string[];
}

interface ModWatchdogDashboardProps {
    serverId: number | null;
}

export function ModWatchdogDashboard({ serverId }: ModWatchdogDashboardProps) {
    const { t } = useTranslation();
    const [config, setConfig] = useState<WatchdogConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (serverId) {
            loadConfig(serverId);
        } else {
            setConfig(null);
        }
    }, [serverId]);

    const loadConfig = async (id: number) => {
        setIsLoading(true);
        try {
            const conf: WatchdogConfig = await invoke('get_watchdog_config', { serverId: id });
            setConfig(conf);
        } catch (error) {
            console.error('Failed to load watchdog config:', error);
            toast.error('Failed to load Watchdog settings');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!serverId || !config) return;
        setIsSaving(true);
        try {
            await invoke('set_watchdog_config', { serverId, config });
            toast.success('Watchdog settings saved successfully!');
        } catch (error) {
            console.error('Failed to save watchdog config:', error);
            toast.error('Failed to save Watchdog settings');
        } finally {
            setIsSaving(false);
        }
    };

    if (!serverId) {
        return (
            <div className="glass-panel rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
                <ShieldAlert className="w-12 h-12 text-slate-500 mb-4" />
                <p className="text-slate-400">Select a server to configure the Mod Update Watchdog.</p>
            </div>
        );
    }

    if (isLoading || !config) {
        return (
            <div className="glass-panel rounded-2xl p-8 flex items-center justify-center min-h-[300px]">
                <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

            <div className="flex items-start justify-between mb-8 relative z-10">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl shadow-lg ${config.enabled ? 'bg-rose-500/20 text-rose-400 shadow-rose-500/20' : 'bg-slate-800 text-slate-400'}`}>
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            Mod Update Watchdog
                            {config.enabled && (
                                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
                                    Active
                                </span>
                            )}
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            Automatically detect mod updates, gracefully shut down the server with player warnings, and restart safely.
                        </p>
                    </div>
                </div>
                
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center space-x-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50"
                >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{t('common.save')}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                {/* Master Toggle */}
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white font-medium flex items-center gap-2">
                            <Power className="w-5 h-5 text-sky-400" />
                            Enable Watchdog
                        </h3>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                        </label>
                    </div>
                    <p className="text-slate-400 text-sm">
                        Continuously monitors CurseForge for updates to your installed mods.
                    </p>
                </div>

                {/* Polling Interval */}
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-colors">
                    <h3 className="text-white font-medium flex items-center gap-2 mb-4">
                        <Clock className="w-5 h-5 text-amber-400" />
                        Polling Interval (Minutes)
                    </h3>
                    <div className="flex items-center gap-4">
                        <input
                            type="range"
                            min="15"
                            max="360"
                            step="15"
                            value={config.polling_interval_minutes}
                            onChange={(e) => setConfig({ ...config, polling_interval_minutes: parseInt(e.target.value) })}
                            className="flex-1 accent-sky-500"
                        />
                        <span className="text-sky-400 font-bold bg-sky-500/10 px-3 py-1 rounded-lg border border-sky-500/20 min-w-[4rem] text-center">
                            {config.polling_interval_minutes}m
                        </span>
                    </div>
                    <p className="text-slate-500 text-xs mt-2">How often to query CurseForge API. (Min: 15m to avoid rate limits)</p>
                </div>

                {/* Safe Restart Mode */}
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-colors md:col-span-2">
                     <div className="flex items-center justify-between mb-2">
                        <h3 className="text-white font-medium flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                            Safe Restart Mode & Rollback Protection
                        </h3>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.safe_restart_mode}
                                onChange={(e) => setConfig({ ...config, safe_restart_mode: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>
                    <p className="text-slate-400 text-sm">
                        When enabled, the Watchdog will broadcast warnings via RCON (15m, 10m, 5m, 1m) before calling SaveWorld and initiating a graceful shutdown. It also backs up the current `.pak` files in case the update causes a server crash loop.
                    </p>
                </div>
                
            </div>
        </div>
    );
}
