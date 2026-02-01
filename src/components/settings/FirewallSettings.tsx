import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, RefreshCw, Check, X, AlertTriangle, Server, Wifi, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';

interface ServerFirewallStatus {
    serverId: number;
    serverName: string;
    gamePort: number;
    queryPort: number;
    rconPort: number;
    rconEnabled: boolean;
    gamePortStatus: 'open' | 'closed' | 'unknown';
    queryPortStatus: 'open' | 'closed' | 'unknown';
    rconPortStatus: 'open' | 'closed' | 'unknown';
}

interface FirewallOperationResult {
    success: boolean;
    message: string;
    requiresAdmin: boolean;
}

interface ManualPort {
    port: number;
    protocol: 'TCP' | 'UDP';
    description: string;
    status: 'open' | 'closed' | 'unknown' | 'checking';
}

function StatusBadge({ status }: { status: 'open' | 'closed' | 'unknown' }) {
    if (status === 'open') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                <Check className="w-3 h-3" />
                Open
            </span>
        );
    }
    if (status === 'closed') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                <X className="w-3 h-3" />
                Closed
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <AlertTriangle className="w-3 h-3" />
            Unknown
        </span>
    );
}

export default function FirewallSettings() {
    const [servers, setServers] = useState<ServerFirewallStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAssigning, setIsAssigning] = useState<number | 'all' | null>(null);

    // Manual port state
    const [manualPorts, setManualPorts] = useState<ManualPort[]>([]);
    const [newPort, setNewPort] = useState<string>('');
    const [newProtocol, setNewProtocol] = useState<'TCP' | 'UDP'>('UDP');
    const [newDescription, setNewDescription] = useState<string>('');
    const [isAddingPort, setIsAddingPort] = useState(false);

    const loadFirewallStatus = async () => {
        setIsLoading(true);
        try {
            const status = await invoke<ServerFirewallStatus[]>('get_all_servers_firewall_status');
            setServers(status);
        } catch (error) {
            console.error('Failed to load firewall status:', error);
            toast.error('Failed to load firewall status');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadFirewallStatus();
    }, []);

    const handleAssignPorts = async (serverId: number) => {
        setIsAssigning(serverId);
        try {
            const result = await invoke<FirewallOperationResult>('create_firewall_rules', { serverId });

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 5000 });
            } else if (result.success) {
                toast.success(result.message);
                await loadFirewallStatus();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to create firewall rules:', error);
            toast.error('Failed to create firewall rules');
        } finally {
            setIsAssigning(null);
        }
    };

    const handleAssignAllPorts = async () => {
        setIsAssigning('all');
        try {
            const result = await invoke<FirewallOperationResult>('create_all_firewall_rules');

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 5000 });
            } else if (result.success) {
                toast.success(result.message);
                await loadFirewallStatus();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to create firewall rules:', error);
            toast.error('Failed to create firewall rules');
        } finally {
            setIsAssigning(null);
        }
    };

    const handleRemovePorts = async (serverId: number) => {
        setIsAssigning(serverId);
        try {
            const result = await invoke<FirewallOperationResult>('remove_firewall_rules', { serverId });

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 5000 });
            } else if (result.success) {
                toast.success(result.message);
                await loadFirewallStatus();
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to remove firewall rules:', error);
            toast.error('Failed to remove firewall rules');
        } finally {
            setIsAssigning(null);
        }
    };

    const allPortsOpen = (server: ServerFirewallStatus) => {
        return server.gamePortStatus === 'open' &&
            server.queryPortStatus === 'open' &&
            (!server.rconEnabled || server.rconPortStatus === 'open');
    };

    // Manual port handlers
    const handleAddManualPort = async () => {
        const portNum = parseInt(newPort);
        if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
            toast.error('Please enter a valid port number (1-65535)');
            return;
        }

        // Check if port already exists in the list
        if (manualPorts.some(p => p.port === portNum && p.protocol === newProtocol)) {
            toast.error('This port/protocol combination is already in the list');
            return;
        }

        setIsAddingPort(true);
        try {
            const result = await invoke<FirewallOperationResult>('create_manual_firewall_rule', {
                port: portNum,
                protocol: newProtocol,
                description: newDescription || `Custom Port ${portNum}`
            });

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 5000 });
            } else if (result.success) {
                toast.success(result.message);
                // Add to list
                setManualPorts(prev => [...prev, {
                    port: portNum,
                    protocol: newProtocol,
                    description: newDescription || `Custom Port ${portNum}`,
                    status: 'open'
                }]);
                // Reset form
                setNewPort('');
                setNewDescription('');
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to create manual firewall rule:', error);
            toast.error('Failed to create firewall rule');
        } finally {
            setIsAddingPort(false);
        }
    };

    const handleRemoveManualPort = async (port: ManualPort) => {
        try {
            const result = await invoke<FirewallOperationResult>('remove_manual_firewall_rule', {
                port: port.port,
                protocol: port.protocol,
                description: port.description
            });

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 5000 });
            } else if (result.success) {
                toast.success(result.message);
                setManualPorts(prev => prev.filter(p => !(p.port === port.port && p.protocol === port.protocol)));
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to remove manual firewall rule:', error);
            toast.error('Failed to remove firewall rule');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="glass-panel rounded-2xl p-8">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-start space-x-4">
                        <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                            <Shield className="w-8 h-8 text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Firewall Automation</h2>
                            <p className="text-slate-400 mt-1">
                                Automatically configure Windows Firewall rules for your ARK servers
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={loadFirewallStatus}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                            Refresh
                        </button>
                        {servers.length > 0 && (
                            <button
                                onClick={handleAssignAllPorts}
                                disabled={isAssigning !== null}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                                    "bg-red-600 hover:bg-red-500 text-white",
                                    "disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                            >
                                {isAssigning === 'all' ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Assigning...
                                    </>
                                ) : (
                                    <>
                                        <Shield className="w-4 h-4" />
                                        Assign All Ports
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Info Banner */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-sm text-slate-300">
                            <p className="font-medium text-amber-400 mb-1">Administrator privileges required</p>
                            <p>Firewall rules can only be created when running the application as Administrator. Right-click the app and select "Run as administrator" if port assignment fails.</p>
                        </div>
                    </div>
                </div>

                {/* Server List */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                    </div>
                ) : servers.length === 0 ? (
                    <div className="text-center py-12">
                        <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No servers configured</p>
                        <p className="text-sm text-slate-500 mt-1">Create a server profile first to manage firewall rules</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Server</th>
                                    <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Game Port</th>
                                    <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Query Port</th>
                                    <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">RCON Port</th>
                                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {servers.map((server) => (
                                    <tr key={server.serverId} className="hover:bg-slate-800/50 transition-colors">
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "p-2 rounded-lg",
                                                    allPortsOpen(server)
                                                        ? "bg-green-500/10 text-green-400"
                                                        : "bg-slate-700 text-slate-400"
                                                )}>
                                                    <Wifi className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white">{server.serverName}</p>
                                                    <p className="text-xs text-slate-500">ID: {server.serverId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="font-mono text-sm text-slate-300">{server.gamePort}</span>
                                                <StatusBadge status={server.gamePortStatus} />
                                                <span className="text-[10px] text-slate-500">UDP</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="font-mono text-sm text-slate-300">{server.queryPort}</span>
                                                <StatusBadge status={server.queryPortStatus} />
                                                <span className="text-[10px] text-slate-500">UDP</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            {server.rconEnabled ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="font-mono text-sm text-slate-300">{server.rconPort}</span>
                                                    <StatusBadge status={server.rconPortStatus} />
                                                    <span className="text-[10px] text-slate-500">TCP</span>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-500">Disabled</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {allPortsOpen(server) ? (
                                                    <button
                                                        onClick={() => handleRemovePorts(server.serverId)}
                                                        disabled={isAssigning !== null}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        {isAssigning === server.serverId ? (
                                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <X className="w-3.5 h-3.5" />
                                                        )}
                                                        Remove
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAssignPorts(server.serverId)}
                                                        disabled={isAssigning !== null}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        {isAssigning === server.serverId ? (
                                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <Check className="w-3.5 h-3.5" />
                                                        )}
                                                        Assign
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Manual Port Assignment Section */}
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-emerald-400" />
                    Manual Port Assignment
                </h3>
                <p className="text-sm text-slate-400 mb-6">
                    Open custom ports for additional services, mods, or plugins that require specific network access.
                </p>

                {/* Add Port Form */}
                <div className="flex flex-wrap items-end gap-4 mb-6">
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs text-slate-400 mb-1.5">Port Number</label>
                        <input
                            type="number"
                            value={newPort}
                            onChange={(e) => setNewPort(e.target.value)}
                            placeholder="e.g. 8080"
                            min="1"
                            max="65535"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                        />
                    </div>
                    <div className="w-28">
                        <label className="block text-xs text-slate-400 mb-1.5">Protocol</label>
                        <select
                            value={newProtocol}
                            onChange={(e) => setNewProtocol(e.target.value as 'TCP' | 'UDP')}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500 transition-colors"
                        >
                            <option value="UDP">UDP</option>
                            <option value="TCP">TCP</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-slate-400 mb-1.5">Description (Optional)</label>
                        <input
                            type="text"
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            placeholder="e.g. Voice Chat Port"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                        />
                    </div>
                    <button
                        onClick={handleAddManualPort}
                        disabled={isAddingPort || !newPort}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAddingPort ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Plus className="w-4 h-4" />
                        )}
                        Add Port
                    </button>
                </div>

                {/* Manual Ports List */}
                {manualPorts.length > 0 && (
                    <div className="border-t border-slate-700 pt-4">
                        <h4 className="text-sm font-medium text-slate-300 mb-3">Custom Ports</h4>
                        <div className="space-y-2">
                            {manualPorts.map((port, index) => (
                                <div key={index} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono text-lg text-white">{port.port}</span>
                                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-700 text-slate-300">
                                            {port.protocol}
                                        </span>
                                        <span className="text-sm text-slate-400">{port.description}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <StatusBadge status={port.status === 'checking' ? 'unknown' : port.status} />
                                        <button
                                            onClick={() => handleRemoveManualPort(port)}
                                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                            title="Remove port"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Port Info Card */}
            <div className="glass-panel rounded-2xl p-6 border-dashed">
                <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                    <Wifi className="w-5 h-5 text-sky-400" />
                    About Firewall Ports
                </h3>
                <div className="space-y-2 text-sm text-slate-400">
                    <p>• <strong className="text-sky-400">Game Port (UDP)</strong>: Main connection port for players joining your server</p>
                    <p>• <strong className="text-violet-400">Query Port (UDP)</strong>: Used by Steam for server browser listing and queries</p>
                    <p>• <strong className="text-emerald-400">RCON Port (TCP)</strong>: Remote console access for server administration</p>
                    <p className="pt-2 text-slate-500">All ports must be open for your server to be visible and accessible to players.</p>
                </div>
            </div>
        </div>
    );
}
