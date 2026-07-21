import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Database as BackupIcon, Plus, RotateCcw, Trash2, Loader2, FileArchive,
    Calendar, Clock, HardDrive, CheckCircle, XCircle, Eye, Shield,
    Settings, ChevronDown, ChevronUp, FolderOpen, Sparkles, LayoutList, GitBranch, Cloud
} from 'lucide-react';
import { formatBytes, cn } from '../utils/helpers';
import { invoke } from '@tauri-apps/api/core';
import { Backup } from '../types';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { getAllServers } from '../utils/tauri';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import CloudBackupDashboard from '../components/backups/CloudBackupDashboard';
import BackupPolicies from '../components/backups/BackupPolicies';


interface BackupOptions {
    includeConfigs: boolean;
    includeSaves: boolean;
    includeMods: boolean;
    compress: boolean;
}

export default function Backups() {
    const { t } = useTranslation();
    const [backups, setBackups] = useState<Backup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const { servers, setServers, activeServer } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);

    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        }
    }, [activeServer]);
    const [showOptions, setShowOptions] = useState(false);
    const [previewBackupId, setPreviewBackupId] = useState<number | null>(null);
    const [previewContents, setPreviewContents] = useState<string[]>([]);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [backupOptions, setBackupOptions] = useState<BackupOptions>({
        includeConfigs: true,
        includeSaves: true,
        includeMods: false,
        compress: true,
    });

    // View mode: list or timeline
    const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
    
    // Tab state
    const [activeTab, setActiveTab] = useState<'dashboard' | 'browser' | 'policies' | 'cloud'>('dashboard');

    // Auto backup header state
    const [isAutoEnabled, setIsAutoEnabled] = useState(false);
    const [autoInterval, setAutoInterval] = useState(6);
    const [showAutoMenu, setShowAutoMenu] = useState(false);

    useEffect(() => {
        if (selectedServerId) {
            invoke<any>('get_backup_policy', { serverId: selectedServerId })
                .then((p) => {
                    setIsAutoEnabled(p.enabled);
                    setAutoInterval(p.intervalHours || 6);
                })
                .catch(() => {});
        }
    }, [selectedServerId]);

    const handleToggleAutoBackup = async (enabled: boolean, intervalHours?: number) => {
        if (!selectedServerId) return;
        try {
            const currentPolicy = await invoke<any>('get_backup_policy', { serverId: selectedServerId });
            const updated = {
                ...currentPolicy,
                enabled,
                intervalHours: intervalHours ?? currentPolicy.intervalHours ?? 6,
            };
            await invoke('save_backup_policy', { policy: updated });
            setIsAutoEnabled(enabled);
            if (intervalHours) setAutoInterval(intervalHours);
            toast.success(enabled ? `Auto Backup Enabled (${intervalHours ?? updated.intervalHours}h interval)` : 'Auto Backup Disabled');
        } catch (err) {
            toast.error('Failed to update Auto Backup policy');
        }
    };

    // Styled confirm dialog state
    const [confirmState, setConfirmState] = useState<{
        action: 'restore' | 'delete' | 'cleanup' | null;
        backupId?: number;
    }>({ action: null });
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isConfirmLoading, setIsConfirmLoading] = useState(false);

    // Load servers
    useEffect(() => {
        getAllServers().then(setServers).catch(console.error);
    }, [setServers]);

    // Select active server by default
    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        } else if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, activeServer, selectedServerId]);

    const fetchBackups = async () => {
        if (!selectedServerId) return;

        setIsLoading(true);
        try {
            const data = await invoke<Backup[]>('get_backups', { serverId: selectedServerId });
            setBackups(data);
        } catch (error) {
            console.error('Failed to fetch backups:', error);
            toast.error(t('backups.fetchFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, [selectedServerId]);

    const handleCreateBackup = async () => {
        if (!selectedServerId) return;

        setIsCreating(true);
        try {
            await invoke('create_backup', {
                serverId: selectedServerId,
                backupType: 'manual',
                options: {
                    includeConfigs: backupOptions.includeConfigs,
                    includeSaves: backupOptions.includeSaves,
                    includeMods: backupOptions.includeMods,
                    includeCluster: false,
                    compressionLevel: backupOptions.compress ? 6 : 0,
                }
            });
            toast.success(t('backups.backupCreated'));
            fetchBackups();
            setShowOptions(false);
        } catch (error) {
            console.error('Failed to create backup:', error);
            toast.error(t('backups.createFailed'));
        } finally {
            setIsCreating(false);
        }
    };

    const handleRestoreBackup = async (backupId: number) => {
        setIsConfirmLoading(true);
        try {
            await invoke('restore_backup', { backupId });
            toast.success(t('backups.restoreSuccess'));
            fetchBackups();
        } catch (error) {
            console.error('Failed to restore backup:', error);
            toast.error(t('backups.restoreFailed'));
        } finally {
            setIsConfirmLoading(false);
            setIsConfirmOpen(false);
            setConfirmState({ action: null });
        }
    };

    const handleDeleteBackup = async (backupId: number) => {
        setIsConfirmLoading(true);
        try {
            await invoke('delete_backup', { backupId });
            toast.success(t('backups.deleteSuccess'));
            fetchBackups();
        } catch (error) {
            console.error('Failed to delete backup:', error);
            toast.error(t('backups.deleteFailed'));
        } finally {
            setIsConfirmLoading(false);
            setIsConfirmOpen(false);
            setConfirmState({ action: null });
        }
    };

    const handleCleanupBackups = async () => {
        if (!selectedServerId) return;

        setIsConfirmLoading(true);
        try {
            await invoke('cleanup_old_backups', { serverId: selectedServerId });
            toast.success(t('backups.cleanupSuccess', 'Old backups cleaned up successfully!'));
            fetchBackups();
        } catch (error) {
            console.error('Failed to cleanup backups:', error);
            toast.error(t('backups.cleanupFailed', 'Failed to cleanup old backups'));
        } finally {
            setIsConfirmLoading(false);
            setIsConfirmOpen(false);
            setConfirmState({ action: null });
        }
    };

    const handleRestore = (backupId: number) => {
        setConfirmState({ action: 'restore', backupId });
        setIsConfirmOpen(true);
    };

    const handleDelete = (backupId: number) => {
        setConfirmState({ action: 'delete', backupId });
        setIsConfirmOpen(true);
    };

    const handleCleanup = () => {
        setConfirmState({ action: 'cleanup' });
        setIsConfirmOpen(true);
    };

    const handlePreview = async (backupId: number) => {
        if (previewBackupId === backupId) {
            setPreviewBackupId(null);
            return;
        }
        setPreviewBackupId(backupId);
        setLoadingPreview(true);
        try {
            const files = await invoke<string[]>('get_backup_contents', { backupId });
            setPreviewContents(files);
        } catch (error) {
            console.error('Failed to get backup contents:', error);
            toast.error(t('backups.previewFailed', 'Failed to read backup contents'));
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleVerify = async (backupId: number) => {
        const loadingToast = toast.loading(t('backups.verifying', 'Verifying backup integrity...'));
        try {
            const verified = await invoke<boolean>('verify_backup', { backupId });
            toast.dismiss(loadingToast);
            if (verified) {
                toast.success(t('backups.verifySuccess', 'Backup integrity verified successfully!'));
                fetchBackups();
            } else {
                toast.error(t('backups.verifyFailed', 'Backup verification failed or corrupted.'));
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            console.error('Failed to verify backup:', error);
            toast.error(t('backups.verifyError', 'Failed to run backup verification'));
        }
    };

    const handleConfirmAction = () => {
        if (confirmState.action === 'restore' && confirmState.backupId !== undefined) {
            handleRestoreBackup(confirmState.backupId);
        } else if (confirmState.action === 'delete' && confirmState.backupId !== undefined) {
            handleDeleteBackup(confirmState.backupId);
        } else if (confirmState.action === 'cleanup') {
            handleCleanupBackups();
        }
    };

    // Calculate stats
    const totalSize = backups.reduce((acc, b) => acc + (b.size || 0), 0);
    const lastBackup = backups.length > 0 ? backups[0] : null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pb-6 border-b border-white/5 mb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/20 text-amber-400 flex-shrink-0 shadow-lg shadow-amber-500/5">
                        <BackupIcon className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white font-display uppercase bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500">
                            {t('backups.title')}
                        </h1>
                        <p className="text-slate-400 mt-1 text-sm font-medium tracking-wide">{t('backups.subtitle')}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    {/* Navigation Tabs */}
                    <div className="flex bg-[#0A0F1C]/80 p-1.5 rounded-2xl border border-white/5 shadow-inner backdrop-blur-xl flex-shrink-0">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0",
                                activeTab === 'dashboard' 
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]" 
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <LayoutList className="w-3.5 h-3.5" />
                            Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab('browser')}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0",
                                activeTab === 'browser' 
                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]" 
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <HardDrive className="w-3.5 h-3.5" />
                            Browser
                        </button>
                        <button
                            onClick={() => setActiveTab('policies')}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0",
                                activeTab === 'policies' 
                                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]" 
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <Shield className="w-3.5 h-3.5" />
                            Policies
                        </button>
                        <button
                            onClick={() => setActiveTab('cloud')}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0",
                                activeTab === 'cloud' 
                                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.2)]" 
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <Cloud className="w-3.5 h-3.5" />
                            Cloud Sync
                        </button>
                    </div>

                    {/* Controls Container */}
                    <div className="flex items-center gap-3 flex-shrink-0">

                        {/* Quick Auto Backup Button */}
                        <div className="relative flex-shrink-0">
                            <button
                                onClick={() => setShowAutoMenu(!showAutoMenu)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2.5 rounded-2xl transition-all font-black text-xs uppercase tracking-wider h-[42px] border flex-shrink-0 whitespace-nowrap shadow-lg",
                                    isAutoEnabled
                                        ? "bg-purple-600/30 text-purple-200 border-purple-500/50 shadow-purple-500/20 hover:bg-purple-600/40"
                                        : "bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white hover:border-slate-600"
                                )}
                            >
                                <Sparkles className={cn("w-4 h-4", isAutoEnabled ? "text-purple-400 animate-pulse" : "text-slate-500")} />
                                <span>{isAutoEnabled ? `Auto: ON (${autoInterval}h)` : 'Auto Backup: OFF'}</span>
                                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAutoMenu && "rotate-180")} />
                            </button>

                            {/* Quick Auto Backup Dropdown */}
                            {showAutoMenu && (
                                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-3 space-y-2">
                                    <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800">
                                        <span className="text-xs font-bold text-white uppercase tracking-wider">Automated Backup</span>
                                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", isAutoEnabled ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-slate-800 text-slate-400 border-slate-700")}>
                                            {isAutoEnabled ? 'ACTIVE' : 'DISABLED'}
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => {
                                            handleToggleAutoBackup(!isAutoEnabled);
                                            setShowAutoMenu(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all border",
                                            isAutoEnabled
                                                ? "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25"
                                                : "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/20 hover:bg-purple-500"
                                        )}
                                    >
                                        <span>{isAutoEnabled ? 'Disable Auto Backup' : '⚡ Enable Auto Backup Now'}</span>
                                    </button>

                                    <div className="pt-1 border-t border-slate-800 space-y-1">
                                        <span className="text-[10px] font-semibold text-slate-400 px-2 uppercase tracking-wider block">Quick Presets</span>
                                        <button
                                            onClick={() => {
                                                handleToggleAutoBackup(true, 1);
                                                setShowAutoMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between"
                                        >
                                            <span>⚡ High Protection</span>
                                            <span className="text-[10px] text-slate-400">1 Hour</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleToggleAutoBackup(true, 6);
                                                setShowAutoMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between"
                                        >
                                            <span>🛡️ Balanced</span>
                                            <span className="text-[10px] text-slate-400">6 Hours</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleToggleAutoBackup(true, 24);
                                                setShowAutoMenu(false);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between"
                                        >
                                            <span>💾 Storage Saver</span>
                                            <span className="text-[10px] text-slate-400">24 Hours</span>
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setActiveTab('policies');
                                            setShowAutoMenu(false);
                                        }}
                                        className="w-full text-center py-2 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors border-t border-slate-800 pt-2 block"
                                    >
                                        Configure Full Policies →
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="relative flex-shrink-0">
                            <button
                                onClick={() => setShowOptions(!showOptions)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-2xl transition-all shadow-lg shadow-amber-500/20 font-black text-xs uppercase tracking-wider h-[42px] flex-shrink-0 whitespace-nowrap"
                            >
                                <Plus className="w-4 h-4" />
                                <span>{t('backups.createBackup')}</span>
                                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showOptions && "rotate-180")} />
                            </button>

                            {/* Options Dropdown */}
                            {showOptions && (
                                <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="p-4 border-b border-slate-800 bg-slate-900/90">
                                        <h4 className="font-semibold text-white flex items-center gap-2">
                                            <Settings className="w-4 h-4" />
                                            {t('backups.options')}
                                        </h4>
                                    </div>
                                    <div className="p-4 space-y-3 bg-slate-900/95">
                                        <label className="flex items-center justify-between cursor-pointer">
                                            <span className="text-slate-300 text-sm font-medium">{t('backups.includeConfigs')}</span>
                                            <input
                                                type="checkbox"
                                                checked={backupOptions.includeConfigs}
                                                onChange={(e) => setBackupOptions({ ...backupOptions, includeConfigs: e.target.checked })}
                                                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                            />
                                        </label>
                                        <label className="flex items-center justify-between cursor-pointer">
                                            <span className="text-slate-300 text-sm font-medium">{t('backups.includeSaves')}</span>
                                            <input
                                                type="checkbox"
                                                checked={backupOptions.includeSaves}
                                                onChange={(e) => setBackupOptions({ ...backupOptions, includeSaves: e.target.checked })}
                                                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                            />
                                        </label>
                                        <label className="flex items-center justify-between cursor-pointer">
                                            <span className="text-slate-300 text-sm font-medium">{t('backups.includeMods')}</span>
                                            <input
                                                type="checkbox"
                                                checked={backupOptions.includeMods}
                                                onChange={(e) => setBackupOptions({ ...backupOptions, includeMods: e.target.checked })}
                                                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                            />
                                        </label>
                                        <label className="flex items-center justify-between cursor-pointer">
                                            <span className="text-slate-300 text-sm font-medium">{t('backups.compress')}</span>
                                            <input
                                                type="checkbox"
                                                checked={backupOptions.compress}
                                                onChange={(e) => setBackupOptions({ ...backupOptions, compress: e.target.checked })}
                                                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                            />
                                        </label>
                                    </div>
                                    <div className="p-4 border-t border-slate-800 bg-slate-800/30">
                                        <button
                                            onClick={handleCreateBackup}
                                            disabled={isCreating}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-xl transition-all font-bold text-xs uppercase tracking-wider"
                                        >
                                            {isCreating ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> {t('backups.creating')}</>
                                            ) : (
                                                <><Sparkles className="w-4 h-4" /> {t('backups.createNow')}</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                        <FileArchive className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">{t('backups.totalBackups')}</p>
                        <p className="text-2xl font-bold text-white">{backups.length}</p>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <HardDrive className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">{t('backups.storageUsed')}</p>
                        <p className="text-2xl font-bold text-white">{formatBytes(totalSize)}</p>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                        <Clock className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">{t('backups.lastBackup')}</p>
                        <p className="text-lg font-bold text-white">
                            {lastBackup ? new Date(lastBackup.createdAt).toLocaleDateString() : t('common.never', 'Never')}
                        </p>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                    <button
                        onClick={handleCleanup}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-5 h-5" />
                        <span>{t('backups.cleanupOld')}</span>
                    </button>
                </div>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setViewMode('list')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                        viewMode === 'list'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'
                    )}
                >
                    <LayoutList className="w-4 h-4" />
                    {t('backups.listView', 'List View')}
                </button>
                <button
                    onClick={() => setViewMode('timeline')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                        viewMode === 'timeline'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'
                    )}
                >
                    <GitBranch className="w-4 h-4" />
                    {t('backups.timelineView', 'Timeline')}
                </button>
            </div>

            {activeTab === 'cloud' && <CloudBackupDashboard serverId={selectedServerId} />}
            {activeTab === 'policies' && <BackupPolicies serverId={selectedServerId} />}
            {(activeTab === 'dashboard' || activeTab === 'browser') && (
                <>
                {/* Backup List */}
                <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                    </div>
                ) : backups.length === 0 ? (
                    <div className="text-center py-12 px-6 glass-panel rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-purple-950/20">
                        <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center border border-purple-500/30 mx-auto mb-4 shadow-lg shadow-purple-500/10">
                            <Shield className="w-8 h-8 text-purple-400" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">{t('backups.noBackups', 'No backups found')}</h3>
                        <p className="text-slate-400 max-w-md mx-auto mb-6 text-sm">
                            Protect your server saves, player data, and map progress with automated backup schedules & instant restore points.
                        </p>

                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                                onClick={handleCreateBackup}
                                disabled={isCreating}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold rounded-xl shadow-lg shadow-amber-500/20 transition-all text-sm"
                            >
                                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Create First Backup
                            </button>
                            
                            <button
                                onClick={() => setActiveTab('policies')}
                                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 font-semibold rounded-xl border border-purple-500/40 transition-all text-sm"
                            >
                                <Settings className="w-4 h-4 text-purple-400" />
                                Setup Automated Policy Presets
                            </button>
                        </div>
                    </div>
                ) : viewMode === 'timeline' ? (
                    /* ================= TIMELINE VIEW (B1) ================= */
                    <div className="relative">
                        {/* Timeline spine */}
                        <div className="absolute left-[22px] top-6 bottom-6 w-1 bg-gradient-to-b from-amber-500 via-orange-500/50 to-amber-500/10 rounded-full z-0 shadow-[0_0_10px_rgba(245,158,11,0.3)]" />

                        {(() => {
                            // Group backups by date
                            const grouped: Record<string, Backup[]> = {};
                            for (const b of backups) {
                                const dateKey = new Date(b.createdAt).toLocaleDateString();
                                if (!grouped[dateKey]) grouped[dateKey] = [];
                                grouped[dateKey].push(b);
                            }
                            return Object.entries(grouped).map(([date, dayBackups]) => {
                                const dayTotalSize = dayBackups.reduce((acc, curr) => acc + curr.size, 0);
                                return (
                                <div key={date} className="mb-10 relative">
                                    {/* Date header */}
                                    <div className="flex items-center gap-4 mb-5 relative z-10">
                                        <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center border-2 border-slate-900 shadow-xl shadow-amber-500/20 shrink-0">
                                            <Calendar className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="glass-panel px-4 py-2 rounded-xl border border-slate-700/60 flex items-center gap-4">
                                            <div>
                                                <p className="text-white font-bold text-lg leading-none">{date}</p>
                                                <p className="text-slate-400 text-xs mt-1 font-medium">{dayBackups.length} snapshot{dayBackups.length !== 1 ? 's' : ''}</p>
                                            </div>
                                            <div className="h-6 w-px bg-slate-700" />
                                            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20">
                                                {formatBytes(dayTotalSize)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Day's backups */}
                                    <div className="ml-14 space-y-4">
                                        {dayBackups.map((backup) => {
                                            const isManual = backup.backupType === 'manual';
                                            const isAuto = backup.backupType === 'auto';
                                            return (
                                                <div key={backup.id} className="relative group">
                                                    {/* Timeline dot */}
                                                    <div className={cn(
                                                        "absolute -left-[40px] top-6 w-4 h-4 rounded-full border-2 border-slate-950 shadow-md transition-transform group-hover:scale-125 z-10",
                                                        isManual ? 'bg-amber-500 shadow-amber-500/50' : isAuto ? 'bg-sky-500 shadow-sky-500/50' : 'bg-emerald-500 shadow-emerald-500/50'
                                                    )} />

                                                    <div className="glass-panel rounded-2xl p-5 border border-slate-700/60 hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/5 transition-all bg-slate-900/70">
                                                        <div className="flex flex-wrap items-center justify-between gap-4">
                                                            <div className="flex items-center gap-4">
                                                                <div className={cn(
                                                                    "px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border shadow-sm",
                                                                    isManual
                                                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                                                        : isAuto
                                                                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                                                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                                )}>
                                                                    <Sparkles className="w-3.5 h-3.5" />
                                                                    {backup.backupType}
                                                                </div>

                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <h4 className="font-bold text-white text-base">
                                                                            {isManual ? 'Manual Server Snapshot' : 'Automated Scheduled Backup'}
                                                                        </h4>
                                                                        {backup.verified && (
                                                                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                                                                <CheckCircle className="w-3.5 h-3.5" /> Verified
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                                                                        <span className="flex items-center gap-1 text-slate-300">
                                                                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                                                                            {new Date(backup.createdAt).toLocaleTimeString()}
                                                                        </span>
                                                                        <span>•</span>
                                                                        <span className="flex items-center gap-1 text-slate-200 font-semibold bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                                                            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                                                                            {formatBytes(backup.size)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Action buttons (Always visible for fast response) */}
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => handlePreview(backup.id)}
                                                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-all text-xs flex items-center gap-1.5 font-medium"
                                                                    title={t('backups.preview')}
                                                                >
                                                                    <Eye className="w-4 h-4 text-slate-400" />
                                                                    <span className="hidden sm:inline">Preview</span>
                                                                </button>
                                                                
                                                                <button
                                                                    onClick={() => handleVerify(backup.id)}
                                                                    className="p-2 bg-slate-800 hover:bg-blue-500/20 hover:text-blue-300 text-slate-300 rounded-xl border border-slate-700 transition-all text-xs flex items-center gap-1.5 font-medium"
                                                                    title={t('backups.verify')}
                                                                >
                                                                    <Shield className="w-4 h-4 text-blue-400" />
                                                                    <span className="hidden sm:inline">Verify</span>
                                                                </button>

                                                                <button
                                                                    onClick={() => handleRestore(backup.id)}
                                                                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-emerald-500/20 transition-all"
                                                                >
                                                                    <RotateCcw className="w-4 h-4" />
                                                                    <span>{t('backups.restoreBackup', 'Restore')}</span>
                                                                </button>

                                                                <button
                                                                    onClick={() => handleDelete(backup.id)}
                                                                    className="p-2 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 rounded-xl border border-slate-700 transition-all"
                                                                    title="Delete Backup"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Content scope tags */}
                                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/80">
                                                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Targets:</span>
                                                            {backup.includesConfigs && <span className="px-2.5 py-0.5 bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-bold rounded-md tracking-wider">CONFIGS</span>}
                                                            {backup.includesSaves && <span className="px-2.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold rounded-md tracking-wider">SAVES</span>}
                                                            {backup.includesMods && <span className="px-2.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] font-bold rounded-md tracking-wider">MODS</span>}
                                                            {backup.includesCluster && <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-md tracking-wider">CLUSTER</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                            });
                        })()}
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {backups.map((backup) => (
                            <div
                                key={backup.id}
                                className="glass-panel rounded-2xl p-5 hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/5 transition-all bg-slate-900/70 border border-slate-700/60"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center border border-amber-500/30 shadow-md">
                                            <BackupIcon className="w-6 h-6 text-amber-400" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-bold text-white text-base capitalize">{backup.backupType === 'manual' ? t('backups.manual') : t('backups.auto')} Server Backup</h3>
                                                {backup.verified ? (
                                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                                        <CheckCircle className="w-3.5 h-3.5" /> Verified
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                                                        <XCircle className="w-3.5 h-3.5" /> Unverified
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                                    {new Date(backup.createdAt).toLocaleDateString()}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                                                    {new Date(backup.createdAt).toLocaleTimeString()}
                                                </span>
                                                <span className="flex items-center gap-1 text-slate-200 font-semibold bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                                    <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                                                    {formatBytes(backup.size)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons (Always visible) */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handlePreview(backup.id)}
                                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-all text-xs flex items-center gap-1.5 font-medium"
                                            title={t('backups.preview')}
                                        >
                                            <Eye className="w-4 h-4 text-slate-400" />
                                            <span className="hidden sm:inline">Preview</span>
                                        </button>
                                        
                                        <button
                                            onClick={() => handleVerify(backup.id)}
                                            className="p-2 bg-slate-800 hover:bg-blue-500/20 hover:text-blue-300 text-slate-300 rounded-xl border border-slate-700 transition-all text-xs flex items-center gap-1.5 font-medium"
                                            title={t('backups.verify')}
                                        >
                                            <Shield className="w-4 h-4 text-blue-400" />
                                            <span className="hidden sm:inline">Verify</span>
                                        </button>

                                        <button
                                            onClick={() => handleRestore(backup.id)}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-emerald-500/20 transition-all"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            <span>{t('backups.restoreBackup', 'Restore')}</span>
                                        </button>

                                        <button
                                            onClick={() => handleDelete(backup.id)}
                                            className="p-2 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 rounded-xl border border-slate-700 transition-all"
                                            title="Delete Backup"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Preview Panel */}
                                {previewBackupId === backup.id && (
                                    <div className="mt-4 pt-4 border-t border-slate-800">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-semibold text-slate-300 flex items-center gap-2">
                                                <FolderOpen className="w-4 h-4" />
                                                {t('backups.contents')}
                                            </h4>
                                            <button
                                                onClick={() => setPreviewBackupId(null)}
                                                className="text-slate-500 hover:text-slate-300"
                                            >
                                                <ChevronUp className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {loadingPreview ? (
                                            <div className="flex items-center gap-2 text-slate-400 py-4">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t('common.loading', 'Loading...')}
                                            </div>
                                        ) : (
                                            <div className="bg-slate-950 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs">
                                                {previewContents.length === 0 ? (
                                                    <p className="text-slate-500">{t('backups.noFiles')}</p>
                                                ) : (
                                                    previewContents.slice(0, 50).map((file, idx) => (
                                                        <div key={idx} className="text-slate-400 py-0.5 hover:text-slate-200">
                                                            {file}
                                                        </div>
                                                    ))
                                                )}
                                                {previewContents.length > 50 && (
                                                    <p className="text-slate-500 mt-2">{t('backups.moreFiles', { count: previewContents.length - 50 })}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            </>
            )}
            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => {
                    if (isConfirmLoading) return;
                    setIsConfirmOpen(false);
                    setConfirmState({ action: null });
                }}
                onConfirm={handleConfirmAction}
                isLoading={isConfirmLoading}
                title={
                    confirmState.action === 'delete'
                        ? t('backups.confirmDeleteTitle', 'Delete backup?')
                        : confirmState.action === 'restore'
                            ? t('backups.confirmRestoreTitle', 'Restore backup?')
                            : t('backups.confirmCleanupTitle', 'Clean old backups?')
                }
                message={
                    confirmState.action === 'delete'
                        ? t('backups.confirmDeleteMsg')
                        : confirmState.action === 'restore'
                            ? t('backups.confirmRestoreMsg')
                            : t('backups.confirmCleanup')
                }
                confirmText={
                    confirmState.action === 'delete'
                        ? t('backups.deleteNow', 'Delete')
                        : confirmState.action === 'restore'
                            ? t('backups.restoreNow', 'Restore')
                            : t('backups.cleanupNow', 'Clean')
                }
                variant={
                    confirmState.action === 'restore'
                        ? 'warning'
                        : 'danger'
                }
            />
        </div>
    );
}
