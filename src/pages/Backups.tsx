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
    const { servers, setServers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
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
    const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');

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

    // Select first server by default
    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

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
            toast.error(t('backups.createFailed', { error: String(error) }));
        } finally {
            setIsCreating(false);
        }
    };

    const handleRestore = (id: number) => {
        setConfirmState({ action: 'restore', backupId: id });
        setIsConfirmOpen(true);
    };

    const handleDelete = (id: number) => {
        setConfirmState({ action: 'delete', backupId: id });
        setIsConfirmOpen(true);
    };

    const handleVerify = async (id: number) => {
        try {
            const isValid = await invoke<boolean>('verify_backup', { backupId: id });
            if (isValid) {
                toast.success(t('backups.verifySuccess'));
            } else {
                toast.error(t('backups.verifyFailed'));
            }
            fetchBackups();
        } catch (error) {
            toast.error(t('backups.verifyError', { error: String(error) }));
        }
    };

    const handlePreview = async (id: number) => {
        setPreviewBackupId(id);
        setLoadingPreview(true);
        try {
            const contents = await invoke<string[]>('get_backup_contents', { backupId: id });
            setPreviewContents(contents);
        } catch (error) {
            toast.error(t('backups.loadContentsFailed', { error: String(error) }));
            setPreviewBackupId(null);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleCleanup = () => {
        if (!selectedServerId) return;
        setConfirmState({ action: 'cleanup' });
        setIsConfirmOpen(true);
    };

    const handleConfirmAction = async () => {
        if (!confirmState.action) return;
        setIsConfirmLoading(true);

        try {
            if (confirmState.action === 'restore' && confirmState.backupId != null) {
                await invoke('restore_backup', { backupId: confirmState.backupId });
                toast.success(t('backups.backupRestored'));
            } else if (confirmState.action === 'delete' && confirmState.backupId != null) {
                await invoke('delete_backup', { backupId: confirmState.backupId });
                toast.success(t('backups.backupDeleted'));
                fetchBackups();
            } else if (confirmState.action === 'cleanup' && selectedServerId) {
                const deleted = await invoke<string[]>('cleanup_old_backups', {
                    serverId: selectedServerId,
                    keepCount: 5
                });
                toast.success(t('backups.cleanupSuccess', { count: deleted.length }));
                fetchBackups();
            }
        } catch (error) {
            if (confirmState.action === 'restore') {
                toast.error(t('backups.restoreFailed', { error: String(error) }));
            } else if (confirmState.action === 'delete') {
                toast.error(t('backups.deleteFailed', { error: String(error) }));
            } else if (confirmState.action === 'cleanup') {
                toast.error(t('backups.cleanupFailed', { error: String(error) }));
            }
        } finally {
            setIsConfirmLoading(false);
            setIsConfirmOpen(false);
            setConfirmState({ action: null });
        }
    };

    // Calculate stats
    const totalSize = backups.reduce((acc, b) => acc + (b.size || 0), 0);
    const lastBackup = backups.length > 0 ? backups[0] : null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
                        {t('backups.title')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('backups.subtitle')}</p>
                </div>

                <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700 mx-4">
                    <button
                        onClick={() => setActiveTab('local')}
                        className={cn(
                            "px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                            activeTab === 'local' ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-slate-200"
                        )}
                    >
                        <HardDrive className="w-4 h-4" />
                        Local Storage
                    </button>
                    <button
                        onClick={() => setActiveTab('cloud')}
                        className={cn(
                            "px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                            activeTab === 'cloud' ? "bg-blue-500/20 text-blue-400" : "text-slate-400 hover:text-slate-200"
                        )}
                    >
                        <Cloud className="w-4 h-4" />
                        Cloud Archive
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={selectedServerId || ''}
                        onChange={(e) => setSelectedServerId(Number(e.target.value))}
                        className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                        {servers.map(server => (
                            <option key={server.id} value={server.id}>{server.name}</option>
                        ))}
                    </select>

                    <div className="relative">
                        <button
                            onClick={() => setShowOptions(!showOptions)}
                            className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors shadow-lg shadow-amber-500/20 font-medium"
                        >
                            <Plus className="w-5 h-5" />
                            <span>{t('backups.createBackup')}</span>
                            <ChevronDown className={cn("w-4 h-4 transition-transform", showOptions && "rotate-180")} />
                        </button>

                        {/* Options Dropdown */}
                        {showOptions && (
                            <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="p-4 border-b border-slate-800">
                                    <h4 className="font-semibold text-white flex items-center gap-2">
                                        <Settings className="w-4 h-4" />
                                        {t('backups.options')}
                                    </h4>
                                </div>
                                <div className="p-4 space-y-3">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">{t('backups.includeConfigs')}</span>
                                        <input
                                            type="checkbox"
                                            checked={backupOptions.includeConfigs}
                                            onChange={(e) => setBackupOptions({ ...backupOptions, includeConfigs: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">{t('backups.includeSaves')}</span>
                                        <input
                                            type="checkbox"
                                            checked={backupOptions.includeSaves}
                                            onChange={(e) => setBackupOptions({ ...backupOptions, includeSaves: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">{t('backups.includeMods')}</span>
                                        <input
                                            type="checkbox"
                                            checked={backupOptions.includeMods}
                                            onChange={(e) => setBackupOptions({ ...backupOptions, includeMods: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">{t('backups.compress')}</span>
                                        <input
                                            type="checkbox"
                                            checked={backupOptions.compress}
                                            onChange={(e) => setBackupOptions({ ...backupOptions, compress: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                        />
                                    </label>
                                </div>
                                <div className="p-4 border-t border-slate-800 bg-slate-800/50">
                                    <button
                                        onClick={handleCreateBackup}
                                        disabled={isCreating}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded-lg transition-colors font-medium"
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

            {activeTab === 'cloud' ? (
                <CloudBackupDashboard serverId={selectedServerId} />
            ) : (
                <>
                {/* Backup List */}
                <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                    </div>
                ) : backups.length === 0 ? (
                    <div className="text-center py-16 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                        <FileArchive className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-slate-300">{t('backups.noBackups')}</h3>
                        <p className="text-slate-500 mt-2">{t('backups.createFirst')}</p>
                    </div>
                ) : viewMode === 'timeline' ? (
                    /* ================= TIMELINE VIEW (B1) ================= */
                    <div className="relative">
                        {/* Timeline spine */}
                        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-500/50 via-amber-500/20 to-transparent" />

                        {(() => {
                            // Group backups by date
                            const grouped: Record<string, Backup[]> = {};
                            for (const b of backups) {
                                const dateKey = new Date(b.createdAt).toLocaleDateString();
                                if (!grouped[dateKey]) grouped[dateKey] = [];
                                grouped[dateKey].push(b);
                            }
                            return Object.entries(grouped).map(([date, dayBackups]) => (
                                <div key={date} className="mb-8">
                                    {/* Date header */}
                                    <div className="flex items-center gap-3 mb-4 relative">
                                        <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center border-2 border-amber-500/40 z-10">
                                            <Calendar className="w-5 h-5 text-amber-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-bold text-lg">{date}</p>
                                            <p className="text-slate-500 text-sm">{dayBackups.length} backup{dayBackups.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>

                                    {/* Day's backups */}
                                    <div className="ml-6 space-y-3 pl-6 border-l-2 border-slate-800">
                                        {dayBackups.map((backup) => {
                                            const typeColor = backup.backupType === 'manual'
                                                ? 'bg-amber-500'
                                                : backup.backupType === 'auto'
                                                    ? 'bg-blue-500'
                                                    : 'bg-green-500';
                                            return (
                                                <div key={backup.id} className="relative group">
                                                    {/* Timeline dot */}
                                                    <div className={cn(
                                                        "absolute -left-[30px] top-4 w-3 h-3 rounded-full border-2 border-slate-900 shadow-lg",
                                                        typeColor
                                                    )} />

                                                    <div className="glass-panel rounded-xl p-4 hover:border-amber-500/30 transition-all">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className={cn(
                                                                    "px-2.5 py-1 rounded-lg text-xs font-bold uppercase",
                                                                    backup.backupType === 'manual'
                                                                        ? 'bg-amber-500/20 text-amber-300'
                                                                        : backup.backupType === 'auto'
                                                                            ? 'bg-blue-500/20 text-blue-300'
                                                                            : 'bg-green-500/20 text-green-300'
                                                                )}>
                                                                    {backup.backupType}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-sm">
                                                                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                                                                    <span className="text-slate-300 font-mono">{new Date(backup.createdAt).toLocaleTimeString()}</span>
                                                                </div>
                                                                <span className="text-slate-500 text-sm flex items-center gap-1">
                                                                    <HardDrive className="w-3.5 h-3.5" />
                                                                    {formatBytes(backup.size)}
                                                                </span>
                                                                {backup.verified && (
                                                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => handleRestore(backup.id)}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-300 rounded-lg text-sm transition-colors"
                                                                >
                                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                                    <span>{t('backups.restoreBackup', 'Restore')}</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(backup.id)}
                                                                    className="p-1.5 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-lg transition-colors"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Content tags */}
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {backup.includesConfigs && <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded font-mono">CONFIGS</span>}
                                                            {backup.includesSaves && <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded font-mono">SAVES</span>}
                                                            {backup.includesMods && <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded font-mono">MODS</span>}
                                                            {backup.includesCluster && <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded font-mono">CLUSTER</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {backups.map((backup) => (
                            <div
                                key={backup.id}
                                className="glass-panel rounded-xl p-4 hover:border-amber-500/30 transition-all group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl flex items-center justify-center border border-amber-500/20">
                                            <BackupIcon className="w-6 h-6 text-amber-500" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-bold text-white capitalize">{backup.backupType === 'manual' ? t('backups.manual') : t('backups.auto')} {t('common.backup', 'Backup')}</h3>
                                                {backup.verified ? (
                                                    <span title={t('backups.verified')}>
                                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                                    </span>
                                                ) : (
                                                    <span title={t('backups.notVerified')}>
                                                        <XCircle className="w-4 h-4 text-slate-500" />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(backup.createdAt).toLocaleDateString()}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {new Date(backup.createdAt).toLocaleTimeString()}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <HardDrive className="w-3.5 h-3.5" />
                                                    {formatBytes(backup.size)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handlePreview(backup.id)}
                                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                                            title={t('backups.preview')}
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleVerify(backup.id)}
                                            className="p-2 bg-slate-800 hover:bg-blue-500/20 hover:text-blue-400 text-slate-300 rounded-lg transition-colors"
                                            title={t('backups.verify')}
                                        >
                                            <Shield className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleRestore(backup.id)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-300 rounded-lg transition-colors"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            <span>{t('backups.restoreBackup')}</span>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(backup.id)}
                                            className="p-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-lg transition-colors"
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
