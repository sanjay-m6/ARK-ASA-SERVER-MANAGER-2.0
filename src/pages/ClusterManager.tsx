import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Network, Trash2, Loader2, Play, Square, RotateCw, MessageCircle, FlaskConical, ChevronDown, ChevronUp, Pencil, FolderOpen, Search, Clock, Globe, X, Copy, Check, Info } from 'lucide-react';
import { cn } from '../utils/helpers';
import { createCluster, getClusters, deleteCluster, startCluster, stopCluster, restartCluster, getClusterCrossChatStatus, selectFolder, validateClusterConfiguration, addServerToCluster, removeServerFromCluster, scanExistingClusters, type ClusterValidationResult, type ClusterValidationIssue } from '../utils/tauri';
import { startServer, stopServer } from '../utils/tauri';
import { Cluster, Server } from '../types';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { useTauriEvent } from '../hooks/useTauriEvent';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DiscordBridgeSettings from '../components/cluster/DiscordBridgeSettings';
import EditClusterDialog from '../components/cluster/EditClusterDialog';
import VisualClusterBuilder from '../components/cluster/VisualClusterBuilder';
import CrossChatConfigDialog from '../components/cluster/CrossChatConfigDialog';
import { useTranslation } from 'react-i18next';

export default function ClusterManager() {
    const { t } = useTranslation();
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newClusterName, setNewClusterName] = useState('');
    const [newClusterPath, setNewClusterPath] = useState('');
    const [newClusterIdString, setNewClusterIdString] = useState('');
    const [selectedServers, setSelectedServers] = useState<number[]>([]);
    const [startingCluster, setStartingCluster] = useState<number | null>(null);
    const [stoppingCluster, setStoppingCluster] = useState<number | null>(null);
    const [restartingCluster, setRestartingCluster] = useState<number | null>(null);
    const [crossChatStatus, setCrossChatStatus] = useState<Record<number, boolean>>({});
    const [expandedDiscord, setExpandedDiscord] = useState<number | null>(null);
    const [editCluster, setEditCluster] = useState<Cluster | null>(null);
    const [showGuide, setShowGuide] = useState(false);
    const [copiedText, setCopiedText] = useState<string | null>(null);
    const [validationResult, setValidationResult] = useState<ClusterValidationResult | null>(null);
    const [validatingClusterId, setValidatingClusterId] = useState<number | null>(null);
    const { servers, refreshServers } = useServerStore();

    // Close guide on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showGuide) {
                setShowGuide(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showGuide]);

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedText(text);
        toast.success(t('common.copied', 'Copied to clipboard!'));
        setTimeout(() => setCopiedText(null), 2000);
    }, [t]);

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
    }, []);

    // Listen for server status changes to update cluster view in realtime safely
    useTauriEvent('server-status-change', useCallback(() => {
        refreshServers();
    }, [refreshServers]));

    const handleCreateCluster = async () => {
        if (!newClusterName.trim()) {
            toast.error(t('clusterManager.clusterNameReq', 'Cluster name is required'));
            return;
        }
        if (selectedServers.length < 1) {
            toast.error(t('clusterManager.selectServersReq', 'Please select at least 1 server'));
            return;
        }

        try {
            await createCluster(
                newClusterName.trim(),
                selectedServers,
                newClusterPath.trim() || undefined,
                newClusterIdString.trim() || newClusterName.trim().replace(/\s+/g, '_'),
                true,
            );
            toast.success(t('clusterManager.clusterCreated', 'Cluster created successfully'));
            setNewClusterName('');
            setNewClusterPath('');
            setNewClusterIdString('');
            setSelectedServers([]);
            setIsCreating(false);
            fetchClusters();
        } catch (error) {
            console.error('Failed to create cluster:', error);
            const errStr = typeof error === 'string' ? error : (error as any)?.message || 'Unknown error';
            toast.error(t('clusterManager.createFailed', { error: errStr, defaultValue: `Failed to create cluster: ${errStr}` }));
        }
    };

    const [deleteConfirmCluster, setDeleteConfirmCluster] = useState<Cluster | null>(null);
    const [configuringCrossChat, setConfiguringCrossChat] = useState<Cluster | null>(null);

    const confirmDeleteCluster = async () => {
        if (!deleteConfirmCluster) return;
        try {
            await deleteCluster(deleteConfirmCluster.id);
            toast.success(t('clusterManager.clusterDeleted', 'Cluster deleted successfully'));
            setDeleteConfirmCluster(null);
            fetchClusters();
        } catch (error) {
            console.error('Failed to delete cluster:', error);
            const errStr = typeof error === 'string' ? error : (error as any)?.message || 'Unknown error';
            toast.error(t('clusterManager.deleteFailed', { error: errStr, defaultValue: `Failed to delete cluster: ${errStr}` }));
        }
    };

    const [staggerDelay, setStaggerDelay] = useState<number>(15);
    const [discoveredClusters, setDiscoveredClusters] = useState<{ name: string; path: string; exists_in_db: boolean }[]>([]);
    const [isScanningClusters, setIsScanningClusters] = useState<boolean>(false);

    const handleScanClusters = async () => {
        setIsScanningClusters(true);
        try {
            const discovered = await scanExistingClusters();
            setDiscoveredClusters(discovered);
            if (discovered.length === 0) {
                toast.error(t('clusterManager.noClustersFound', 'No existing cluster directories found in default path.'));
            } else {
                toast.success(t('clusterManager.clustersDiscovered', { count: discovered.length, defaultValue: `Discovered ${discovered.length} cluster folders.` }));
            }
        } catch (err) {
            console.error('Failed to scan cluster directories:', err);
            const errStr = typeof err === 'string' ? err : (err as any)?.message || 'Failed to scan cluster directories';
            toast.error(errStr);
        } finally {
            setIsScanningClusters(false);
        }
    };

    const handleStartCluster = async (clusterId: number) => {
        setStartingCluster(clusterId);
        try {
            await startCluster(clusterId, staggerDelay);
            toast.success(t('clusterManager.startClusterWithDelay', { delay: staggerDelay, defaultValue: `Starting cluster servers with ${staggerDelay}s delay` }));
            refreshServers();
        } catch (error) {
            console.error('Failed to start cluster:', error);
            const errStr = typeof error === 'string' ? error : (error as any)?.message || 'Failed to start cluster';
            toast.error(errStr);
        } finally {
            setStartingCluster(null);
        }
    };

    const handleStopCluster = async (clusterId: number) => {
        setStoppingCluster(clusterId);
        try {
            await stopCluster(clusterId);
            toast.success(t('clusterManager.stopCluster', 'Stopping cluster servers'));
            refreshServers();
        } catch (error) {
            console.error('Failed to stop cluster:', error);
            const errStr = typeof error === 'string' ? error : (error as any)?.message || 'Failed to stop cluster';
            toast.error(errStr);
        } finally {
            setStoppingCluster(null);
        }
    };

    const handleRestartCluster = async (clusterId: number) => {
        setRestartingCluster(clusterId);
        try {
            await restartCluster(clusterId, staggerDelay);
            toast.success(`Restarting all cluster servers with ${staggerDelay}s launch delay`);
            refreshServers();
        } catch (error) {
            console.error('Failed to restart cluster:', error);
            const errStr = typeof error === 'string' ? error : (error as any)?.message || 'Failed to restart cluster';
            toast.error(errStr);
        } finally {
            setRestartingCluster(null);
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
            const errStr = typeof error === 'string' ? error : (error as any)?.message || t('clusterManager.validationFailed', 'Failed to validate cluster configuration');
            toast.error(errStr);
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



    const handleBrowseClusterPath = async () => {
        const selected = await selectFolder(t('clusterManager.selectClusterDir'));
        if (selected) {
            setNewClusterPath(selected);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-rose-400">
                        {t('clusterManager.title')}
                    </h1>
                    <p className="text-[var(--text-secondary)] mt-2 text-lg">{t('clusterManager.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowGuide(true)}
                        className="flex items-center space-x-2 px-4 py-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-sky-400 border border-sky-500/30 rounded-lg transition-colors text-sm font-semibold shadow-md shadow-sky-500/5 cursor-pointer"
                    >
                        <Globe className="w-4 h-4 text-sky-400" />
                        <span>{t('clusterManager.crossComputerGuide', 'Cross-Computer Cluster Guide')}</span>
                    </button>
                    {!isCreating && (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="flex items-center space-x-2 px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors shadow-lg shadow-pink-500/20 font-medium cursor-pointer"
                        >
                            <Plus className="w-5 h-5" />
                            <span>{t('clusterManager.createCluster')}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Create Cluster Form */}
            {isCreating && (
                <div className="glass-panel rounded-2xl p-6 border border-pink-500/30 shadow-lg shadow-pink-500/10">
                    <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-4">{t('clusterManager.clusterConfig')}</h3>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">{t('clusterManager.clusterName')}</label>
                                <input
                                    type="text"
                                    value={newClusterName}
                                    onChange={(e) => {
                                        setNewClusterName(e.target.value);
                                        if (!newClusterIdString) {
                                            setNewClusterIdString(e.target.value.replace(/\s+/g, '_'));
                                        }
                                    }}
                                    className="w-full px-4 py-2 bg-[var(--input-background)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    placeholder={t('clusterManager.placeholderName')}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[var(--text-secondary)] flex items-center justify-between mb-2">
                                    <span>{t('clusterManager.clusterIdString', 'Shared Cluster ID (-clusterid)')}</span>
                                    <span className="text-xs text-sky-400">Match across machines</span>
                                </label>
                                <input
                                    type="text"
                                    value={newClusterIdString}
                                    onChange={(e) => setNewClusterIdString(e.target.value)}
                                    className="w-full px-4 py-2 bg-[var(--input-background)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    placeholder="MyCrossCluster123"
                                />
                            </div>
                        </div>

                        {/* Cluster Folder Path & Auto-Connect */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-[var(--text-secondary)]">
                                    {t('clusterManager.clusterDir')}
                                    <span className="text-[var(--text-muted)] font-normal ml-1">({t('common.optional', 'optional')})</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleScanClusters}
                                    disabled={isScanningClusters}
                                    className="text-xs text-pink-400 hover:text-pink-300 flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
                                >
                                    {isScanningClusters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                    Auto-Detect Multi-Root Clusters
                                </button>
                            </div>
                            <div className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    value={newClusterPath}
                                    onChange={(e) => setNewClusterPath(e.target.value)}
                                    className="flex-1 px-4 py-2 bg-[var(--input-background)] border border-[var(--input-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    placeholder={t('clusterManager.placeholderPath')}
                                />
                                <button
                                    onClick={handleBrowseClusterPath}
                                    className="px-4 py-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                    <FolderOpen className="w-4 h-4" />
                                    {t('common.browse', 'Browse')}
                                </button>
                            </div>

                            {discoveredClusters.length > 0 && (
                                <div className="p-3 bg-[var(--surface)] border border-pink-500/30 rounded-xl space-y-2 mb-2">
                                    <span className="text-xs font-semibold text-pink-300 block">Discovered Cluster Folders (Select to Auto-Connect):</span>
                                    <div className="flex flex-wrap gap-2">
                                        {discoveredClusters.map(folder => (
                                            <button
                                                key={folder.path}
                                                type="button"
                                                onClick={() => {
                                                    setNewClusterName(folder.name);
                                                    setNewClusterPath(folder.path);
                                                }}
                                                className="px-3 py-1.5 bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 text-[var(--text-primary)] text-xs rounded-lg font-mono flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <span>📁 {folder.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <p className="text-xs text-[var(--text-muted)]">
                                {t('clusterManager.defaultPath')}
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">{t('clusterManager.selectServers')}</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {servers.map(server => (
                                    <div
                                        key={server.id}
                                        onClick={() => toggleServerSelection(server.id)}
                                        className={cn(
                                            "p-4 rounded-xl border cursor-pointer transition-all flex items-center space-x-3",
                                            selectedServers.includes(server.id)
                                                ? "bg-pink-500/20 border-pink-500/50 shadow-md shadow-pink-500/10"
                                                : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded-full border flex items-center justify-center",
                                            selectedServers.includes(server.id) ? "bg-pink-500 border-pink-500" : "border-[var(--border)]"
                                        )}>
                                            {selectedServers.includes(server.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                                        </div>
                                        <span className="text-[var(--text-primary)] font-medium">{server.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border)]">
                            <button
                                onClick={() => setIsCreating(false)}
                                className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={handleCreateCluster}
                                className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors shadow-lg shadow-pink-500/20 font-medium cursor-pointer"
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
                    <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-[var(--border)]">
                        <Network className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-[var(--text-primary)]">{t('clusterManager.noClusters')}</h3>
                        <p className="text-[var(--text-secondary)] mt-2">{t('clusterManager.createFirst')}</p>
                    </div>
                ) : (
                    clusters.map(cluster => (
                        <div key={cluster.id} className="glass-panel rounded-2xl p-6 relative group border border-[var(--border)]">
                            {/* Action Buttons (top-right) */}
                            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => setEditCluster(cluster)}
                                    className="p-2 text-[var(--text-secondary)] hover:text-pink-400 hover:bg-pink-500/10 rounded-lg transition-colors cursor-pointer"
                                    title={t('clusterManager.editCluster')}
                                >
                                    <Pencil className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setDeleteConfirmCluster(cluster)}
                                    className="p-2 text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
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
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-bold text-[var(--text-primary)]">{cluster.name}</h3>
                                        <span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-mono rounded-md flex items-center gap-1">
                                            <span className="text-[10px] text-purple-400 font-sans">ID:</span>
                                            {cluster.clusterIdString || cluster.name.replace(/\s+/g, '_')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        DB #{cluster.id} • {cluster.serverIds.length} Servers •
                                        <span className={cn(
                                            "ml-1 font-medium",
                                            getClusterRunningCount(cluster) > 0 ? "text-emerald-400" : "text-[var(--text-muted)]"
                                        )}>
                                            {t('clusterManager.runningCount', { running: getClusterRunningCount(cluster), total: cluster.serverIds.length })}
                                        </span>
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono truncate max-w-[400px]" title={cluster.clusterPath}>
                                        📁 {cluster.clusterPath}
                                    </p>
                                </div>

                                {/* Control Buttons */}
                                <div className="flex items-center space-x-2 ml-auto">
                                    <div className="flex items-center gap-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-2 text-xs" title="Delay between consecutive server launches to prevent crashes">
                                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                                        <span className="text-[var(--text-secondary)] text-[11px]">Delay:</span>
                                        <select
                                            value={staggerDelay}
                                            onChange={(e) => setStaggerDelay(Number(e.target.value))}
                                            className="bg-transparent text-[var(--text-primary)] font-mono text-xs focus:outline-none cursor-pointer py-1"
                                        >
                                            <option value={5} className="bg-[var(--card-background)] text-[var(--text-primary)]">5s</option>
                                            <option value={15} className="bg-[var(--card-background)] text-[var(--text-primary)]">15s</option>
                                            <option value={30} className="bg-[var(--card-background)] text-[var(--text-primary)]">30s</option>
                                            <option value={60} className="bg-[var(--card-background)] text-[var(--text-primary)]">60s</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => handleStartCluster(cluster.id)}
                                        disabled={startingCluster === cluster.id || getClusterRunningCount(cluster) === cluster.serverIds.length}
                                        className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
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
                                        className="flex items-center space-x-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
                                    >
                                        {stoppingCluster === cluster.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                        <span>{t('clusterManager.stopAll')}</span>
                                    </button>
                                    <button
                                        onClick={() => handleRestartCluster(cluster.id)}
                                        disabled={restartingCluster === cluster.id}
                                        className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
                                        title="Restart all servers in this cluster with staggered delay"
                                    >
                                        {restartingCluster === cluster.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <RotateCw className="w-4 h-4" />
                                        )}
                                        <span>Restart All</span>
                                    </button>
                                    <button
                                        onClick={() => handleValidateCluster(cluster.id)}
                                        disabled={validatingClusterId === cluster.id}
                                        className="flex items-center space-x-1 px-3 py-1.5 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
                                    >
                                        {validatingClusterId === cluster.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <FlaskConical className="w-4 h-4" />
                                        )}
                                        <span>{t('clusterManager.validateCluster', 'Validate')}</span>
                                    </button>

                                    {/* Cross-Chat Settings */}
                                    <button
                                        onClick={() => setConfiguringCrossChat(cluster)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition-all text-xs font-semibold border shadow-sm cursor-pointer",
                                            crossChatStatus[cluster.id]
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                                : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-active)] hover:text-[var(--text-primary)]"
                                        )}
                                        title="Cross-Server Chat Setup"
                                    >
                                        <MessageCircle className="w-4 h-4 text-emerald-400" />
                                        <span>Cross-Chat</span>
                                        {crossChatStatus[cluster.id] && (
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Visual Topology Builder */}
                            <div className="mt-4">
                                <VisualClusterBuilder
                                    cluster={cluster}
                                    servers={servers}
                                    allServers={servers}
                                    onAddServer={async (serverId) => {
                                        try {
                                            await addServerToCluster(cluster.id, serverId);
                                            toast.success(t('clusterManager.serverAdded', 'Server added to cluster'));
                                            fetchClusters();
                                        } catch (error) {
                                            console.error('Failed to add server:', error);
                                            toast.error(t('clusterManager.addFailed', 'Failed to add server'));
                                        }
                                    }}
                                    onRemoveServer={async (serverId) => {
                                        try {
                                            await removeServerFromCluster(cluster.id, serverId);
                                            toast.success(t('clusterManager.serverRemoved', 'Server removed from cluster'));
                                            fetchClusters();
                                        } catch (error) {
                                            console.error('Failed to remove server:', error);
                                            toast.error(t('clusterManager.removeFailed', 'Failed to remove server'));
                                        }
                                    }}
                                    onStartServer={async (serverId) => {
                                        try {
                                            await startServer(serverId);
                                            toast.success(t('clusterManager.serverStarted', 'Server started'));
                                            refreshServers();
                                        } catch (error) {
                                            console.error('Failed to start server:', error);
                                            toast.error(t('clusterManager.serverStartFailed', 'Failed to start server'));
                                        }
                                    }}
                                    onStopServer={async (serverId) => {
                                        try {
                                            await stopServer(serverId);
                                            toast.success(t('clusterManager.serverStopped', 'Server stopped'));
                                            refreshServers();
                                        } catch (error) {
                                            console.error('Failed to stop server:', error);
                                            toast.error(t('clusterManager.serverStopFailed', 'Failed to stop server'));
                                        }
                                    }}
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

            {/* Cross-Server Chat Configuration Dialog */}
            {configuringCrossChat && (
                <CrossChatConfigDialog
                    isOpen={configuringCrossChat !== null}
                    cluster={configuringCrossChat}
                    onClose={() => setConfiguringCrossChat(null)}
                    onSaved={(enabled) => {
                        if (configuringCrossChat) {
                            setCrossChatStatus(prev => ({ ...prev, [configuringCrossChat.id]: enabled }));
                        }
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
            {/* Cross-Computer Setup Guide Modal (Rendered via React Portal) */}
            {showGuide && createPortal(
                <div 
                    className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200"
                    onClick={() => setShowGuide(false)}
                >
                    <div 
                        className="bg-[var(--card-background)] border border-[var(--border)] rounded-3xl max-w-4xl w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[88vh] flex flex-col relative animate-in zoom-in-95 duration-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 shrink-0">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500/20 to-blue-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-lg shadow-sky-500/10 shrink-0">
                                    <Globe className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-wide">
                                        {t('clusterManager.guideTitle', 'Cross-Computer Cluster Setup Guide')}
                                    </h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                        {t('clusterManager.guideSubtitle', 'How to link ARK servers hosted across 2 or more physical PCs')}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowGuide(false)} 
                                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-xl transition-all cursor-pointer border border-transparent hover:border-[var(--border)]"
                                title="Close (Esc)"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Steps Content (Scrollable) */}
                        <div className="flex-1 overflow-y-auto theme-scrollbar pr-2 space-y-4 text-sm">
                            {/* Step 1 */}
                            <div className="p-4 md:p-5 bg-sky-500/10 border border-sky-500/25 rounded-2xl space-y-3">
                                <h4 className="font-bold text-sky-400 flex items-center gap-2.5 text-sm">
                                    <span className="w-6 h-6 rounded-full bg-sky-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow-md shrink-0">1</span>
                                    {t('clusterManager.step1Title', 'Set Up Shared Storage Folder (LAN SMB / Network Drive)')}
                                </h4>
                                <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                                    {t('clusterManager.step1Desc', 'ARK clusters use a shared folder to write character, dino, and item transfer files between servers.')}
                                </p>
                                <div className="space-y-2 text-xs bg-slate-950/40 p-3.5 rounded-xl border border-sky-500/20">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[var(--text-primary)] font-semibold">• Computer A (Primary):</span>
                                        <button 
                                            onClick={() => handleCopy('C:\\ARKClusterData')}
                                            className="px-2.5 py-1 rounded-lg bg-black/40 hover:bg-black/60 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] flex items-center gap-1.5 cursor-pointer transition-all shadow-inner"
                                            title="Click to copy path"
                                        >
                                            {copiedText === 'C:\\ARKClusterData' ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 opacity-60" />}
                                            <span>C:\ARKClusterData</span>
                                        </button>
                                        <span className="text-[var(--text-muted)]">shared as</span>
                                        <button 
                                            onClick={() => handleCopy('\\\\192.168.1.100\\ARKClusterData')}
                                            className="px-2.5 py-1 rounded-lg bg-black/40 hover:bg-black/60 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] flex items-center gap-1.5 cursor-pointer transition-all shadow-inner"
                                            title="Click to copy network path"
                                        >
                                            {copiedText === '\\\\192.168.1.100\\ARKClusterData' ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 opacity-60" />}
                                            <span>\\192.168.1.100\ARKClusterData</span>
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[var(--text-primary)] font-semibold">• Computer B (Secondary):</span>
                                        <span className="text-[var(--text-secondary)]">Map or access the shared network path:</span>
                                        <button 
                                            onClick={() => handleCopy('\\\\192.168.1.100\\ARKClusterData')}
                                            className="px-2.5 py-1 rounded-lg bg-black/40 hover:bg-black/60 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] flex items-center gap-1.5 cursor-pointer transition-all shadow-inner"
                                            title="Click to copy path"
                                        >
                                            {copiedText === '\\\\192.168.1.100\\ARKClusterData' ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3 opacity-60" />}
                                            <span>\\192.168.1.100\ARKClusterData</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div className="p-4 md:p-5 bg-purple-500/10 border border-purple-500/25 rounded-2xl space-y-3">
                                <h4 className="font-bold text-purple-400 flex items-center gap-2.5 text-sm">
                                    <span className="w-6 h-6 rounded-full bg-purple-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow-md shrink-0">2</span>
                                    {t('clusterManager.step2Title', 'Use the EXACT SAME Cluster ID String')}
                                </h4>
                                <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                                    {t('clusterManager.step2Desc', 'Both Manager instances must launch their servers with the identical cluster ID string so ARK client connects them.')}
                                </p>
                                <div className="flex items-center gap-2 bg-slate-950/40 p-3.5 rounded-xl border border-purple-500/20 text-xs">
                                    <span className="text-[var(--text-muted)] font-mono">-clusterid=</span>
                                    <button 
                                        onClick={() => handleCopy('MyAwesomeARKCluster')}
                                        className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-inner"
                                        title="Click to copy cluster ID"
                                    >
                                        {copiedText === 'MyAwesomeARKCluster' ? <Check className="w-3.5 h-3.5 text-purple-300" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
                                        <span>MyAwesomeARKCluster</span>
                                    </button>
                                </div>
                            </div>

                            {/* Step 3 */}
                            <div className="p-4 md:p-5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl space-y-3">
                                <h4 className="font-bold text-emerald-400 flex items-center gap-2.5 text-sm">
                                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow-md shrink-0">3</span>
                                    {t('clusterManager.step3Title', 'Create Cluster on Both Computers')}
                                </h4>
                                <div className="space-y-2 text-xs bg-slate-950/40 p-3.5 rounded-xl border border-emerald-500/20">
                                    <p className="text-[var(--text-secondary)] leading-relaxed">
                                        • On <strong className="text-[var(--text-primary)]">Computer A</strong>: Click <span className="text-pink-400 font-semibold">+ Create Cluster</span> with ID <code className="text-emerald-400 bg-black/40 px-1.5 py-0.5 rounded border border-emerald-500/30">MyAwesomeARKCluster</code> and path <code className="text-emerald-400 bg-black/40 px-1.5 py-0.5 rounded border border-emerald-500/30">C:\ARKClusterData</code>.
                                    </p>
                                    <p className="text-[var(--text-secondary)] leading-relaxed">
                                        • On <strong className="text-[var(--text-primary)]">Computer B</strong>: Click <span className="text-pink-400 font-semibold">+ Create Cluster</span> with the <strong className="text-[var(--text-primary)]">SAME ID</strong> <code className="text-emerald-400 bg-black/40 px-1.5 py-0.5 rounded border border-emerald-500/30">MyAwesomeARKCluster</code> and network path <code className="text-emerald-400 bg-black/40 px-1.5 py-0.5 rounded border border-emerald-500/30">\\192.168.1.100\ARKClusterData</code>.
                                    </p>
                                </div>
                            </div>

                            {/* Step 4 */}
                            <div className="p-4 md:p-5 bg-amber-500/10 border border-amber-500/25 rounded-2xl space-y-3">
                                <h4 className="font-bold text-amber-400 flex items-center gap-2.5 text-sm">
                                    <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow-md shrink-0">4</span>
                                    {t('clusterManager.step4Title', 'Start Servers & Travel Across Maps')}
                                </h4>
                                <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                                    {t('clusterManager.step4Desc', 'Start all servers across both machines. In-game Obelisks, Supply Drops, and Tek Transmitters will automatically list all maps across both computers for seamless transfers!')}
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] shrink-0">
                            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                <Info className="w-4 h-4 text-sky-400 shrink-0" />
                                <span>{t('clusterManager.guideTip', 'Port forwarding is still required individually per machine for public play.')}</span>
                            </div>
                            <button
                                onClick={() => setShowGuide(false)}
                                className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 cursor-pointer"
                            >
                                {t('common.gotIt', 'Got It!')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
