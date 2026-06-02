import { useState } from 'react';
import { X, Pencil, FolderOpen, Plus, Minus, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../../../utils/helpers';
import { Cluster, Server } from '../../../types';
import { updateAseCluster, addServerToAseCluster, removeServerFromAseCluster, selectFolder, validateClusterPath } from '../../../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface EditClusterDialogProps {
    isOpen: boolean;
    cluster: Cluster;
    servers: Server[];
    onClose: () => void;
    onSaved: () => void;
}

export default function ASEEditClusterDialog({
    isOpen,
    cluster,
    servers,
    onClose,
    onSaved,
}: EditClusterDialogProps) {
    const { t } = useTranslation();
    const [clusterName, setClusterName] = useState(cluster.name);
    const [clusterPath, setClusterPath] = useState(cluster.clusterPath);
    const [moveData, setMoveData] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [pathError, setPathError] = useState('');
    const [confirmRemoveServer, setConfirmRemoveServer] = useState<number | null>(null);

    // Servers in this cluster vs available
    const clusterServerIds = new Set(cluster.serverIds);
    const serversInCluster = servers.filter(s => clusterServerIds.has(s.id));
    const serversAvailable = servers.filter(s => !clusterServerIds.has(s.id));

    const [prevCluster, setPrevCluster] = useState(cluster);
    if (cluster !== prevCluster) {
        setPrevCluster(cluster);
        setClusterName(cluster.name);
        setClusterPath(cluster.clusterPath);
        setMoveData(false);
        setPathError('');
        setConfirmRemoveServer(null);
    }

    if (!isOpen) return null;

    const pathChanged = clusterPath !== cluster.clusterPath;
    const nameChanged = clusterName.trim() !== cluster.name;

    const handleBrowse = async () => {
        const selected = await selectFolder(t('clusterManager.selectClusterDir'));
        if (selected) {
            setClusterPath(selected);
            setPathError('');
        }
    };

    const handleValidatePath = async () => {
        if (!clusterPath.trim()) {
            setPathError('');
            return;
        }
        try {
            const result = await validateClusterPath(clusterPath);
            if (!result.valid) {
                setPathError(result.error || t('clusterManager.invalidPath'));
            } else {
                setPathError('');
            }
        } catch {
            setPathError(t('clusterManager.validatePathFailed'));
        }
    };

    const handleSave = async () => {
        if (pathError) return;
        if (!nameChanged && !pathChanged) {
            onClose();
            return;
        }

        setIsSaving(true);
        try {
            await updateAseCluster(
                cluster.id,
                nameChanged ? clusterName.trim() : undefined,
                pathChanged ? clusterPath.trim() : undefined,
                pathChanged ? moveData : undefined,
            );
            toast.success(t('clusterManager.updateSuccess'));
            onSaved();
            onClose();
        } catch (error) {
            console.error('Failed to update cluster:', error);
            toast.error(t('clusterManager.updateFailed', { error: String(error) }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddServer = async (serverId: number) => {
        try {
            await addServerToAseCluster(cluster.id, serverId);
            toast.success(t('clusterManager.serverAdded'));
            onSaved();
        } catch (error) {
            console.error('Failed to add server:', error);
            toast.error(t('clusterManager.serverAddFailed'));
        }
    };

    const handleRemoveServer = async (serverId: number) => {
        try {
            await removeServerFromAseCluster(cluster.id, serverId);
            toast.success(t('clusterManager.serverRemoved'));
            setConfirmRemoveServer(null);
            onSaved();
        } catch (error) {
            console.error('Failed to remove server:', error);
            toast.error(t('clusterManager.serverRemoveFailed'));
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-pink-500/20 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-pink-500/10">
                            <Pencil className="w-6 h-6 text-pink-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white">{t('clusterManager.editCluster')}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {/* Cluster Name */}
                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-2">
                            {t('clusterManager.clusterName')}
                        </label>
                        <input
                            type="text"
                            value={clusterName}
                            onChange={e => setClusterName(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                            placeholder="My Cluster"
                        />
                    </div>

                    {/* Cluster Path */}
                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-2">
                            {t('clusterManager.clusterDir')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={clusterPath}
                                onChange={e => {
                                    setClusterPath(e.target.value);
                                    setPathError('');
                                }}
                                onBlur={handleValidatePath}
                                className={cn(
                                    "flex-1 px-4 py-2 bg-slate-900/50 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500",
                                    pathError ? "border-red-500/50" : "border-slate-700"
                                )}
                                placeholder="C:\ASA_Clusters"
                            />
                            <button
                                onClick={handleBrowse}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <FolderOpen className="w-4 h-4" />
                                {t('common.browse', 'Browse')}
                            </button>
                        </div>
                        {pathError && (
                            <div className="flex items-center gap-1.5 mt-2 text-red-400 text-sm">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{pathError}</span>
                            </div>
                        )}

                        {/* Move Data Option */}
                        {pathChanged && (
                            <label className="flex items-center gap-2 mt-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={moveData}
                                    onChange={e => setMoveData(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-pink-500 focus:ring-pink-500"
                                />
                                <span className="text-sm text-slate-300">{t('clusterManager.moveData')}</span>
                            </label>
                        )}
                    </div>

                    {/* Server Membership Management */}
                    <div>
                        <label className="text-sm font-medium text-slate-300 block mb-3">
                            {t('clusterManager.membership')}
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Servers IN Cluster */}
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                                <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    {t('clusterManager.inCluster')} ({serversInCluster.length})
                                </h4>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                    {serversInCluster.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic">{t('clusterManager.noServersInCluster')}</p>
                                    ) : (
                                        serversInCluster.map(server => (
                                            <div key={server.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-700/30">
                                                <span className="text-sm text-white truncate mr-2">{server.name}</span>
                                                {confirmRemoveServer === server.id ? (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => handleRemoveServer(server.id)}
                                                            className="px-2 py-0.5 text-xs bg-red-500 hover:bg-red-400 text-white rounded transition-colors"
                                                        >
                                                            {t('common.yes', 'Yes')}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmRemoveServer(null)}
                                                            className="px-2 py-0.5 text-xs text-slate-400 hover:text-white transition-colors"
                                                        >
                                                            {t('common.no', 'No')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmRemoveServer(server.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                                                        title={t('clusterManager.removeServer')}
                                                    >
                                                        <Minus className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Available Servers */}
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                                <h4 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                                    {t('clusterManager.available')} ({serversAvailable.length})
                                </h4>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                    {serversAvailable.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic">{t('clusterManager.allServersInCluster')}</p>
                                    ) : (
                                        serversAvailable.map(server => (
                                            <div key={server.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-700/30">
                                                <span className="text-sm text-white truncate mr-2">{server.name}</span>
                                                <button
                                                    onClick={() => handleAddServer(server.id)}
                                                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors shrink-0"
                                                    title={t('clusterManager.addServer')}
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700/50 bg-slate-800/30 shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-5 py-2.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-all font-medium disabled:opacity-50"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !!pathError}
                        className="px-5 py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t('common.saving', 'Saving...')}
                            </>
                        ) : (
                            t('common.saveChanges', 'Save Changes')
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

