import { useState, useEffect } from 'react';
import {
    Database as BackupIcon, Plus, RotateCcw, Trash2, Loader2, FileArchive,
    Calendar, Clock, HardDrive, CheckCircle, XCircle, Eye, Shield,
    Settings, ChevronDown, ChevronUp, FolderOpen, Sparkles
} from 'lucide-react';
import { formatBytes, cn } from '../utils/helpers';
import { invoke } from '@tauri-apps/api/core';
import { Backup } from '../types';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { getAllServers } from '../utils/tauri';

interface BackupOptions {
    includeConfigs: boolean;
    includeSaves: boolean;
    includeMods: boolean;
    compress: boolean;
}

export default function Backups() {
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
            toast.error('Failed to fetch backups');
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
                    include_configs: backupOptions.includeConfigs,
                    include_saves: backupOptions.includeSaves,
                    include_mods: backupOptions.includeMods,
                    compress: backupOptions.compress,
                }
            });
            toast.success('Backup created successfully');
            fetchBackups();
            setShowOptions(false);
        } catch (error) {
            console.error('Failed to create backup:', error);
            toast.error(`Failed to create backup: ${error}`);
        } finally {
            setIsCreating(false);
        }
    };

    const handleRestore = async (id: number) => {
        if (!confirm('Are you sure? This will overwrite current server data.')) return;

        try {
            await invoke('restore_backup', { backupId: id });
            toast.success('Server restored from backup');
        } catch (error) {
            console.error('Failed to restore backup:', error);
            toast.error(`Failed to restore: ${error}`);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this backup?')) return;

        try {
            await invoke('delete_backup', { backupId: id });
            toast.success('Backup deleted');
            fetchBackups();
        } catch (error) {
            console.error('Failed to delete backup:', error);
            toast.error(`Failed to delete: ${error}`);
        }
    };

    const handleVerify = async (id: number) => {
        try {
            const isValid = await invoke<boolean>('verify_backup', { backupId: id });
            if (isValid) {
                toast.success('Backup verified successfully');
            } else {
                toast.error('Backup verification failed - file may be corrupted');
            }
            fetchBackups();
        } catch (error) {
            toast.error(`Verification failed: ${error}`);
        }
    };

    const handlePreview = async (id: number) => {
        setPreviewBackupId(id);
        setLoadingPreview(true);
        try {
            const contents = await invoke<string[]>('get_backup_contents', { backupId: id });
            setPreviewContents(contents);
        } catch (error) {
            toast.error(`Failed to load contents: ${error}`);
            setPreviewBackupId(null);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleCleanup = async () => {
        if (!selectedServerId) return;
        if (!confirm('Delete old backups, keeping only the 5 most recent?')) return;

        try {
            const deleted = await invoke<string[]>('cleanup_old_backups', {
                serverId: selectedServerId,
                keepCount: 5
            });
            toast.success(`Cleaned up ${deleted.length} old backups`);
            fetchBackups();
        } catch (error) {
            toast.error(`Cleanup failed: ${error}`);
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
                        Backups & Rollbacks
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Secure your progress with instant snapshots</p>
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
                            <span>Create Backup</span>
                            <ChevronDown className={cn("w-4 h-4 transition-transform", showOptions && "rotate-180")} />
                        </button>

                        {/* Options Dropdown */}
                        {showOptions && (
                            <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="p-4 border-b border-slate-800">
                                    <h4 className="font-semibold text-white flex items-center gap-2">
                                        <Settings className="w-4 h-4" />
                                        Backup Options
                                    </h4>
                                </div>
                                <div className="p-4 space-y-3">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">Include Configs</span>
                                        <input
                                            type="checkbox"
                                            checked={backupOptions.includeConfigs}
                                            onChange={(e) => setBackupOptions({ ...backupOptions, includeConfigs: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">Include Saves</span>
                                        <input
                                            type="checkbox"
                                            checked={backupOptions.includeSaves}
                                            onChange={(e) => setBackupOptions({ ...backupOptions, includeSaves: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">Include Mods</span>
                                        <input
                                            type="checkbox"
                                            checked={backupOptions.includeMods}
                                            onChange={(e) => setBackupOptions({ ...backupOptions, includeMods: e.target.checked })}
                                            className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-slate-300">Compress (ZIP)</span>
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
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                                        ) : (
                                            <><Sparkles className="w-4 h-4" /> Create Now</>
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
                        <p className="text-slate-400 text-sm">Total Backups</p>
                        <p className="text-2xl font-bold text-white">{backups.length}</p>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <HardDrive className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">Storage Used</p>
                        <p className="text-2xl font-bold text-white">{formatBytes(totalSize)}</p>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                        <Clock className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-sm">Last Backup</p>
                        <p className="text-lg font-bold text-white">
                            {lastBackup ? new Date(lastBackup.createdAt).toLocaleDateString() : 'Never'}
                        </p>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                    <button
                        onClick={handleCleanup}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-5 h-5" />
                        <span>Cleanup Old</span>
                    </button>
                </div>
            </div>

            {/* Backup List */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                    </div>
                ) : backups.length === 0 ? (
                    <div className="text-center py-16 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                        <FileArchive className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-slate-300">No Backups Found</h3>
                        <p className="text-slate-500 mt-2">Create a manual backup to get started</p>
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
                                                <h3 className="font-bold text-white capitalize">{backup.backupType} Backup</h3>
                                                {backup.verified ? (
                                                    <span title="Verified">
                                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                                    </span>
                                                ) : (
                                                    <span title="Not verified">
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
                                            title="Preview contents"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleVerify(backup.id)}
                                            className="p-2 bg-slate-800 hover:bg-blue-500/20 hover:text-blue-400 text-slate-300 rounded-lg transition-colors"
                                            title="Verify integrity"
                                        >
                                            <Shield className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleRestore(backup.id)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-green-500/20 hover:text-green-400 text-slate-300 rounded-lg transition-colors"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            <span>Restore</span>
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
                                                Backup Contents
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
                                                Loading contents...
                                            </div>
                                        ) : (
                                            <div className="bg-slate-950 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs">
                                                {previewContents.length === 0 ? (
                                                    <p className="text-slate-500">No files in backup</p>
                                                ) : (
                                                    previewContents.slice(0, 50).map((file, idx) => (
                                                        <div key={idx} className="text-slate-400 py-0.5 hover:text-slate-200">
                                                            {file}
                                                        </div>
                                                    ))
                                                )}
                                                {previewContents.length > 50 && (
                                                    <p className="text-slate-500 mt-2">... and {previewContents.length - 50} more files</p>
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
        </div>
    );
}
