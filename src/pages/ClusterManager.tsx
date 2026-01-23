import { useState, useEffect } from 'react';
import { Plus, Server as ServerIcon, Network, Trash2, Loader2, Link as LinkIcon, Play, Square } from 'lucide-react';
import { cn } from '../utils/helpers';
import { createCluster, getClusters, deleteCluster, startCluster, stopCluster } from '../utils/tauri';
import { Cluster, Server } from '../types';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { listen } from '@tauri-apps/api/event';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export default function ClusterManager() {
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newClusterName, setNewClusterName] = useState('');
    const [selectedServers, setSelectedServers] = useState<number[]>([]);
    const [startingCluster, setStartingCluster] = useState<number | null>(null);
    const [stoppingCluster, setStoppingCluster] = useState<number | null>(null);
    const { servers, refreshServers } = useServerStore();

    const fetchClusters = async () => {
        setIsLoading(true);
        try {
            const data = await getClusters();
            setClusters(data);
        } catch (error) {
            console.error('Failed to fetch clusters:', error);
            toast.error('Failed to fetch clusters');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchClusters();

        // Listen for server status changes to update cluster view in realtime
        const unlisten = listen('server_status_update', () => {
            refreshServers();
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [refreshServers]);

    const handleCreateCluster = async () => {
        if (!newClusterName.trim()) {
            toast.error('Cluster name is required');
            return;
        }
        if (selectedServers.length < 2) {
            toast.error('Select at least 2 servers for a cluster');
            return;
        }

        try {
            await createCluster(newClusterName, selectedServers);
            toast.success('Cluster created successfully');
            setNewClusterName('');
            setSelectedServers([]);
            setIsCreating(false);
            fetchClusters();
        } catch (error) {
            console.error('Failed to create cluster:', error);
            toast.error('Failed to create cluster');
        }
    };

    const [deleteConfirmCluster, setDeleteConfirmCluster] = useState<Cluster | null>(null);

    const confirmDeleteCluster = async () => {
        if (!deleteConfirmCluster) return;
        try {
            await deleteCluster(deleteConfirmCluster.id);
            toast.success('Cluster deleted');
            setDeleteConfirmCluster(null);
            fetchClusters();
        } catch (error) {
            console.error('Failed to delete cluster:', error);
            toast.error('Failed to delete cluster');
        }
    };

    const handleStartCluster = async (clusterId: number) => {
        setStartingCluster(clusterId);
        try {
            await startCluster(clusterId);
            toast.success('Starting all servers in cluster');
            refreshServers();
        } catch (error) {
            console.error('Failed to start cluster:', error);
            toast.error('Failed to start cluster');
        } finally {
            setStartingCluster(null);
        }
    };

    const handleStopCluster = async (clusterId: number) => {
        setStoppingCluster(clusterId);
        try {
            await stopCluster(clusterId);
            toast.success('Stopping all servers in cluster');
            refreshServers();
        } catch (error) {
            console.error('Failed to stop cluster:', error);
            toast.error('Failed to stop cluster');
        } finally {
            setStoppingCluster(null);
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

    const getClusterRunningCount = (cluster: Cluster): number => {
        return cluster.serverIds.filter(id => {
            const server = getServerStatus(id);
            return server?.status === 'running';
        }).length;
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-rose-400">
                        Cluster Manager
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Link servers for cross-ARK travel</p>
                </div>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center space-x-2 px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors shadow-lg shadow-pink-500/20 font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Create Cluster</span>
                    </button>
                )}
            </div>

            {/* Create Cluster Form */}
            {isCreating && (
                <div className="glass-panel rounded-2xl p-6 border-pink-500/30 shadow-lg shadow-pink-500/10">
                    <h3 className="text-xl font-semibold text-white mb-4">New Cluster Configuration</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">Cluster Name</label>
                            <input
                                type="text"
                                value={newClusterName}
                                onChange={(e) => setNewClusterName(e.target.value)}
                                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                                placeholder="My Awesome Cluster"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">Select Servers to Link</label>
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
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateCluster}
                                className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors shadow-lg shadow-pink-500/20 font-medium"
                            >
                                Create Cluster
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
                        <h3 className="text-xl font-semibold text-slate-300">No Clusters Active</h3>
                        <p className="text-slate-500 mt-2">Create a cluster to enable cross-server travel</p>
                    </div>
                ) : (
                    clusters.map(cluster => (
                        <div key={cluster.id} className="glass-panel rounded-2xl p-6 relative group">
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => setDeleteConfirmCluster(cluster)}
                                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
                                            {getClusterRunningCount(cluster)}/{cluster.serverIds.length} Running
                                        </span>
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
                                        <span>Start All</span>
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
                                        <span>Stop All</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                <div className="flex items-center justify-center space-x-4 flex-wrap gap-y-4">
                                    {cluster.serverIds.map((serverId, index) => {
                                        const server = getServerStatus(serverId);
                                        const isRunning = server?.status === 'running';
                                        const isStarting = server?.status === 'starting';
                                        return (
                                            <div key={serverId} className="flex items-center">
                                                {index > 0 && (
                                                    <div className="h-0.5 w-8 bg-slate-600 mx-2 relative">
                                                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-slate-800 p-0.5 rounded-full border border-slate-600">
                                                            <LinkIcon className="w-2 h-2 text-slate-400" />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex flex-col items-center">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-lg border flex items-center justify-center mb-2 relative",
                                                        isRunning ? "bg-emerald-500/20 border-emerald-500/50" :
                                                            isStarting ? "bg-amber-500/20 border-amber-500/50" :
                                                                "bg-slate-800 border-slate-600"
                                                    )}>
                                                        <ServerIcon className={cn(
                                                            "w-5 h-5",
                                                            isRunning ? "text-emerald-400" :
                                                                isStarting ? "text-amber-400" :
                                                                    "text-slate-400"
                                                        )} />
                                                        {/* Status indicator dot */}
                                                        <div className={cn(
                                                            "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900",
                                                            isRunning ? "bg-emerald-400" :
                                                                isStarting ? "bg-amber-400 animate-pulse" :
                                                                    "bg-slate-600"
                                                        )} />
                                                    </div>
                                                    <span className="text-xs text-slate-300 font-medium max-w-[80px] truncate">
                                                        {server?.name || `Server ${serverId}`}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!deleteConfirmCluster}
                onClose={() => setDeleteConfirmCluster(null)}
                onConfirm={confirmDeleteCluster}
                title="Delete Cluster"
                message={`Are you sure you want to delete "${deleteConfirmCluster?.name}"? This will unlink all servers from this cluster.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
}
