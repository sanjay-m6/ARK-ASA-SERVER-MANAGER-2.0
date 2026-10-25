import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Shield, Save, Clock, HardDrive, Server, Loader2, Info, 
    Zap, ShieldCheck, Play, Check, Sparkles, Sliders, Bell,
    FolderOpen, Folder, RotateCcw
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { BackupPolicy } from '../../types';
import { getPlatformInfo } from '../../platform/platform';
import { cn } from '../../utils/helpers';
import { NumberInput } from '../ui/NumberInput';

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
    const [defaultBackupDir, setDefaultBackupDir] = useState<string>('C:/ASA_Backups');

    // Backup targets selection
    const [targets, setTargets] = useState({
        saves: true,
        configs: true,
        mods: false,
        logs: false,
    });

    useEffect(() => {
        getPlatformInfo().then((info) => {
            if (info?.defaultBackupDir) {
                setDefaultBackupDir(info.defaultBackupDir);
            }
        }).catch(console.error);
    }, []);

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
                toast.success(t('backupPolicies.appliedHigh', 'Applied High Protection Preset (Hourly Backups)'));
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
                toast.success(t('backupPolicies.appliedBalanced', 'Applied Balanced Preset (6-Hour Backups)'));
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
                toast.success(t('backupPolicies.appliedStorage', 'Applied Storage Saver Preset (Daily Backups)'));
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
                toast.success(t('backupPolicies.appliedOnEvent', 'Applied On-Event Preset (Pre-Restart & Pre-Update)'));
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
            toast.success(t('backupPolicies.backupCreated', 'Automated backup created successfully!'));
        } catch (err) {
            console.error("Failed to create backup:", err);
            toast.error(t('backupPolicies.backupFailed', { error: err instanceof Error ? err.message : String(err), defaultValue: 'Failed to execute automated backup: {{error}}' }));
        } finally {
            setIsTriggeringNow(false);
        }
    };

    const handleTestWebhook = async () => {
        if (!policy?.discordWebhook) {
            toast.error(t('backupPolicies.enterWebhookFirst', 'Please enter a Discord Webhook URL first.'));
            return;
        }
        setIsTestingWebhook(true);
        try {
            const resp = await fetch(policy.discordWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: `✅ ASA Server Manager - ${t('backupPolicies.webhookTestTitle', 'Backup Notification')}`,
                        description: t('backupPolicies.webhookTestDesc', 'Automated Backup System notification test completed successfully!'),
                        color: 5814783,
                        timestamp: new Date().toISOString(),
                    }]
                })
            });
            if (resp.ok) {
                toast.success(t('backupPolicies.webhookTestSent', 'Discord notification test sent!'));
            } else {
                toast.error(t('backupPolicies.webhookStatus', { status: resp.status, defaultValue: 'Discord API returned status {{status}}' }));
            }
        } catch (err) {
            toast.error(t('backupPolicies.webhookTestFailed', { error: err instanceof Error ? err.message : String(err), defaultValue: 'Failed to send webhook test: {{error}}' }));
        } finally {
            setIsTestingWebhook(false);
        }
    };

    const handleBrowseBackupDir = async () => {
        try {
            const selected = await invoke<string | null>('select_folder', {
                title: t('backupPolicies.selectLocation', 'Select Backup Storage Location'),
            });
            if (selected) {
                setPolicy({ ...policy!, customBackupDir: selected });
                setActivePreset('custom');
                toast.success(t('backupPolicies.locationSet', { path: selected, defaultValue: `Backup location set to: ${selected}` }));
            }
        } catch (err) {
            console.error('Failed to select folder:', err);
            toast.error(t('backupPolicies.selectDirFailed', 'Failed to select backup directory'));
        }
    };

    const handleResetBackupDir = () => {
        if (!policy) return;
        setPolicy({ ...policy, customBackupDir: undefined });
        setActivePreset('custom');
        toast.success(t('backupPolicies.locationReset', 'Backup location reset to default'));
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
                                {t('backupPolicies.systemTitle', 'Automated Backup System')}
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    {t('backupPolicies.versionBadge', 'v2.0 Advanced')}
                                </span>
                            </h2>
                            <p className="text-slate-400 text-sm">{t('backupPolicies.systemSubtitle', 'Configure automated backup schedules, retention policies, and presets')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleTriggerBackupNow}
                            disabled={isTriggeringNow}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-medium rounded-lg shadow-md transition-all text-sm"
                        >
                            {isTriggeringNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                            {t('backupPolicies.backupNow', 'Backup Now')}
                        </button>

                        <label className="flex items-center gap-3 cursor-pointer bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-700">
                            <span className="text-slate-200 font-medium text-sm">{t('backupPolicies.enable', 'Enable Automation')}</span>
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
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{t('backupPolicies.presetsTitle', 'Automated Backup Presets')}</h3>
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
                                    {t('backupPolicies.presetHigh', 'High Protection')}
                                </div>
                                {activePreset === 'high_protection' && <Check className="w-4 h-4 text-purple-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{t('backupPolicies.presetHighDesc', 'Hourly backups, 30 days retention, 100GB quota.')}</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                                {t('backupPolicies.presetHighTag', 'Best for PvP / Active')}
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
                                    {t('backupPolicies.presetBalanced', 'Balanced')}
                                </div>
                                {activePreset === 'balanced' && <Check className="w-4 h-4 text-blue-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{t('backupPolicies.presetBalancedDesc', 'Every 6 hours, 14 days retention, 50GB quota.')}</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                                {t('backupPolicies.presetBalancedTag', 'Recommended')}
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
                                    {t('backupPolicies.presetStorage', 'Storage Saver')}
                                </div>
                                {activePreset === 'storage_saver' && <Check className="w-4 h-4 text-green-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{t('backupPolicies.presetStorageDesc', 'Daily backups, 7 days retention, 20GB quota.')}</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-green-500/20 text-green-300 rounded border border-green-500/30">
                                {t('backupPolicies.presetStorageTag', 'Low Disk Usage')}
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
                                    {t('backupPolicies.presetOnEvent', 'On Event')}
                                </div>
                                {activePreset === 'on_event' && <Check className="w-4 h-4 text-amber-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{t('backupPolicies.presetOnEventDesc', 'Backups before Server Restart & Update.')}</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                {t('backupPolicies.presetOnEventTag', 'Pre-Maintenance')}
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
                                    {t('backupPolicies.presetCustom', 'Custom Config')}
                                </div>
                                {activePreset === 'custom' && <Check className="w-4 h-4 text-indigo-400" />}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{t('backupPolicies.presetCustomDesc', 'Fully customized interval, targets and retention.')}</p>
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                                {t('backupPolicies.presetCustomTag', 'Manual Control')}
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
                            {t('backupPolicies.scheduleTriggers', 'Schedule & Triggers')}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    {t('backupPolicies.intervalLabel', 'Backup Interval (Hours)')}
                                </label>
                                <div className="flex items-center gap-3">
                                    <NumberInput
                                        integer
                                        min={1}
                                        max={720}
                                        value={policy.intervalHours}
                                        onValueChange={(n) => {
                                            setPolicy({ ...policy, intervalHours: n });
                                            setActivePreset('custom');
                                        }}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500"
                                    />
                                    <span className="text-slate-400 text-sm whitespace-nowrap">{t('backupPolicies.hrs', 'hrs')}</span>
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
                                    <span className="text-white font-medium block text-sm">{t('backupPolicies.beforeServerUpdate', 'Backup Before Server Update')}</span>
                                    <span className="text-xs text-slate-400">{t('backupPolicies.beforeServerUpdateDesc', 'Creates a restore point automatically prior to steamcmd update')}</span>
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
                                    <span className="text-white font-medium block text-sm">{t('backupPolicies.beforeScheduledRestart', 'Backup Before Scheduled Restart')}</span>
                                    <span className="text-xs text-slate-400">{t('backupPolicies.beforeScheduledRestartDesc', 'Generates snapshot during automated maintenance restarts')}</span>
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
                                    {t('backupPolicies.targets', 'Backup Targets')}
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.saves}
                                            onChange={(e) => setTargets({ ...targets, saves: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        {t('backupPolicies.targetSaves', 'Save Games (.ark)')}
                                    </label>
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.configs}
                                            onChange={(e) => setTargets({ ...targets, configs: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        {t('backupPolicies.targetConfigs', 'INI Configurations')}
                                    </label>
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.mods}
                                            onChange={(e) => setTargets({ ...targets, mods: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        {t('backupPolicies.targetMods', 'Mods Data & Cache')}
                                    </label>
                                    <label className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={targets.logs}
                                            onChange={(e) => setTargets({ ...targets, logs: e.target.checked })}
                                            className="rounded border-slate-700 text-purple-500"
                                        />
                                        {t('backupPolicies.targetLogs', 'Server Logs & Chat')}
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Retention & Quota Settings */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-slate-700/50 pb-2">
                            <HardDrive className="w-5 h-5 text-blue-400" />
                            {t('backupPolicies.retentionLimits', 'Retention & Storage Limits')}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    {t('backupPolicies.retentionDuration', 'Retention Duration (Days)')}
                                </label>
                                <NumberInput
                                    integer
                                    min={1}
                                    value={policy.retentionDays}
                                    onValueChange={(n) => {
                                        setPolicy({ ...policy, retentionDays: n });
                                        setActivePreset('custom');
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-1">{t('backupPolicies.retentionDurationDesc', 'Backups older than this will be automatically pruned')}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    {t('backupPolicies.maxCountKeep', 'Max Backup Count Keep')}
                                </label>
                                <NumberInput
                                    integer
                                    min={1}
                                    value={policy.retentionCount}
                                    onValueChange={(n) => {
                                        setPolicy({ ...policy, retentionCount: n });
                                        setActivePreset('custom');
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-1">{t('backupPolicies.maxCountKeepDesc', 'Maximum number of recent backups stored simultaneously')}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    {t('backupPolicies.diskQuota', 'Disk Quota Allocation (GB)')}
                                </label>
                                <NumberInput
                                    min={1}
                                    value={policy.storageQuotaGb}
                                    onValueChange={(n) => {
                                        setPolicy({ ...policy, storageQuotaGb: n });
                                        setActivePreset('custom');
                                    }}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-1">{t('backupPolicies.diskQuotaDesc', 'Prevents server disk space exhaustion by enforcing hard storage limits')}</p>
                            </div>

                            {/* Backup Storage Directory */}
                            <div className="pt-2 border-t border-slate-700/40">
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-sm font-medium text-slate-300">
                                        {t('backupPolicies.storageLocation', 'Backup Storage Location')}
                                    </label>
                                    <span className={cn(
                                        "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                                        policy.customBackupDir
                                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                            : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                    )}>
                                        {policy.customBackupDir ? t('backupPolicies.customPath', 'Custom Path') : t('backupPolicies.defaultPath', 'Default Path')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            readOnly
                                            value={policy.customBackupDir || defaultBackupDir}
                                            placeholder={defaultBackupDir}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500 truncate"
                                        />
                                        <Folder className="w-4 h-4 text-slate-500 absolute right-2.5 top-2.5" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleBrowseBackupDir}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
                                        title={t('backupPolicies.browseForFolder', 'Browse for folder')}
                                    >
                                        <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                                        {t('common.browse', 'Browse')}
                                    </button>
                                    {policy.customBackupDir && (
                                        <button
                                            type="button"
                                            onClick={handleResetBackupDir}
                                            className="flex items-center gap-1.5 px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                                            title={t('backupPolicies.resetLocation', 'Reset to default location')}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                                            {t('common.reset', 'Reset')}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {t('backupPolicies.storageLocationDesc', 'Target root folder on disk where all backup archives for this server will be saved.')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Advanced & Discord Webhook Settings */}
                    <div className="space-y-4 md:col-span-2 border-t border-slate-700/50 pt-6">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Server className="w-5 h-5 text-green-400" />
                            {t('backupPolicies.compressionDiscord', 'Compression & Discord Alert Notifications')}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-700/50 rounded-xl cursor-pointer hover:border-green-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block text-sm">{t('backupPolicies.zipCompression', 'ZIP Compression')}</span>
                                    <span className="text-xs text-slate-400">{t('backupPolicies.zipCompressionDesc', 'Compresses backup files into high-ratio .zip archives to save disk space')}</span>
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
                                    <span className="text-white font-medium block text-sm">{t('backupPolicies.cloudSyncEnable', 'Cloud Sync Enable')}</span>
                                    <span className="text-xs text-slate-400">{t('backupPolicies.cloudSyncEnableDesc', 'Automatically syncs fresh backup snapshots to Cloud Storage')}</span>
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
                                {t('backupPolicies.webhookLabel', 'Discord Backup Notification Webhook (Optional)')}
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
                                    {isTestingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : t('backupPolicies.test', 'Test')}
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
                    <p className="font-semibold text-purple-300 mb-1">{t('backupPolicies.executionActive', 'Automated Policy Execution Active')}</p>
                    <p>{t('backupPolicies.executionActiveDesc', 'The system background scheduler automatically executes backups according to the active interval, applies retention cleanup to prevent disk bloat, and triggers notifications whenever maintenance events run.')}</p>
                </div>
            </div>
        </div>
    );
}
