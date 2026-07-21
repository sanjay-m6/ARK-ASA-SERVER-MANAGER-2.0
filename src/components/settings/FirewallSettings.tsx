import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, RefreshCw, Check, AlertTriangle, Server, Wifi, Plus, Trash2, ShieldCheck, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';
import { useTranslation } from 'react-i18next';

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
    peerPort?: number;
    peerPortStatus?: 'open' | 'closed' | 'unknown';
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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/20">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                Configured
            </span>
        );
    }
    if (status === 'closed') {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <Shield className="w-3.5 h-3.5" />
                Not Configured
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-white/10">
            <AlertTriangle className="w-3.5 h-3.5" />
            Unknown
        </span>
    );
}

export default function FirewallSettings({ mode = 'asa' }: { mode?: 'asa' | 'ase' }) {
    const { t } = useTranslation();
    const [servers, setServers] = useState<ServerFirewallStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAssigning, setIsAssigning] = useState<number | 'all' | null>(null);

    // Manual port state
    const [manualPorts, setManualPorts] = useState<ManualPort[]>([]);
    const [newPort, setNewPort] = useState<string>('');
    const [newProtocol, setNewProtocol] = useState<'TCP' | 'UDP' | 'BOTH'>('UDP');
    const [newDescription, setNewDescription] = useState<string>('');
    const [isAddingPort, setIsAddingPort] = useState(false);

    const loadFirewallStatus = async (silent: boolean = false) => {
        if (!silent) setIsLoading(true);
        try {
            const status = await invoke<ServerFirewallStatus[]>(
                mode === 'ase' ? 'get_all_ase_servers_firewall_status' : 'get_all_servers_firewall_status'
            );
            setServers(status);
        } catch (error) {
            console.error('Failed to load firewall status:', error);
            if (!silent) {
                toast.error(t('settings.firewallAutomation.messages.loadFailed', 'Failed to load firewall status.'));
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    // Real-time synchronization
    useEffect(() => {
        loadFirewallStatus();

        // 1. Listen for port update custom events dispatched anywhere in the app
        const handleStatusUpdate = () => loadFirewallStatus(true);
        window.addEventListener('firewall-status-updated', handleStatusUpdate);
        window.addEventListener('focus', handleStatusUpdate);

        // 2. Poll every 5 seconds while mounted for real-time reactivity
        const interval = setInterval(() => {
            loadFirewallStatus(true);
        }, 5000);

        return () => {
            window.removeEventListener('firewall-status-updated', handleStatusUpdate);
            window.removeEventListener('focus', handleStatusUpdate);
            clearInterval(interval);
        };
    }, [mode]);

    const handleAssignPorts = async (serverId: number) => {
        setIsAssigning(serverId);
        try {
            const result = await invoke<FirewallOperationResult>(
                mode === 'ase' ? 'create_ase_firewall_rules' : 'create_firewall_rules',
                { serverId }
            );

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 6000 });
            } else if (result.success) {
                toast.success(result.message);
                await loadFirewallStatus(true);
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to create firewall rules:', error);
            toast.error(t('settings.firewallAutomation.messages.createFailed', 'Failed to create firewall rules.'));
        } finally {
            setIsAssigning(null);
        }
    };

    const handleAssignAllPorts = async () => {
        setIsAssigning('all');
        try {
            const result = await invoke<FirewallOperationResult>(
                mode === 'ase' ? 'create_all_ase_firewall_rules' : 'create_all_firewall_rules'
            );

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 6000 });
            } else if (result.success) {
                toast.success(result.message);
                await loadFirewallStatus(true);
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to create firewall rules:', error);
            toast.error(t('settings.firewallAutomation.messages.createFailed', 'Failed to create firewall rules.'));
        } finally {
            setIsAssigning(null);
        }
    };

    const handleRemovePorts = async (serverId: number) => {
        setIsAssigning(serverId);
        try {
            const result = await invoke<FirewallOperationResult>(
                mode === 'ase' ? 'remove_ase_firewall_rules' : 'remove_firewall_rules',
                { serverId }
            );

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 6000 });
            } else if (result.success) {
                toast.success(result.message);
                await loadFirewallStatus(true);
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to remove firewall rules:', error);
            toast.error(t('settings.firewallAutomation.messages.removeFailed', 'Failed to remove firewall rules.'));
        } finally {
            setIsAssigning(null);
        }
    };

    const allPortsOpen = (server: ServerFirewallStatus) => {
        return (
            server.gamePortStatus === 'open' &&
            server.queryPortStatus === 'open' &&
            (!server.peerPort || server.peerPortStatus === 'open') &&
            (!server.rconEnabled || server.rconPortStatus === 'open')
        );
    };

    const fullyConfiguredCount = servers.filter(allPortsOpen).length;
    const missingCount = servers.length - fullyConfiguredCount;

    // Manual port handlers
    const handleAddManualPort = async () => {
        const portNum = parseInt(newPort);
        if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
            toast.error(t('settings.firewallAutomation.messages.invalidPort', 'Invalid port number.'));
            return;
        }

        if (manualPorts.some((p) => p.port === portNum && p.protocol === newProtocol)) {
            toast.error(t('settings.firewallAutomation.messages.duplicatePort', 'Port already exists in the list.'));
            return;
        }

        setIsAddingPort(true);
        try {
            const result = await invoke<FirewallOperationResult>('create_manual_firewall_rule', {
                port: portNum,
                protocol: newProtocol,
                description: newDescription || `Custom Port ${portNum}`,
            });

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 6000 });
            } else if (result.success) {
                toast.success(result.message);
                if (newProtocol === 'BOTH') {
                    setManualPorts((prev) => [
                        ...prev,
                        {
                            port: portNum,
                            protocol: 'TCP',
                            description: newDescription || `Custom Port ${portNum}`,
                            status: 'open',
                        },
                        {
                            port: portNum,
                            protocol: 'UDP',
                            description: newDescription || `Custom Port ${portNum}`,
                            status: 'open',
                        },
                    ]);
                } else {
                    setManualPorts((prev) => [
                        ...prev,
                        {
                            port: portNum,
                            protocol: newProtocol as 'TCP' | 'UDP',
                            description: newDescription || `Custom Port ${portNum}`,
                            status: 'open',
                        },
                    ]);
                }
                setNewPort('');
                setNewDescription('');
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to create manual firewall rule:', error);
            toast.error(t('settings.firewallAutomation.messages.manualCreateFailed', 'Failed to create manual firewall rule.'));
        } finally {
            setIsAddingPort(false);
        }
    };

    const handleRemoveManualPort = async (port: ManualPort) => {
        try {
            const result = await invoke<FirewallOperationResult>('remove_manual_firewall_rule', {
                port: port.port,
                protocol: port.protocol,
                description: port.description,
            });

            if (result.requiresAdmin) {
                toast.error(result.message, { duration: 6000 });
            } else if (result.success) {
                toast.success(result.message);
                setManualPorts((prev) => prev.filter((p) => !(p.port === port.port && p.protocol === port.protocol)));
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Failed to remove manual firewall rule:', error);
            toast.error(t('settings.firewallAutomation.messages.manualRemoveFailed', 'Failed to remove manual firewall rule.'));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
                    <div className="flex items-start space-x-4">
                        <div className="p-3.5 bg-gradient-to-br from-emerald-500/20 to-sky-500/20 rounded-2xl border border-emerald-500/30 shadow-lg shadow-emerald-500/10 shrink-0">
                            <ShieldCheck className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-bold text-white tracking-wide">
                                    {t('settings.firewallAutomation.title', 'Firewall Automation')}
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    Real-time Sync Active
                                </span>
                            </div>
                            <p className="text-slate-400 mt-1 text-sm leading-relaxed">
                                {mode === 'ase'
                                    ? t('settings.firewallAutomation.descriptionEvolved', 'Manage Windows Defender Firewall rules for your ARK: Survival Evolved servers.')
                                    : t('settings.firewallAutomation.description', 'Manage Windows Defender Firewall rules for your ARK: Survival Ascended servers.')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={() => loadFirewallStatus()}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition-all border border-white/10 text-xs font-semibold disabled:opacity-50 shadow-md"
                        >
                            <RefreshCw className={cn("w-4 h-4 text-sky-400", isLoading && "animate-spin")} />
                            <span>{t('settings.firewallAutomation.refresh', 'Refresh')}</span>
                        </button>
                        {servers.length > 0 && (
                            <button
                                onClick={handleAssignAllPorts}
                                disabled={isAssigning !== null}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg",
                                    missingCount === 0
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                                        : "bg-gradient-to-r from-sky-500 to-emerald-600 hover:from-sky-400 hover:to-emerald-500 text-white shadow-sky-500/20 hover:scale-105 active:scale-95",
                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                )}
                            >
                                {isAssigning === 'all' ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                        <span>{t('settings.firewallAutomation.assigning', 'Assigning All Ports...')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4 fill-current" />
                                        <span>{missingCount === 0 ? 'Re-Sync All Ports' : 'Assign All Ports'}</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Summary Metrics Bar */}
                {servers.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 flex items-center justify-between">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Servers</div>
                            <div className="text-lg font-bold font-mono text-white">{servers.length}</div>
                        </div>
                        <div className="bg-slate-950/60 p-4 rounded-xl border border-emerald-500/20 flex items-center justify-between">
                            <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Check className="w-4 h-4 stroke-[3]" />
                                Fully Configured
                            </div>
                            <div className="text-lg font-bold font-mono text-emerald-400">{fullyConfiguredCount}</div>
                        </div>
                        <div className="bg-slate-950/60 p-4 rounded-xl border border-amber-500/20 flex items-center justify-between">
                            <div className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4" />
                                Action Required
                            </div>
                            <div className="text-lg font-bold font-mono text-amber-400">{missingCount}</div>
                        </div>
                    </div>
                )}

                {/* Admin Info Banner */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-sm text-slate-300">
                            <p className="font-bold text-amber-400 mb-0.5">{t('settings.firewallAutomation.adminRequired', 'Administrator Privileges Required')}</p>
                            <p className="text-xs text-slate-400">{t('settings.firewallAutomation.adminRequiredDesc', 'Modifying firewall rules requires running as Administrator. Right-click app and select "Run as administrator" if port assignment fails.')}</p>
                        </div>
                    </div>
                </div>

                {/* Server List Table */}
                {isLoading ? (
                    <div className="flex justify-center py-16">
                        <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                    </div>
                ) : servers.length === 0 ? (
                    <div className="text-center py-16 bg-slate-950/40 rounded-xl border border-white/5">
                        <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-300 font-medium">{t('settings.firewallAutomation.noServers', 'No servers found')}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('settings.firewallAutomation.createProfile', 'Create a server profile first to manage its firewall rules.')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/50">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 bg-slate-900/90 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                    <th className="py-3.5 px-4">{t('settings.firewallAutomation.headers.server', 'Server')}</th>
                                    <th className="py-3.5 px-4 text-center">{t('settings.firewallAutomation.headers.gamePort', 'Game Port')}</th>
                                    <th className="py-3.5 px-4 text-center">{t('settings.firewallAutomation.headers.peerPort', 'Peer Port')}</th>
                                    <th className="py-3.5 px-4 text-center">{t('settings.firewallAutomation.headers.queryPort', 'Query Port')}</th>
                                    <th className="py-3.5 px-4 text-center">{t('settings.firewallAutomation.headers.rconPort', 'RCON Port')}</th>
                                    <th className="py-3.5 px-4 text-right">{t('settings.firewallAutomation.headers.actions', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-xs">
                                {servers.map((server) => {
                                    const isOpen = allPortsOpen(server);
                                    return (
                                        <tr key={server.serverId} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "p-2.5 rounded-xl border shrink-0",
                                                        isOpen
                                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10"
                                                            : "bg-slate-800 border-white/5 text-slate-400"
                                                    )}>
                                                        <Wifi className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white text-sm">{server.serverName}</p>
                                                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">ID: {server.serverId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="font-mono font-bold text-sm text-white">{server.gamePort}</span>
                                                    <StatusBadge status={server.gamePortStatus} />
                                                    <span className="text-[10px] text-slate-500 font-mono">UDP</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                {server.peerPort ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="font-mono font-bold text-sm text-white">{server.peerPort}</span>
                                                        <StatusBadge status={server.peerPortStatus || 'unknown'} />
                                                        <span className="text-[10px] text-slate-500 font-mono">UDP</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500 font-mono">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="font-mono font-bold text-sm text-white">{server.queryPort}</span>
                                                    <StatusBadge status={server.queryPortStatus} />
                                                    <span className="text-[10px] text-slate-500 font-mono">UDP</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                {server.rconEnabled ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="font-mono font-bold text-sm text-white">{server.rconPort}</span>
                                                        <StatusBadge status={server.rconPortStatus} />
                                                        <span className="text-[10px] text-slate-500 font-mono">TCP</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500 text-[11px]">Disabled</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {isOpen ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10">
                                                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                                Configured
                                                            </span>
                                                            <button
                                                                onClick={() => handleRemovePorts(server.serverId)}
                                                                disabled={isAssigning !== null}
                                                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all border border-white/5 hover:border-red-500/20 disabled:opacity-50"
                                                                title="Remove firewall rules"
                                                            >
                                                                {isAssigning === server.serverId ? (
                                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Trash2 className="w-4 h-4" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleAssignPorts(server.serverId)}
                                                            disabled={isAssigning !== null}
                                                            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-sky-500 to-emerald-600 hover:from-sky-400 hover:to-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-sky-500/20 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:transform-none"
                                                        >
                                                            {isAssigning === server.serverId ? (
                                                                <>
                                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                    <span>Assigning...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                                    <span>Assign Ports</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Manual Port Assignment Section */}
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-emerald-400" />
                    {t('settings.firewallAutomation.manual.title', 'Manual Port Assignment')}
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                    {t('settings.firewallAutomation.manual.description', 'Manually open specific ports in the Windows Firewall for additional services.')}
                </p>

                {/* Add Port Form */}
                <div className="flex flex-wrap items-end gap-4 mb-6">
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs text-slate-400 mb-1.5">{t('settings.firewallAutomation.manual.portNumber', 'Port Number')}</label>
                        <input
                            type="number"
                            value={newPort}
                            onChange={(e) => setNewPort(e.target.value)}
                            placeholder="e.g. 8080"
                            min="1"
                            max="65535"
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                        />
                    </div>
                    <div className="w-28">
                        <label className="block text-xs text-slate-400 mb-1.5">{t('settings.firewallAutomation.manual.protocol', 'Protocol')}</label>
                        <select
                            value={newProtocol}
                            onChange={(e) => setNewProtocol(e.target.value as 'TCP' | 'UDP' | 'BOTH')}
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-sky-500 transition-colors"
                        >
                            <option value="UDP">UDP</option>
                            <option value="TCP">TCP</option>
                            <option value="BOTH">BOTH</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-slate-400 mb-1.5">{t('settings.firewallAutomation.manual.descriptionLabel', 'Description')}</label>
                        <input
                            type="text"
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            placeholder="Custom Service Port"
                            className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white text-xs placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                        />
                    </div>
                    <button
                        onClick={handleAddManualPort}
                        disabled={isAddingPort || !newPort}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
                    >
                        {isAddingPort ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Plus className="w-4 h-4" />
                        )}
                        <span>Add Port</span>
                    </button>
                </div>

                {/* Manual Ports List */}
                {manualPorts.length > 0 && (
                    <div className="border-t border-white/10 pt-4">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Custom Manual Ports</h4>
                        <div className="space-y-2">
                            {manualPorts.map((port, index) => (
                                <div key={index} className="flex items-center justify-between p-3.5 bg-slate-950/60 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono text-base font-bold text-white">{port.port}</span>
                                        <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-sky-400 border border-white/10">
                                            {port.protocol}
                                        </span>
                                        <span className="text-xs text-slate-400">{port.description}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <StatusBadge status={port.status === 'checking' ? 'unknown' : port.status} />
                                        <button
                                            onClick={() => handleRemoveManualPort(port)}
                                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                            title="Remove Rule"
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
        </div>
    );
}
