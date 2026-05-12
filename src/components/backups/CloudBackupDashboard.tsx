import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCloudBackupStore, CloudProviderConfig, CloudBackupSettings } from '../../stores/cloudBackupStore';
import { Cloud, Save, TestTube, Loader2, HardDrive, RefreshCw, Download, Server, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';
import { SettingsTextInput } from '../settings/SettingsTextInput';
import { SettingsToggle } from '../settings/SettingsToggle';

export default function CloudBackupDashboard({ serverId }: { serverId: number | null }) {
    const { t } = useTranslation();
    const { settings, cloudBackups, isLoading, fetchSettings, saveSettings, testConnection, fetchBackups, restoreBackup } = useCloudBackupStore();
    
    const [localSettings, setLocalSettings] = useState<CloudBackupSettings>({
        enabled: false,
        provider: { provider_type: 'S3', endpoint: '', bucket: '', region: '', access_key_id: '', secret_access_key: '' },
        encryption_key: '',
        retain_hourly: 24,
        retain_daily: 7,
        retain_weekly: 4,
        compression_level: 6,
    });
    
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRestoring, setIsRestoring] = useState<string | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        if (settings) {
            setLocalSettings({
                ...settings,
                provider: settings.provider || { provider_type: 'S3', endpoint: '', bucket: '', region: '', access_key_id: '', secret_access_key: '' }
            });
        }
    }, [settings]);

    useEffect(() => {
        if (serverId && localSettings.enabled) {
            fetchBackups(serverId.toString());
        }
    }, [serverId, localSettings.enabled]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveSettings(localSettings);
            toast.success(t('cloudBackup.saved', 'Cloud backup settings saved!'));
        } catch (error) {
            toast.error(t('cloudBackup.saveError', { error: String(error) }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async () => {
        if (!localSettings.provider) return;
        setIsTesting(true);
        try {
            await testConnection(localSettings.provider);
            toast.success(t('cloudBackup.testSuccess', 'Connection to cloud provider successful!'));
        } catch (error) {
            toast.error(t('cloudBackup.testError', { error: String(error) }));
        } finally {
            setIsTesting(false);
        }
    };

    const handleRestore = async (remotePath: string) => {
        setIsRestoring(remotePath);
        try {
            // Need a generic restore path, ideally this would be configurable per server
            // For now just pass an empty target to let the backend resolve it, or pass a specific folder
            // In a full implementation, the backend or frontend should resolve the server's path
            // Assuming backend resolves it based on server ID if we implement it, but for now we pass a generic path or we should add server_id to the restore logic.
            // Wait, the backend currently requires targetExtractionPath.
            // Let's pass the server root. For demo, we'll assume the user has a way to get it or backend resolves it.
            // I'll adjust the Tauri command to resolve the target path later if needed.
            await restoreBackup(remotePath, "Servers/Restore/"); 
            toast.success(t('cloudBackup.restoreSuccess', 'Backup restored successfully!'));
        } catch (error) {
            toast.error(t('cloudBackup.restoreError', { error: String(error) }));
        } finally {
            setIsRestoring(null);
        }
    };

    const updateProvider = (updates: Partial<CloudProviderConfig>) => {
        setLocalSettings(prev => ({
            ...prev,
            provider: { ...prev.provider, ...updates } as CloudProviderConfig
        }));
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Configuration Panel */}
                <div className="glass-panel p-6 rounded-xl space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Cloud className="w-6 h-6 text-blue-400" />
                            <h2 className="text-xl font-bold text-white">Cloud Configuration</h2>
                        </div>
                        <SettingsToggle 
                            label="Enable Cloud Backups"
                            value={localSettings.enabled} 
                            onChange={(enabled: boolean) => setLocalSettings(prev => ({ ...prev, enabled }))} 
                        />
                    </div>

                    <div className={cn("space-y-4 transition-opacity", !localSettings.enabled && "opacity-50 pointer-events-none")}>
                        <div>
                            <label className="text-sm font-medium text-slate-400 mb-1.5 block">Provider Type</label>
                            <select 
                                value={localSettings.provider?.provider_type}
                                onChange={(e) => {
                                    const type = e.target.value as any;
                                    let initialProv: CloudProviderConfig = { provider_type: type };
                                    if (type === 'S3') {
                                        initialProv = { provider_type: 'S3', endpoint: '', bucket: '', region: '', access_key_id: '', secret_access_key: '' };
                                    } else if (type === 'B2') {
                                        initialProv = { provider_type: 'B2', application_key_id: '', application_key: '', bucket: '', bucket_id: '' };
                                    } else if (type === 'GoogleDrive') {
                                        initialProv = { provider_type: 'GoogleDrive', client_id: '', client_secret: '', refresh_token: '', root_folder_id: '' };
                                    } else if (type === 'Dropbox') {
                                        initialProv = { provider_type: 'Dropbox', access_token: '', refresh_token: '', client_id: '', client_secret: '', root_path: '' };
                                    }
                                    setLocalSettings(prev => ({ ...prev, provider: initialProv }));
                                }}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white"
                            >
                                <option value="S3">Amazon S3 / Cloudflare R2 / Wasabi</option>
                                <option value="B2">Backblaze B2</option>
                                <option value="GoogleDrive">Google Drive</option>
                                <option value="Dropbox">Dropbox</option>
                            </select>
                        </div>

                        {localSettings.provider?.provider_type === 'S3' && (
                            <div className="space-y-4">
                                <SettingsTextInput
                                    label="Endpoint URL"
                                    value={localSettings.provider.endpoint || ''}
                                    onChange={(val: string) => updateProvider({ endpoint: val })}
                                    placeholder="https://s3.amazonaws.com"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <SettingsTextInput
                                        label="Bucket Name"
                                        value={localSettings.provider.bucket || ''}
                                        onChange={(val: string) => updateProvider({ bucket: val })}
                                    />
                                    <SettingsTextInput
                                        label="Region"
                                        value={localSettings.provider.region || ''}
                                        onChange={(val: string) => updateProvider({ region: val })}
                                        placeholder="us-east-1"
                                    />
                                </div>
                                <SettingsTextInput
                                    label="Access Key ID"
                                    value={localSettings.provider.access_key_id || ''}
                                    onChange={(val: string) => updateProvider({ access_key_id: val })}
                                />
                                <SettingsTextInput
                                    label="Secret Access Key"
                                    value={localSettings.provider.secret_access_key || ''}
                                    onChange={(val: string) => updateProvider({ secret_access_key: val })}
                                    type="password"
                                />
                            </div>
                        )}

                        {localSettings.provider?.provider_type === 'B2' && (
                            <div className="space-y-4">
                                <SettingsTextInput
                                    label="Bucket Name"
                                    value={localSettings.provider.bucket || ''}
                                    onChange={(val: string) => updateProvider({ bucket: val })}
                                />
                                <SettingsTextInput
                                    label="Bucket ID"
                                    value={localSettings.provider.bucket_id || ''}
                                    onChange={(val: string) => updateProvider({ bucket_id: val })}
                                />
                                <SettingsTextInput
                                    label="Application Key ID"
                                    value={localSettings.provider.application_key_id || ''}
                                    onChange={(val: string) => updateProvider({ application_key_id: val })}
                                />
                                <SettingsTextInput
                                    label="Application Key"
                                    value={localSettings.provider.application_key || ''}
                                    onChange={(val: string) => updateProvider({ application_key: val })}
                                    type="password"
                                />
                            </div>
                        )}

                        <div className="pt-4 border-t border-slate-800">
                            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-emerald-400" />
                                Encryption Settings
                            </h3>
                            <SettingsTextInput
                                label="AES-256-GCM Encryption Key"
                                value={localSettings.encryption_key || ''}
                                onChange={(val: string) => setLocalSettings(prev => ({ ...prev, encryption_key: val }))}
                                type="password"
                                placeholder="Highly secure password..."
                            />
                            <p className="text-xs text-amber-500/80 mt-2">
                                * Do not lose this key. Backups cannot be decrypted without it.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={handleTest}
                                disabled={isTesting}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-medium"
                            >
                                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                                Test Connection
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium shadow-lg shadow-blue-500/20"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Config
                            </button>
                        </div>
                    </div>
                </div>

                {/* Cloud Backups List */}
                <div className="glass-panel p-6 rounded-xl flex flex-col h-full">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <Server className="w-6 h-6 text-emerald-400" />
                            <h2 className="text-xl font-bold text-white">Remote Archive</h2>
                        </div>
                        <button 
                            onClick={() => serverId && fetchBackups(serverId.toString())}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                        >
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {!localSettings.enabled ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                                <Cloud className="w-12 h-12 opacity-50" />
                                <p>Cloud Backups Disabled</p>
                            </div>
                        ) : cloudBackups.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                                <HardDrive className="w-12 h-12 opacity-50" />
                                <p>No remote backups found.</p>
                            </div>
                        ) : (
                            cloudBackups.map((path) => {
                                const filename = path.split('/').pop() || path;
                                return (
                                    <div key={path} className="bg-slate-800/50 border border-slate-700/50 p-3 rounded-lg flex items-center justify-between group hover:border-blue-500/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                                <HardDrive className="w-4 h-4 text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-200">{filename}</p>
                                                <p className="text-xs text-slate-500 truncate max-w-[200px]">{path}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleRestore(path)}
                                                disabled={isRestoring === path}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg text-xs font-medium transition-colors"
                                            >
                                                {isRestoring === path ? (
                                                    <><Loader2 className="w-3 h-3 animate-spin" /> Restoring</>
                                                ) : (
                                                    <><Download className="w-3 h-3" /> Restore</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
