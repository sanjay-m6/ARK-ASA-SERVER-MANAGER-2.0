import { useState, useEffect } from 'react';
import { Plus, Network, Trash2, Loader2, Play, Square, MessageCircle, FlaskConical, ChevronDown, ChevronUp, Pencil, FolderOpen } from 'lucide-react';
import { cn } from '../utils/helpers';
import { createCluster, getClusters, deleteCluster, startCluster, stopCluster, toggleClusterCrossChat, getClusterCrossChatStatus, selectFolder, validateClusterConfiguration, type ClusterValidationResult, type ClusterValidationIssue } from '../utils/tauri';
import { Cluster, Server } from '../types';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { listen } from '@tauri-apps/api/event';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DiscordBridgeSettings from '../components/cluster/DiscordBridgeSettings';
import EditClusterDialog from '../components/cluster/EditClusterDialog';
import VisualClusterBuilder from '../components/cluster/VisualClusterBuilder';
import { useTranslation } from 'react-i18next';

export default function ClusterManager() {
    const { t } = useTranslation();
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newClusterName, setNewClusterName] = useState('');
    const [newClusterPath, setNewClusterPath] = useState('');
    const [selectedServers, setSelectedServers] = useState<number[]>([]);
    const [startingCluster, setStartingCluster] = useState<number | null>(null);
    const [stoppingCluster, setStoppingCluster] = useState<number | null>(null);
    const [crossChatStatus, setCrossChatStatus] = useState<Record<number, boolean>>({});
    const [expandedDiscord, setExpandedDiscord] = useState<number | null>(null);
    const [editCluster, setEditCluster] = useState<Cluster | null>(null);
    const [validationResult, setValidationResult] = useState<ClusterValidationResult | null>(null);
    const [validatingClusterId, setValidatingClusterId] = useState<number | null>(null);
    const { servers, refreshServers } = useServerStore();

    const fetchClusters = async () => {
        setIsLoading(true);
        try {
            const data = await getClusters();
            setClusters(data);

            // Fetch cross-chat status for each cluster
            const statuses: Record<number, boolean> = {};
            for (const cluster of data) {
                try {
                    statuses[cluster.id] = await getClusterCrossChatStatus(cluster.id);
                } catch {
                    statuses[cluster.id] = false;
                }
            }
            setCrossChatStatus(statuses);
        } catch (error) {
            console.error('Failed to fetch clusters:', error);
            toast.error(t('clusterManager.fetchFailed', 'Failed to fetch clusters'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchClusters();

        // Listen for server status changes to update cluster view in realtime
        // Backend emits 'server-status-change' from process_manager.rs
        const unlisten = listen('server-status-change', () => {
            refreshServers();
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [refreshServers]);

    const handleCreateCluster = async () => {
        if (!newClusterName.trim()) {
            toast.error(t('clusterManager.clusterNameReq'));
            return;
        }
        if (selectedServers.length < 2) {
            toast.error(t('clusterManager.selectServersReq'));
            return;
        }

        try {
            await createCluster(
                newClusterName,
                selectedServers,
                newClusterPath.trim() || undefined,
            );
            toast.success(t('clusterManager.clusterCreated'));
            setNewClusterName('');
            setNewClusterPath('');
            setSelectedServers([]);
            setIsCreating(false);
            fetchClusters();
        } catch (error) {
            console.error('Failed to create cluster:', error);
            toast.error(t('clusterManager.createFailed', { error: typeof error === 'string' ? error : 'Unknown error' }));
        }
    };

    const [deleteConfirmCluster, setDeleteConfirmCluster] = useState<Cluster | null>(null);

    const confirmDeleteCluster = async () => {
        if (!deleteConfirmCluster) return;
        try {
            await deleteCluster(deleteConfirmCluster.id);
            toast.success(t('clusterManager.clusterDeleted'));
            setDeleteConfirmCluster(null);
            fetchClusters();
        } catch (error) {
            console.error('Failed to delete cluster:', error);
            toast.error(t('clusterManager.deleteFailed', { error: typeof error === 'string' ? error : 'Unknown error' }));
        }
    };

    const handleStartCluster = async (clusterId: number) => {
        setStartingCluster(clusterId);
        try {
            await startCluster(clusterId);
            toast.success(t('clusterManager.startCluster'));
            refreshServers();
        } catch (error) {
            console.error('Failed to start cluster:', error);
            toast.error(t('clusterManager.startFailed'));
        } finally {
            setStartingCluster(null);
        }
    };

    const handleStopCluster = async (clusterId: number) => {
        setStoppingCluster(clusterId);
        try {
            await stopCluster(clusterId);
            toast.success(t('clusterManager.stopCluster'));
            refreshServers();
        } catch (error) {
            console.error('Failed to stop cluster:', error);
            toast.error(t('clusterManager.stopFailed'));
        } finally {
            setStoppingCluster(null);
        }
    };

    const handleValidateCluster = async (clusterId: number) => {
        setValidatingClusterId(clusterId);
        try {
            const result = await validateClusterConfiguration(clusterId);
            setValidationResult(result);

            const hasErrors = result.issues.some((issue: ClusterValidationIssue) => issue.level === 'error');
            if (!hasErrors && result.issues.length === 0) {
                toast.success(t('clusterManager.validationOk', 'Cluster configuration looks good'));
            } else if (!hasErrors) {
                toast.success(t('clusterManager.validationWarnings', 'Cluster valid with warnings'));
            } else {
                toast.error(t('clusterManager.validationErrors', 'Cluster has configuration problems'));
            }
        } catch (error) {
            console.error('Failed to validate cluster:', error);
            toast.error(t('clusterManager.validationFailed', 'Failed to validate cluster configuration'));
        } finally {
            setValidatingClusterId(null);
        }
    };

    const toggleServerSelection = (serverId: number) => {
        setSelectedServers(prev =>
            prev.includes(serverId)
                ? prev.filter(id => id !== serverId)
                : [...prev, serverId]
        );
    };

    const getServerStatus = (serverId: number): Server | undefined => {
        return servers.find(s => s.id === serverId);
    };

    const isServerActive = (server: Server | undefined): boolean => {
        return server?.status === 'running' || server?.status === 'online' || server?.status === 'starting';
    };

    const getClusterRunningCount = (cluster: Cluster): number => {
        return cluster.serverIds.filter(id => isServerActive(getServerStatus(id))).length;
    };

    const handleToggleCrossChat = async (clusterId: number) => {
        const currentStatus = crossChatStatus[clusterId] ?? false;
        try {
            await toggleClusterCrossChat(clusterId, !currentStatus);
            setCrossChatStatus(prev => ({ ...prev, [clusterId]: !currentStatus }));
            toast.success(t('clusterManager.crossChatToggled', { status: !currentStatus ? 'enabled' : 'disabled' }));
        } catch (error) {
            console.error('Failed to toggle cross-chat:', error);
            toast.error(t('clusterManager.crossChatFailed'));
        }
    };

    const handleBrowseClusterPath = async () => {
        const selected = await selectFolder(t('clusterManager.selectClusterDir'));
        if (selected) {
            setNewClusterPath(selected);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-rose-400">
                        {t('clusterManager.title')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('clusterManager.subtitle')}</p>
                </div>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center space-x-2 px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors shadow-lg shadow-pink-500/20 font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        <span>{t('clusterManager.createCluster')}</span>
                    </button>
                )}
            </div>

            {/* Create Cluster Form */}
            {isCreating && (
                <div className="glass-panel rounded-2xl p-6 border-pink-500/30 shadow-lg shadow-pink-500/10">
                    <h3 className="text-xl font-semibold text-white mb-4">{t('clusterManager.clusterConfig')}</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">{t('clusterManager.clusterName')}</label>
                            <input
                                type="text"
                                value={newClusterName}
                                onChange={(e) => setNewClusterName(e.target.value)}
                                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                                placeholder={t('clusterManager.placeholderName')}
                            />
                        </div>

                        {/* Cluster Folder Path */}
                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">
                                {t('clusterManager.clusterDir')}
                                <span className="text-slate-500 font-normal ml-1">({t('common.optional', 'optional')})</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newClusterPath}
                                    onChange={(e) => setNewClusterPath(e.target.value)}
                                    className="flex-1 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    placeholder={t('clusterManager.placeholderPath')}
                                />
                                <button
                                    onClick={handleBrowseClusterPath}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <FolderOpen className="w-4 h-4" />
                                    {t('common.browse', 'Browse')}
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                {t('clusterManager.defaultPath')}
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">{t('clusterManager.selectServers')}</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {servers.map(server => (
                                    <div
                                        key={server.id}
                                        onClick={() => toggleServerSelection(server.id)}
                                        className={cn(
                                            "p-4 rounded-xl border cursor-pointer transition-all flex items-center space-x-3",
                                            selectedServers.includes(server.id)
                                                ? "bg-pink-500/20 border-pink-500/50 shadow-md shadow-pink-500/10"
                                                : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded-full border flex items-center justify-center",
                                            selectedServers.includes(server.id) ? "bg-pink-500 border-pink-500" : "border-slate-500"
                                        )}>
                                            {selectedServers.includes(server.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                                        </div>
                                        <span className="text-white font-medium">{server.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700/50">
                            <button
                                onClick={() => setIsCreating(false)}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={handleCreateCluster}
                                className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors shadow-lg shadow-pink-500/20 font-medium"
                            >
                                {t('clusterManager.createCluster')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clusters List */}
            <div className="grid grid-cols-1 gap-6">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
                    </div>
                ) : clusters.length === 0 && !isCreating ? (
                    <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                        <Network className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-slate-300">{t('clusterManager.noClusters')}</h3>
                        <p className="text-slate-500 mt-2">{t('clusterManager.createFirst')}</p>
                    </div>
                ) : (
                    clusters.map(cluster => (
                        <div key={cluster.id} className="glass-panel rounded-2xl p-6 relative group">
                            {/* Action Buttons (top-right) */}
                            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => setEditCluster(cluster)}
                                    className="p-2 text-slate-400 hover:text-pink-400 hover:bg-pink-500/10 rounded-lg transition-colors"
                                    title={t('clusterManager.editCluster')}
                                >
                                    <Pencil className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setDeleteConfirmCluster(cluster)}
                                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title={t('clusterManager.deleteCluster')}
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex items-center space-x-4 mb-6">
                                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/20">
                                    <Network className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">{cluster.name}</h3>
                                    <p className="text-sm text-slate-400">
                                        ID: {cluster.id} • {cluster.serverIds.length} Servers •
                                        <span className={cn(
                                            "ml-1 font-medium",
                                            getClusterRunningCount(cluster) > 0 ? "text-emerald-400" : "text-slate-500"
                                        )}>
                                            {t('clusterManager.runningCount', { running: getClusterRunningCount(cluster), total: cluster.serverIds.length })}
                                        </span>
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-[400px]" title={cluster.clusterPath}>
                                        📁 {cluster.clusterPath}
                                    </p>
                                </div>

                                {/* Control Buttons */}
                                <div className="flex space-x-2 ml-auto">
                                    <button
                                        onClick={() => handleStartCluster(cluster.id)}
                                        disabled={startingCluster === cluster.id || getClusterRunningCount(cluster) === cluster.serverIds.length}
                                        className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                    >
                                        {startingCluster === cluster.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Play className="w-4 h-4" />
                                        )}
                                        <span>{t('clusterManager.startAll')}</span>
                                    </button>
                                    <button
                                        onClick={() => handleStopCluster(cluster.id)}
                                        disabled={stoppingCluster === cluster.id || getClusterRunningCount(cluster) === 0}
                                        className="flex items-center space-x-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                    >
                                        {stoppingCluster === cluster.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                        <span>{t('clusterManager.stopAll')}</span>
                                    </button>
                                    <button
                                        onClick={() => handleValidateCluster(cluster.id)}
                                        disabled={validatingClusterId === cluster.id}
                                        className="flex items-center space-x-1 px-3 py-1.5 bg-slate-700/60 hover:bg-slate-600/70 text-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                    >
                                        {validatingClusterId === cluster.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <FlaskConical className="w-4 h-4" />
                                        )}
                                        <span>{t('clusterManager.validateCluster', 'Validate')}</span>
                                    </button>

                                    {/* Cross-Chat Toggle */}
                                    <button
                                        onClick={() => handleToggleCrossChat(cluster.id)}
                                        className={cn(
                                            "flex items-center space-x-1 px-3 py-1.5 rounded-lg transition-colors text-sm relative",
                                            crossChatStatus[cluster.id]
                                                ? "bg-violet-600/20 hover:bg-violet-600/30 text-violet-400"
                                                : "bg-slate-700/50 hover:bg-slate-600/50 text-slate-400"
                                        )}
                                        title="Cross-Server Chat (Experimental)"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        <span>{t('clusterManager.chat')}</span>
                                        <span className="absolute -top-1.5 -right-1 px-1 py-0.5 bg-amber-500 text-[9px] font-bold text-black rounded flex items-center gap-0.5">
                                            <FlaskConical className="w-2 h-2" />
                                            {t('clusterManager.beta')}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Visual Topology Builder */}
                            <div className="mt-4">
                                <VisualClusterBuilder
                                    cluster={cluster}
                                    servers={servers}
                                    allServers={servers}
                                />
                            </div>

                            {/* Discord Bridge Settings Toggle */}
                            <button
                                onClick={() => setExpandedDiscord(expandedDiscord === cluster.id ? null : cluster.id)}
                                className="w-full mt-4 p-3 flex items-center justify-between text-left hover:bg-white/5 rounded-lg transition-colors border border-slate-700/50"
                            >
                                <div className="flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4 text-violet-400" />
                                    <span className="text-sm text-slate-300">{t('clusterManager.discordSettings')}</span>
                                </div>
                                {expandedDiscord === cluster.id ? (
                                    <ChevronUp className="w-4 h-4 text-slate-400" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                            </button>

                            {/* Discord Settings Panel */}
                            {expandedDiscord === cluster.id && (
                                <div className="mt-4">
                                    <DiscordBridgeSettings
                                        clusterId={cluster.id}
                                        clusterName={cluster.name}
                                    />
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!deleteConfirmCluster}
                onClose={() => setDeleteConfirmCluster(null)}
                onConfirm={confirmDeleteCluster}
                title={t('clusterManager.confirmDelete')}
                message={t('clusterManager.confirmDeleteMsg', { name: deleteConfirmCluster?.name || '' })}
                confirmText={t('common.delete', 'Delete')}
                variant="danger"
            />

            {/* Edit Cluster Dialog */}
            {editCluster && (
                <EditClusterDialog
                    isOpen={true}
                    cluster={editCluster}
                    servers={servers}
                    onClose={() => setEditCluster(null)}
                    onSaved={() => {
                        fetchClusters();
                        refreshServers();
                    }}
                />
            )}

            {/* Cluster Validation Result Dialog */}
            {validationResult && (
                <ConfirmDialog
                    isOpen={!!validationResult}
                    onClose={() => setValidationResult(null)}
                    onConfirm={() => setValidationResult(null)}
                    title={t('clusterManager.validationTitle', 'Cluster Validation')}
                    message={
                        validationResult.issues.length === 0
                            ? t('clusterManager.validationOkDetailed', 'All linked servers share the same cluster configuration and ports are unique.')
                            : validationResult.issues
                                .map((issue: ClusterValidationIssue) => {
                                    const prefix = issue.level === 'error' ? '❌' : '⚠️';
                                    return `${prefix} [${issue.server_id}] ${issue.server_name}: ${issue.message}`;
                                })
                                .join('\n')
                    }
                    confirmText={t('common.ok', 'OK')}
                />
            )}
        </div>
    );
}
