import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Shield, Save, Clock, HardDrive, Server, Loader2, Info, 
    Zap, ShieldCheck, Play, Check, Sparkles, Sliders, Bell
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { BackupPolicy } from '../../types';

interface BackupPoliciesProps {
    serverId: number | null;
}

type PresetType = 'high_protection' | 'balanced' | 'storage_saver' | 'on_event' | 'custom';

export default function BackupPolicies({ serverId }: BackupPoliciesProps) {
    const { t } = useTranslation();
    const [policy, setPolicy] = useState<BackupPolicy | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTestingWebhook, setIsTestingWebhook] = useState(false);
    const [isTriggeringNow, setIsTriggeringNow] = useState(false);
    const [activePreset, setActivePreset] = useState<PresetType>('balanced');

    // Backup targets selection
    const [targets, setTargets] = useState({
        saves: true,
        configs: true,
        mods: false,
        logs: false,
    });

    useEffect(() => {
        if (!serverId) return;

        const fetchPolicy = async () => {
            setIsLoading(true);
            try {
                const data = await invoke<BackupPolicy>('get_backup_policy', { serverId });
                setPolicy(data);
                // Determine preset
                detectPreset(data);
            } catch (err) {
                console.error("Failed to fetch policy:", err);
                toast.error(t('backupPolicies.fetchFailed', 'Failed to fetch backup policies.'));
            } finally {
                setIsLoading(false);
            }
        };
        fetchPolicy();
    }, [serverId]);

    const detectPreset = (p: BackupPolicy) => {
        if (p.intervalHours === 1 && p.retentionDays >= 30 && p.backupBeforeUpdate && p.backupBeforeRestart) {
            setActivePreset('high_protection');
        } else if (p.intervalHours === 6 && p.retentionDays === 14 && p.backupBeforeUpdate && p.backupBeforeRestart) {
            setActivePreset('balanced');
        } else if (p.intervalHours === 24 && p.retentionDays <= 7 && !p.backupBeforeUpdate) {
            setActivePreset('storage_saver');
        } else if (p.backupBeforeUpdate && p.backupBeforeRestart && p.intervalHours >= 12) {
            setActivePreset('on_event');
        } else {
            setActivePreset('custom');
        }
    };

    const applyPreset = (preset: PresetType) => {
        if (!policy) return;
        setActivePreset(preset);

        switch (preset) {
            case 'high_protection':
                setPolicy({
                    ...policy,
                    enabled: true,
                    intervalHours: 1,
                    retentionDays: 30,
                    retentionCount: 50,
                    storageQuotaGb: 100,
                    backupBeforeUpdate: true,
                    backupBeforeRestart: true,
                    compressionEnabled: true,
                });
                toast.success('Applied High Protection Preset (Hourly Backups)');
                break;
            case 'balanced':
                setPolicy({
                    ...policy,
                    enabled: true,
                    intervalHours: 6,
                    retentionDays: 14,
                    retentionCount: 20,
                    storageQuotaGb: 50,
                    backupBeforeUpdate: true,
                    backupBeforeRestart: true,
                    compressionEnabled: true,
                });
                toast.success('Applied Balanced Preset (6-Hour Backups)');
                break;
            case 'storage_saver':
                setPolicy({
                    ...policy,
                    enabled: true,
                    intervalHours: 24,
                    retentionDays: 7,
                    retentionCount: 10,
                    storageQuotaGb: 20,
                    backupBeforeUpdate: false,
                    backupBeforeRestart: true,
                    compressionEnabled: true,
                });
                toast.success('Applied Storage Saver Preset (Daily Backups)');
                break;
            case 'on_event':
                setPolicy({
                    ...policy,
                    enabled: true,
                    intervalHours: 12,
                    retentionDays: 14,
                    retentionCount: 15,
                    storageQuotaGb: 40,
                    backupBeforeUpdate: true,
                    backupBeforeRestart: true,
                    compressionEnabled: true,
                });
                toast.success('Applied On-Event Preset (Pre-Restart & Pre-Update)');
                break;
            case 'custom':
                break;
        }
    };

    const handleSave = async () => {
        if (!policy || !serverId) return;

        setIsSaving(true);
        try {
            await invoke('save_backup_policy', { policy });
            toast.success(t('backupPolicies.saved', 'Backup policies saved successfully.'));
        } catch (err) {
            console.error("Failed to save policy:", err);
            const message = err instanceof Error ? err.message : JSON.stringify(err);
            toast.error(t('backupPolicies.saveFailed', { error: message }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleTriggerBackupNow = async () => {
        if (!serverId) return;
        setIsTriggeringNow(true);
        try {
            await invoke('create_backup', {
                serverId,
                name: `Auto-Backup (Policy Trigger)`,
                includeConfigs: targets.configs,
                includeSaves: targets.saves,
                includeMods: targets.mods,
                compress: policy?.compressionEnabled ?? true,
            });
            toast.success('Automated backup created successfully!');
        } catch (err) {
            console.error("Failed to create backup:", err);
            toast.error('Failed to execute automated backup: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsTriggeringNow(false);
        }
    };

    const handleTestWebhook = async () => {
        if (!policy?.discordWebhook) {
            toast.error('Please enter a Discord Webhook URL first.');
            return;
        }
        setIsTestingWebhook(true);
        try {
            const resp = await fetch(policy.discordWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '✅ ASA Server Manager - Backup Notification',
                        description: 'Automated Backup System notification test completed successfully!',
                        color: 5814783,
                        timestamp: new Date().toISOString(),
                    }]
                })
            });
            if (resp.ok) {
                toast.success('Discord notification test sent!');
            } else {
                toast.error('Discord API returned status ' + resp.status);
            }
        } catch (err) {
            toast.error('Failed to send webhook test: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsTestingWebhook(false);
        }
    };

    if (!serverId) return null;

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
        );
    }

    if (!policy) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Main Toggle */}
            <div className="glass-panel p-6 rounded-xl border border-slate-700/50">
                <div className="flex items-center justify-between mb-6 border-b border-slate-700/50 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
                            <Shield className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                Automated Backup System
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    v2.0 Advanced
                                </span>
                            </h2>
                            <p className="text-slate-400 text-sm">Configure automated backup schedules, retention policies, and presets</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleTriggerBackupNow}
                            disabled={isTriggeringNow}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-medium rounded-lg shadow-md transition-all text-sm"
                        >
                            {isTriggeringNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                            Backup Now
                        </button>

                        <label className="flex items-center gap-3 cursor-pointer bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-700">
                            <span className="text-slate-200 font-medium text-sm">Enable Automation</span>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={policy.enabled}
                                    onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Presets Section */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Automated Backup Presets</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {/* High Protection */}
                        <button
                            type="button"
                            onClick={() => applyPreset('high_protection')}
                            className={`p-3.5 rounded-xl border text-left transition-all ${
                                activePreset === 'high_protection'
                                    ? 'bg-purple-500/15 border-purple-500 text-white shadow-lg shadow-purple-500/10'
                                    : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 font-bold text-sm text-purple-300">
                                    <Zap className="w-4 h-4 text-purple-400" />
                                    High Protection
                                </div>
                                {activePreset === 'high_protection' && <Check className="w-4 h-4 text-purple-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">Hourly backups, 30 days retention, 100GB quota.</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                                Best for PvP / Active
                            </span>
                        </button>

                        {/* Balanced */}
                        <button
                            type="button"
                            onClick={() => applyPreset('balanced')}
                            className={`p-3.5 rounded-xl border text-left transition-all ${
                                activePreset === 'balanced'
                                    ? 'bg-blue-500/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                                    : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 font-bold text-sm text-blue-300">
                                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                                    Balanced
                                </div>
                                {activePreset === 'balanced' && <Check className="w-4 h-4 text-blue-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">Every 6 hours, 14 days retention, 50GB quota.</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                                Recommended
                            </span>
                        </button>

                        {/* Storage Saver */}
                        <button
                            type="button"
                            onClick={() => applyPreset('storage_saver')}
                            className={`p-3.5 rounded-xl border text-left transition-all ${
                                activePreset === 'storage_saver'
                                    ? 'bg-green-500/15 border-green-500 text-white shadow-lg shadow-green-500/10'
                                    : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 font-bold text-sm text-green-300">
                                    <HardDrive className="w-4 h-4 text-green-400" />
                                    Storage Saver
                                </div>
                                {activePreset === 'storage_saver' && <Check className="w-4 h-4 text-green-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">Daily backups, 7 days retention, 20GB quota.</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-green-500/20 text-green-300 rounded border border-green-500/30">
                                Low Disk Usage
                            </span>
                        </button>

                        {/* On Event */}
                        <button
                            type="button"
                            onClick={() => applyPreset('on_event')}
                            className={`p-3.5 rounded-xl border text-left transition-all ${
                                activePreset === 'on_event'
                                    ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                                    : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 font-bold text-sm text-amber-300">
                                    <Clock className="w-4 h-4 text-amber-400" />
                                    On Event
                                </div>
                                {activePreset === 'on_event' && <Check className="w-4 h-4 text-amber-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">Backups before Server Restart & Update.</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                Pre-Maintenance
                            </span>
                        </button>

                        {/* Custom */}
                        <button
                            type="button"
                            onClick={() => applyPreset('custom')}
                            className={`p-3.5 rounded-xl border text-left transition-all ${
                                activePreset === 'custom'
                                    ? 'bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                                    : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 font-bold text-sm text-indigo-300">
                                    <Sliders className="w-4 h-4 text-indigo-400" />
                                    Custom Config
                                </div>
                                {activePreset === 'custom' && <Check className="w-4 h-4 text-indigo-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">Fully customized interval, targets and retention.</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                                Manual Control
                            </span>
                        </button>
                    </div>
                </div>

                {/* Configuration Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 transition-opacity" style={{ opacity: policy.enabled ? 1 : 0.5, pointerEvents: policy.enabled ? 'auto' : 'none' }}>

                    {/* Schedule & Trigger Settings */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-slate-700/50 pb-2">
                            <Clock className="w-5 h-5 text-amber-400" />
                            Schedule & Triggers
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Backup Interval (Hours)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min="1"
                                        max="720"
                                        value={policy.intervalHours}
                                        onChange={(e) => {
                                            setPolicy({ ...policy, intervalHours: parseInt(e.target.value) || 24 });
                                            setActivePreset('custom');
                                        }}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500"
                                    />
                                    <span className="text-slate-400 text-sm whitespace-nowrap">hrs</span>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    {[1, 3, 6, 12, 24, 48].map((h) => (
                                        <button
                                            key={h}
                                            type="button"
                                            onClick={() => {
                                                setPolicy({ ...policy, intervalHours: h });
                                                setActivePreset('custom');
                                            }}
                                            className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                                                policy.intervalHours === h
                                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500'
                                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                            }`}
                                        >
                                            {h}h
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl cursor-pointer hover:border-purple-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block text-sm">Backup Before Server Update</span>
                                    <span className="text-xs text-slate-400">Creates a restore point automatically prior to steamcmd update</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={policy.backupBeforeUpdate}
                                    onChange={(e) => {
                                        setPolicy({ ...policy, backupBeforeUpdate: e.target.checked });
                                        setActivePreset('custom');
                                    }}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                                />
                            </label>

                            <label className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl cursor-pointer hover:border-purple-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block text-sm">Backup Before Scheduled Restart</span>
                                    <span className="text-xs text-slate-400">Generates snapshot during automated maintenance restarts</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={policy.backupBeforeRestart}
                                    onChange={(e) => {
                                        setPolicy({ ...policy, backupBeforeRestart: e.target.checked });
                                        setActivePreset('custom');
                                    }}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                                />
                            </label>

                            {/* Target Scope */}
                            <div className="pt-2">
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Backup Targets
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.saves}
                                            onChange={(e) => setTargets({ ...targets, saves: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        Save Games (.ark)
                                    </label>
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.configs}
                                            onChange={(e) => setTargets({ ...targets, configs: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        INI Configurations
                                    </label>
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.mods}
                                            onChange={(e) => setTargets({ ...targets, mods: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        Mods Data & Cache
                                    </label>
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.logs}
                                            onChange={(e) => setTargets({ ...targets, logs: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        Server Logs & Chat
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Retention & Quota Settings */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-slate-700/50 pb-2">
                            <HardDrive className="w-5 h-5 text-blue-400" />
                            Retention & Storage Limits
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Retention Duration (Days)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={policy.retentionDays}
                                    onChange={(e) => {
                                        setPolicy({ ...policy, retentionDays: parseInt(e.target.value) || 7 });
                                        setActivePreset('custom');
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-1">Backups older than this will be automatically pruned</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Max Backup Count Keep
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={policy.retentionCount}
                                    onChange={(e) => {
                                        setPolicy({ ...policy, retentionCount: parseInt(e.target.value) || 10 });
                                        setActivePreset('custom');
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-1">Maximum number of recent backups stored simultaneously</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Disk Quota Allocation (GB)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    step="0.5"
                                    value={policy.storageQuotaGb}
                                    onChange={(e) => {
                                        setPolicy({ ...policy, storageQuotaGb: parseFloat(e.target.value) || 50.0 });
                                        setActivePreset('custom');
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-1">Prevents server disk space exhaustion by enforcing hard storage limits</p>
                            </div>
                        </div>
                    </div>

                    {/* Advanced & Discord Webhook Settings */}
                    <div className="space-y-4 md:col-span-2 border-t border-slate-700/50 pt-6">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Server className="w-5 h-5 text-green-400" />
                            Compression & Discord Alert Notifications
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl cursor-pointer hover:border-green-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block text-sm">ZIP Compression</span>
                                    <span className="text-xs text-slate-400">Compresses backup files into high-ratio .zip archives to save disk space</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={policy.compressionEnabled}
                                    onChange={(e) => setPolicy({ ...policy, compressionEnabled: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500"
                                />
                            </label>

                            <label className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl cursor-pointer hover:border-sky-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block text-sm">Cloud Sync Enable</span>
                                    <span className="text-xs text-slate-400">Automatically syncs fresh backup snapshots to Cloud Storage</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={policy.cloudSyncEnabled}
                                    onChange={(e) => setPolicy({ ...policy, cloudSyncEnabled: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                                />
                            </label>
                        </div>

                        {/* Discord Webhook Notification URL */}
                        <div className="mt-4 p-4 bg-slate-900/40 border border-slate-700/60 rounded-xl space-y-2">
                            <label className="block text-sm font-semibold text-slate-200 flex items-center gap-2">
                                <Bell className="w-4 h-4 text-indigo-400" />
                                Discord Backup Notification Webhook (Optional)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    placeholder="https://discord.com/api/webhooks/..."
                                    value={policy.discordWebhook || ''}
                                    onChange={(e) => setPolicy({ ...policy, discordWebhook: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleTestWebhook}
                                    disabled={isTestingWebhook}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 shrink-0"
                                >
                                    {isTestingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg transition-all shadow-lg shadow-purple-500/20 font-medium"
                    >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {t('backupPolicies.saveBtn', 'Save Automation Policies')}
                    </button>
                </div>
            </div>

            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
                <div className="text-sm text-purple-200">
                    <p className="font-semibold text-purple-300 mb-1">Automated Policy Execution Active</p>
                    <p>The system background scheduler automatically executes backups according to the active interval, applies retention cleanup to prevent disk bloat, and triggers notifications whenever maintenance events run.</p>
                </div>
            </div>
        </div>
    );
}
