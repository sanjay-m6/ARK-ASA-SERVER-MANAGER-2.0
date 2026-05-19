import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Save, Clock, HardDrive, Server, Loader2, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { BackupPolicy } from '../../types';

interface BackupPoliciesProps {
    serverId: number | null;
}

export default function BackupPolicies({ serverId }: BackupPoliciesProps) {
    const { } = useTranslation();
    const [policy, setPolicy] = useState<BackupPolicy | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!serverId) return;
        
        const fetchPolicy = async () => {
            setIsLoading(true);
            try {
                const data = await invoke<BackupPolicy>('get_backup_policy', { serverId });
                setPolicy(data);
            } catch (err) {
                console.error("Failed to fetch policy:", err);
                toast.error("Failed to fetch backup policies.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPolicy();
    }, [serverId]);

    const handleSave = async () => {
        if (!policy || !serverId) return;
        
        setIsSaving(true);
        try {
            await invoke('save_backup_policy', { policy });
            toast.success("Backup policies saved successfully.");
        } catch (err) {
            console.error("Failed to save policy:", err);
            toast.error("Failed to save policies.");
        } finally {
            setIsSaving(false);
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
            <div className="glass-panel p-6 rounded-xl border border-slate-700/50">
                <div className="flex items-center justify-between mb-6 border-b border-slate-700/50 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
                            <Shield className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Automation Policies</h2>
                            <p className="text-slate-400 text-sm">Configure automated backup schedules and retention rules</p>
                        </div>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <span className="text-slate-300 font-medium">Enable Automation</span>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 opacity-100 transition-opacity" style={{ opacity: policy.enabled ? 1 : 0.5, pointerEvents: policy.enabled ? 'auto' : 'none' }}>
                    
                    {/* Schedule Settings */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Clock className="w-5 h-5 text-amber-400" />
                            Schedule Settings
                        </h3>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Backup Interval (Hours)</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="720"
                                    value={policy.intervalHours} 
                                    onChange={(e) => setPolicy({ ...policy, intervalHours: parseInt(e.target.value) || 24 })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500" 
                                />
                                <p className="text-xs text-slate-500 mt-1">How often a new automated backup should be created.</p>
                            </div>

                            <label className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block">Backup Before Update</span>
                                    <span className="text-xs text-slate-400">Trigger backup before applying server updates</span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={policy.backupBeforeUpdate}
                                    onChange={(e) => setPolicy({ ...policy, backupBeforeUpdate: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500" 
                                />
                            </label>

                            <label className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg cursor-pointer hover:border-purple-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block">Backup Before Restart</span>
                                    <span className="text-xs text-slate-400">Trigger backup before scheduled restarts</span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={policy.backupBeforeRestart}
                                    onChange={(e) => setPolicy({ ...policy, backupBeforeRestart: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500" 
                                />
                            </label>
                        </div>
                    </div>

                    {/* Retention Settings */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <HardDrive className="w-5 h-5 text-blue-400" />
                            Retention & Cleanup
                        </h3>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Max Retention Days</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    value={policy.retentionDays} 
                                    onChange={(e) => setPolicy({ ...policy, retentionDays: parseInt(e.target.value) || 7 })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500" 
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Max Backup Count</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    value={policy.retentionCount} 
                                    onChange={(e) => setPolicy({ ...policy, retentionCount: parseInt(e.target.value) || 10 })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500" 
                                />
                                <p className="text-xs text-slate-500 mt-1">Maximum number of automated backups to keep.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Storage Quota (GB)</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    step="0.5"
                                    value={policy.storageQuotaGb} 
                                    onChange={(e) => setPolicy({ ...policy, storageQuotaGb: parseFloat(e.target.value) || 50.0 })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500" 
                                />
                                <p className="text-xs text-slate-500 mt-1">Oldest backups will be deleted if this quota is exceeded.</p>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Settings */}
                    <div className="space-y-4 md:col-span-2 border-t border-slate-700/50 pt-6">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Server className="w-5 h-5 text-green-400" />
                            Advanced Options
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg cursor-pointer hover:border-green-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block">Compression Enabled</span>
                                    <span className="text-xs text-slate-400">Compress backups to save space</span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={policy.compressionEnabled}
                                    onChange={(e) => setPolicy({ ...policy, compressionEnabled: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500" 
                                />
                            </label>

                            <label className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg cursor-pointer hover:border-sky-500/50 transition-colors">
                                <div>
                                    <span className="text-white font-medium block">Cloud Sync Integration</span>
                                    <span className="text-xs text-slate-400">Automatically upload to cloud storage</span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={policy.cloudSyncEnabled}
                                    onChange={(e) => setPolicy({ ...policy, cloudSyncEnabled: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500" 
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-500/20 font-medium"
                    >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Save Policies
                    </button>
                </div>
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-200">
                    <p className="font-semibold text-blue-300 mb-1">How intelligent cleanup works:</p>
                    <p>When automated backups occur or a manual cleanup is triggered, the system evaluates all unprotected backups against your Retention Days, Count, and Quota. Any backups exceeding these limits are permanently removed to reclaim disk space. Protected backups are always skipped.</p>
                </div>
            </div>
        </div>
    );
}
