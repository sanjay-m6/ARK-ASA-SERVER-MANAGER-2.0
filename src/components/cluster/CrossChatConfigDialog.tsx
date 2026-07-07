import { useState, useEffect } from 'react';
import { X, Database, Settings, ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Cluster } from '../../types';
import {
    getClusterCrossChatConfig,
    saveClusterCrossChatConfig,
    toggleClusterCrossChat,
    getClusterCrossChatStatus,
    ClusterCrossChatConfig
} from '../../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface CrossChatConfigDialogProps {
    isOpen: boolean;
    cluster: Cluster;
    onClose: () => void;
    onSaved: (enabled: boolean) => void;
}

export default function CrossChatConfigDialog({
    isOpen,
    cluster,
    onClose,
    onSaved,
}: CrossChatConfigDialogProps) {
    const { t } = useTranslation();
    const [isEnabled, setIsEnabled] = useState(false);
    const [config, setConfig] = useState<ClusterCrossChatConfig>({
        host: 'localhost',
        user: 'root',
        pass: '',
        dbName: 'test',
        port: 3306,
        fetchInterval: 0.25,
        debug: false,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && cluster) {
            const loadConfig = async () => {
                setIsLoading(true);
                try {
                    const status = await getClusterCrossChatStatus(cluster.id);
                    setIsEnabled(status);

                    const data = await getClusterCrossChatConfig(cluster.id);
                    setConfig(data);
                } catch (error) {
                    console.error('Failed to load cross-chat configuration:', error);
                    toast.error(t('clusterManager.loadConfigFailed', 'Failed to load configuration'));
                } finally {
                    setIsLoading(false);
                }
            };
            loadConfig();
        }
    }, [isOpen, cluster]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!config.host.trim()) {
            toast.error(t('clusterManager.hostRequired', 'Database Host is required'));
            return;
        }
        if (!config.user.trim()) {
            toast.error(t('clusterManager.userRequired', 'Database User is required'));
            return;
        }
        if (!config.dbName.trim()) {
            toast.error(t('clusterManager.dbNameRequired', 'Database Name is required'));
            return;
        }
        if (config.port <= 0) {
            toast.error(t('clusterManager.portRequired', 'Valid Database Port is required'));
            return;
        }

        setIsSaving(true);
        try {
            // 1. Save settings to DB & generate config.json files
            await saveClusterCrossChatConfig(cluster.id, config);
            
            // 2. Enable/disable plugin status in manager settings
            await toggleClusterCrossChat(cluster.id, isEnabled);

            toast.success(t('clusterManager.crossChatConfigSaved', 'Cross-chat settings saved and synced successfully!'));
            onSaved(isEnabled);
            onClose();
        } catch (error) {
            console.error('Failed to save cross-chat configuration:', error);
            toast.error(t('clusterManager.saveConfigFailed', 'Failed to save configuration'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                        <Database className="w-5 h-5 text-violet-400" />
                        <h2 className="text-lg font-semibold text-slate-100">
                            {t('clusterManager.crossChatSettings', 'Cross-Server Chat Settings')}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-12 space-y-4">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                        <span className="text-sm text-slate-400">
                            {t('common.loading', 'Loading configuration...')}
                        </span>
                    </div>
                ) : (
                    <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                        {/* Status Toggle */}
                        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800">
                            <div>
                                <h3 className="font-semibold text-slate-200 text-sm">
                                    {t('clusterManager.enableCrossChat', 'Enable Cross-Server Chat')}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {t('clusterManager.crossChatDesc', 'Relay global chat messages across servers in this cluster')}
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={(e) => setIsEnabled(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                            </label>
                        </div>

                        {/* Connection Warning */}
                        {isEnabled && (
                            <div className="flex items-start space-x-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs leading-relaxed">
                                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>
                                    {t('clusterManager.dbWarning', 'Ensure the database parameters below are accurate. Incorrect database settings will prevent the server plugin from initializing correctly.')}
                                </span>
                            </div>
                        )}

                        {/* Form Fields */}
                        <div className={cn("space-y-4 transition-opacity duration-200", !isEnabled && "opacity-40 pointer-events-none")}>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5" />
                                {t('clusterManager.databaseSettings', 'MySQL / MariaDB Connection')}
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">
                                        {t('clusterManager.dbHost', 'Database Host')}
                                    </label>
                                    <input
                                        type="text"
                                        value={config.host}
                                        onChange={(e) => setConfig({ ...config, host: e.target.value })}
                                        placeholder="localhost"
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">
                                        {t('clusterManager.dbPort', 'Database Port')}
                                    </label>
                                    <input
                                        type="number"
                                        value={config.port}
                                        onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 3306 })}
                                        placeholder="3306"
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-violet-500 transition-colors"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">
                                        {t('clusterManager.dbUser', 'Database User')}
                                    </label>
                                    <input
                                        type="text"
                                        value={config.user}
                                        onChange={(e) => setConfig({ ...config, user: e.target.value })}
                                        placeholder="root"
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-violet-500 transition-colors"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">
                                        {t('clusterManager.dbPass', 'Database Password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={config.pass}
                                        onChange={(e) => setConfig({ ...config, pass: e.target.value })}
                                        placeholder="••••••••"
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-violet-500 transition-colors"
                                    />
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-medium text-slate-400">
                                        {t('clusterManager.dbName', 'Database Name')}
                                    </label>
                                    <input
                                        type="text"
                                        value={config.dbName}
                                        onChange={(e) => setConfig({ ...config, dbName: e.target.value })}
                                        placeholder="test"
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-violet-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <hr className="border-slate-800 my-4" />

                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Settings className="w-3.5 h-3.5" />
                                {t('clusterManager.syncSettings', 'Sync & Debug Parameters')}
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">
                                        {t('clusterManager.fetchInterval', 'Fetch Chat Interval (Seconds)')}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.05"
                                        value={config.fetchInterval}
                                        onChange={(e) => setConfig({ ...config, fetchInterval: parseFloat(e.target.value) || 0.25 })}
                                        placeholder="0.25"
                                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-violet-500 transition-colors"
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 mt-5">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium text-slate-300">
                                            {t('clusterManager.debugMode', 'Debug Mode')}
                                        </span>
                                        <span className="text-[10px] text-slate-500 mt-0.5">
                                            {t('clusterManager.debugDesc', 'Enable verbose server logging')}
                                        </span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.debug}
                                            onChange={(e) => setConfig({ ...config, debug: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-slate-950 border-t border-slate-800">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 rounded-lg border border-slate-800 hover:bg-slate-800/50 disabled:opacity-50 transition-all"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="flex items-center space-x-1.5 px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 active:bg-violet-700 rounded-lg disabled:opacity-50 transition-all shadow-lg shadow-violet-600/20"
                    >
                        {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{t('common.save', 'Save')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
