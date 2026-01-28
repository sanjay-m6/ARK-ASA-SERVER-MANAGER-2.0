import { useState, useEffect, useRef } from 'react';
import { Plus, Play, Square, RotateCw, Trash2, Download, Settings, Terminal, Globe, Shield, ChevronDown, ChevronUp, Copy, AppWindow } from 'lucide-react';
import { useServerStore } from '../stores/serverStore';
import { cn } from '../utils/helpers';
import InstallServerDialog from '../components/server/InstallServerDialog';
import ImportServerDialog from '../components/server/ImportServerDialog';
import ImportNonDedicatedDialog from '../components/server/ImportNonDedicatedDialog';
import CloneOptionsModal from '../components/server/CloneOptionsModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { startServer, stopServer, restartServer, deleteServer, getAllServers, updateServer, startLogWatcher, cloneServer, transferSettings, extractSaveData, showServerConsole, hardcoreRetryMods, startServerNoMods, toggleServerAutomation } from '../utils/tauri';
import toast from 'react-hot-toast';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';

import { useNavigate } from 'react-router-dom';
import { Server } from '../types';

interface ServerLogEvent {
    server_id: number;
    line: string;
    is_stderr: boolean;
}

export default function ServerManager() {
    const navigate = useNavigate();
    const { servers, setServers, removeServer, updateServerStatus, refreshServers } = useServerStore();
    const [showInstallDialog, setShowInstallDialog] = useState(false);
    const [serverLogs, setServerLogs] = useState<Record<number, string[]>>({});
    const [expandedConsoles, setExpandedConsoles] = useState<Record<number, boolean>>({});
    const consoleRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const [appVersion, setAppVersion] = useState<string>('');
    const [cloneModalServer, setCloneModalServer] = useState<Server | null>(null);
    const [deleteConfirmServer, setDeleteConfirmServer] = useState<Server | null>(null);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [showNonDedicatedImport, setShowNonDedicatedImport] = useState(false);

    const handleDialogClose = async () => {
        setShowInstallDialog(false);
        setShowImportDialog(false);
        setShowNonDedicatedImport(false);
        await refreshServers();
    };

    const handleToggleAutomation = async (serverId: number, type: 'auto_start' | 'auto_stop' | 'intelligent_mode', current: boolean) => {
        try {
            await toggleServerAutomation(serverId, type, !current);
            const label = type === 'auto_start' ? 'Auto-Start' : type === 'auto_stop' ? 'Auto-Stop' : 'Intelligent Mode';
            toast.success(`${label} ${!current ? 'Enabled' : 'Disabled'}`);
            // Optimistic update
            const updatedServers = servers.map(s => {
                if (s.id === serverId) {
                    const key = type === 'auto_start' ? 'autoStart' : type === 'auto_stop' ? 'autoStop' : 'intelligentMode';
                    return {
                        ...s,
                        [key]: !current
                    };
                }
                return s;
            });
            setServers(updatedServers);
        } catch (error) {
            console.error('Failed to toggle automation:', error);
            toast.error(`Failed to toggle ${type}: ${error}`);
        }
    };


    useEffect(() => {
        // Fetch app version
        getVersion().then(setAppVersion).catch(() => setAppVersion('?.?.?'));

        // Initial fetch
        getAllServers().then(setServers).catch(console.error);

        // Subscribe to real-time status updates
        let unlistenStatus: () => void;
        import('@tauri-apps/api/event').then(async ({ listen }) => {
            unlistenStatus = await listen<{ server_id: number, status: any }>('server-status-change', (event) => {
                updateServerStatus(event.payload.server_id, event.payload.status);
            });
        });

        // Poll for updates (Heartbeat only - reduced frequency)
        const interval = setInterval(() => {
            getAllServers().then(setServers).catch(console.error);
        }, 30000);

        return () => {
            clearInterval(interval);
            if (unlistenStatus) unlistenStatus();
        };
    }, [setServers, updateServerStatus]);

    // Subscribe to server log events
    useEffect(() => {
        let unlisten: UnlistenFn | null = null;

        const setupListener = async () => {
            unlisten = await listen<ServerLogEvent>('server_log', (event) => {
                const { server_id, line } = event.payload;
                setServerLogs(prev => {
                    const logs = prev[server_id] || [];
                    const newLogs = [...logs, line].slice(-500); // Keep last 500 lines
                    return { ...prev, [server_id]: newLogs };
                });

                // Auto-scroll
                const consoleEl = consoleRefs.current[server_id];
                if (consoleEl) {
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }
            });
        };

        setupListener();
        return () => { unlisten?.(); };
    }, []);

    // Auto-start log watcher for running servers (for servers started before app opened)
    const [watchersStarted, setWatchersStarted] = useState<Record<number, boolean>>({});

    useEffect(() => {
        servers.forEach(server => {
            if (server.status === 'running' && !watchersStarted[server.id]) {
                setWatchersStarted(prev => ({ ...prev, [server.id]: true }));
                setExpandedConsoles(prev => ({ ...prev, [server.id]: true }));
                startLogWatcher(server.id, server.installPath).catch(console.error);
            }
        });
    }, [servers, watchersStarted]);

    const toggleConsole = (serverId: number) => {
        setExpandedConsoles(prev => ({ ...prev, [serverId]: !prev[serverId] }));
    };

    const handleStartServer = async (serverId: number) => {
        try {
            updateServerStatus(serverId, 'starting');
            setExpandedConsoles(prev => ({ ...prev, [serverId]: true })); // Auto-expand console
            setServerLogs(prev => ({ ...prev, [serverId]: [] })); // Clear old logs
            await startServer(serverId);
            updateServerStatus(serverId, 'running');
            toast.success('Server started successfully');
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(`Failed to start server: ${error}`);
        }
    };

    const handleStartServerNoMods = async (serverId: number) => {
        try {
            updateServerStatus(serverId, 'starting');
            setExpandedConsoles(prev => ({ ...prev, [serverId]: true }));
            setServerLogs(prev => ({ ...prev, [serverId]: [] }));
            await startServerNoMods(serverId);
            updateServerStatus(serverId, 'running');
            toast.success('Server started (without mods)');
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(`Failed to start server: ${error}`);
        }
    };

    const handleStopServer = async (serverId: number) => {
        try {
            await stopServer(serverId);
            updateServerStatus(serverId, 'stopped');
            // Clear logs and collapse console on stop
            setServerLogs(prev => ({ ...prev, [serverId]: [] }));
            setExpandedConsoles(prev => ({ ...prev, [serverId]: false }));
            toast.success('Server stopped successfully');
        } catch (error) {
            toast.error(`Failed to stop server: ${error}`);
        }
    };

    const handleRestartServer = async (serverId: number) => {
        try {
            updateServerStatus(serverId, 'starting');
            await restartServer(serverId);
            updateServerStatus(serverId, 'running');
            toast.success('Server restarted successfully');
        } catch (error) {
            toast.error(`Failed to restart server: ${error}`);
        }
    };

    const confirmDeleteServer = async () => {
        if (!deleteConfirmServer) return;
        try {
            await deleteServer(deleteConfirmServer.id);
            removeServer(deleteConfirmServer.id);
            toast.success('Server deleted successfully');
            setDeleteConfirmServer(null);
        } catch (error) {
            toast.error(`Failed to delete server: ${error}`);
        }
    };

    const handleUpdateServer = async (serverId: number) => {
        try {
            updateServerStatus(serverId, 'updating');
            await updateServer(serverId);
            toast.success('Server update initiated');
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(`Failed to update server: ${error}`);
        }
    };

    const handleShowConsole = async (serverId: number) => {
        try {
            await showServerConsole(serverId);
            toast.success('Console window request sent');
        } catch (error) {
            toast.error(`Failed to show console: ${error}`);
        }
    };

    const handleHardcoreRetry = async (serverId: number) => {
        try {
            if (!window.confirm("Deep Repair will stop the server, delete the mod cache (.temp folder), and force a fresh download. This may take longer than a normal restart. Continue?")) {
                return;
            }
            updateServerStatus(serverId, 'starting');
            setExpandedConsoles(prev => ({ ...prev, [serverId]: true }));
            await hardcoreRetryMods(serverId);
            updateServerStatus(serverId, 'running');
            toast.success('Deep repair initiated successfully');
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(`Deep repair failed: ${error}`);
        }
    };

    const openCloneModal = (server: Server) => {
        setCloneModalServer(server);
    };

    const handleCloneServer = async () => {
        if (!cloneModalServer) return;
        try {
            const newServer = await cloneServer(cloneModalServer.id);
            setServers([...servers, newServer]);
            toast.success(`Server cloned as "${newServer.name}"`);
        } catch (error) {
            toast.error(`Failed to clone server: ${error}`);
        }
    };

    const handleTransferSettings = async (targetServerId: number) => {
        if (!cloneModalServer) return;
        try {
            await transferSettings(cloneModalServer.id, targetServerId);
            toast.success('Settings transferred successfully');
        } catch (error) {
            toast.error(`Failed to transfer settings: ${error}`);
        }
    };

    const handleExtractData = async (targetServerId: number) => {
        if (!cloneModalServer) return;
        try {
            await extractSaveData(cloneModalServer.id, targetServerId);
            toast.success('Save data extracted successfully');
        } catch (error) {
            toast.error(`Failed to extract save data: ${error}`);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
                        Server Manager
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Deploy and manage your ARK instances</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowImportDialog(true)}
                        className="flex items-center space-x-2 px-5 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-all font-medium"
                    >
                        <Download className="w-5 h-5" />
                        <span>Import Existing</span>
                    </button>
                    <button
                        onClick={() => setShowNonDedicatedImport(true)}
                        className="flex items-center space-x-2 px-5 py-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl transition-all font-medium"
                    >
                        <Settings className="w-5 h-5" />
                        <span>Import Save</span>
                    </button>
                    <button
                        onClick={() => setShowInstallDialog(true)}
                        className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl transition-all shadow-lg shadow-sky-500/20 font-medium group"
                    >
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        <span>Deploy Server</span>
                    </button>
                </div>
            </div>

            {/* Server List */}
            {servers.length === 0 ? (
                <div className="glass-panel rounded-2xl p-16 text-center border-2 border-dashed border-slate-700/50">
                    <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Plus className="w-10 h-10 text-slate-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">No Servers Installed</h3>
                    <p className="text-slate-400 mb-8 max-w-md mx-auto">
                        Your server fleet is currently empty. Launch your first ARK server to begin your journey.
                    </p>
                    <button
                        onClick={() => setShowInstallDialog(true)}
                        className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors border border-slate-700"
                    >
                        Install Your First Server
                    </button>
                </div>
            ) : (
                <div className="grid gap-6">
                    {servers.map((server) => (
                        <div
                            key={server.id}
                            className="glass-panel rounded-2xl p-6 hover:border-sky-500/30 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-sky-500/5 to-transparent rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

                            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                {/* Server Info */}
                                <div className="flex items-start space-x-6">
                                    <div className="relative mt-1">
                                        <div className={cn(
                                            'w-4 h-4 rounded-full',
                                            server.status === 'running' && 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]',
                                            server.status === 'stopped' && 'bg-slate-500',
                                            server.status === 'crashed' && 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]',
                                            server.status === 'starting' && 'bg-yellow-500 animate-pulse',
                                            server.status === 'updating' && 'bg-blue-500 animate-pulse'
                                        )} />
                                        {server.status === 'running' && (
                                            <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                                        )}
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-xl font-bold text-white group-hover:text-sky-400 transition-colors">
                                                {server.name}
                                            </h3>
                                            <span className={cn(
                                                'px-2.5 py-0.5 rounded-md text-xs font-bold border',
                                                server.status === 'running' && 'bg-green-500/10 text-green-400 border-green-500/20',
                                                server.status === 'stopped' && 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                                                server.status === 'crashed' && 'bg-red-500/10 text-red-400 border-red-500/20',
                                                server.status === 'starting' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                                                server.status === 'updating' && 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                            )}>
                                                {server.status.toUpperCase()}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                                            <div className="flex items-center gap-1.5">
                                                <Globe className="w-4 h-4 text-slate-500" />
                                                <span>{server.config.mapName}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Terminal className="w-4 h-4 text-slate-500" />
                                                <span className="font-mono">Port {server.ports.gamePort}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Shield className="w-4 h-4 text-slate-500" />
                                                <span>v{appVersion}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-3">
                                    {server.status === 'stopped' || server.status === 'crashed' ? (
                                        <div className="relative group/start">
                                            <button
                                                onClick={() => handleStartServer(server.id)}
                                                className="p-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                                title="Start Server"
                                            >
                                                <Play className="w-5 h-5 fill-current" />
                                            </button>
                                            {/* Start Options Dropdown */}
                                            <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl opacity-0 invisible group-hover/start:opacity-100 group-hover/start:visible transition-all z-50 overflow-hidden">
                                                <button
                                                    onClick={() => handleStartServer(server.id)}
                                                    className="w-full text-left px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                                                >
                                                    <Play className="w-4 h-4" />
                                                    <span>Start</span>
                                                </button>
                                                <button
                                                    onClick={() => handleStartServerNoMods(server.id)}
                                                    className="w-full text-left px-4 py-3 hover:bg-yellow-500/10 text-yellow-400 hover:text-yellow-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                                                    title="Start without any mods for troubleshooting"
                                                >
                                                    <Shield className="w-4 h-4" />
                                                    <span>Start (No Mods)</span>
                                                </button>
                                            </div>
                                        </div>
                                    ) : server.status === 'running' ? (
                                        <button
                                            onClick={() => handleStopServer(server.id)}
                                            className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                            title="Stop Server"
                                        >
                                            <Square className="w-5 h-5 fill-current" />
                                        </button>
                                    ) : null}

                                    <div className="relative group/dropdown">
                                        <button
                                            disabled={server.status === 'stopped'}
                                            className="p-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                            title="Restart Options"
                                        >
                                            <RotateCw className="w-5 h-5" />
                                        </button>

                                        {/* Dropdown Menu */}
                                        <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all z-50 overflow-hidden">
                                            <button
                                                onClick={() => handleRestartServer(server.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                                            >
                                                <RotateCw className="w-4 h-4" />
                                                <span>Normal Restart</span>
                                            </button>
                                            <button
                                                onClick={() => handleHardcoreRetry(server.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                                                title="Stops server, clears mod cache, and restarts"
                                            >
                                                <Shield className="w-4 h-4" />
                                                <span>Deep Repair Mods</span>
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleShowConsole(server.id)}
                                        disabled={server.status === 'stopped'}
                                        className="p-2.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                        title="Show Server Console Window"
                                    >
                                        <AppWindow className="w-5 h-5" />
                                    </button>

                                    <div className="w-px h-8 bg-slate-700/50 mx-1"></div>

                                    <button
                                        onClick={() => handleUpdateServer(server.id)}
                                        className="p-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title="Update Server"
                                    >
                                        <Download className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => navigate('/config', { state: { serverId: server.id } })}
                                        className="p-2.5 bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/30 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title="Server Settings"
                                    >
                                        <Settings className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => openCloneModal(server)}
                                        className="p-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title="Clone / Transfer / Extract"
                                    >
                                        <Copy className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => setDeleteConfirmServer(server)}
                                        className="p-2.5 bg-slate-700/30 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-600/30 hover:border-red-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title="Delete Server"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Server Details Footer */}
                            <div className="mt-6 pt-4 border-t border-slate-700/30 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Install Path</p>
                                    <p className="text-slate-300 font-mono text-xs truncate" title={server.installPath}>{server.installPath}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Max Players</p>
                                    <p className="text-slate-300">{server.config.maxPlayers} Survivors</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Session Name</p>
                                    <p className="text-slate-300 truncate">{server.config.sessionName}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Connection</p>
                                    <p className="text-slate-300 font-mono text-xs">
                                        {server.ports.gamePort} / {server.ports.queryPort}
                                    </p>
                                </div>
                            </div>

                            {/* Automation Controls */}
                            <div className="mt-4 pt-4 border-t border-slate-700/30 flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Automation:</span>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer group/toggle">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.autoStart || false}
                                            onChange={() => handleToggleAutomation(server.id, 'auto_start', server.autoStart || false)}
                                        />
                                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                                    </div>
                                    <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">Auto-Start</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer group/toggle">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.autoStop || false}
                                            onChange={() => handleToggleAutomation(server.id, 'auto_stop', server.autoStop || false)}
                                        />
                                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">Auto-Stop</span>
                                        <span className="text-[10px] text-slate-500">On Config Change</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer group/toggle ml-auto lg:ml-0">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.intelligentMode || false}
                                            onChange={() => handleToggleAutomation(server.id, 'intelligent_mode', server.intelligentMode || false)}
                                        />
                                        <div className="w-10 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500 shadow-inner"></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <Shield className={cn("w-4 h-4 transition-colors", server.intelligentMode ? "text-sky-400" : "text-slate-500")} />
                                            <span className={cn("text-sm font-bold transition-colors", server.intelligentMode ? "text-sky-400" : "text-slate-400")}>Intelligent Mode</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500" title="Protects server during updates and save imports">Data Safety & Auto-Repair</span>
                                    </div>
                                </label>
                            </div>

                            {/* Embedded Console */}
                            {(expandedConsoles[server.id] || serverLogs[server.id]?.length > 0) && (
                                <div className="mt-4 border-t border-slate-700/30 pt-4">
                                    <button
                                        onClick={() => toggleConsole(server.id)}
                                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-sky-400 transition-colors mb-2"
                                    >
                                        <Terminal className="w-4 h-4" />
                                        <span>Console Output</span>
                                        {expandedConsoles[server.id] ? (
                                            <ChevronUp className="w-4 h-4" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4" />
                                        )}
                                    </button>

                                    {expandedConsoles[server.id] && (
                                        <div
                                            ref={el => { consoleRefs.current[server.id] = el; }}
                                            className="bg-slate-950 rounded-lg p-3 font-mono text-xs h-48 overflow-y-auto border border-slate-800"
                                        >
                                            {(serverLogs[server.id] || []).length === 0 ? (
                                                <p className="text-slate-500 italic">Waiting for server output...</p>
                                            ) : (
                                                (serverLogs[server.id] || []).map((line, idx) => {
                                                    // Enhanced color coding based on log content
                                                    let colorClass = "text-slate-300";
                                                    let prefixColor = "";

                                                    // Extract prefix if present (e.g., "CFCore", "None", "LogNet", etc.)
                                                    const colonIdx = line.indexOf(':');
                                                    const prefix = colonIdx > 0 && colonIdx < 30 ? line.substring(0, colonIdx).trim() : "";

                                                    // Error patterns - red
                                                    if (line.includes("Error") || line.includes("error") ||
                                                        line.includes("Failed") || line.includes("failed") ||
                                                        line.includes("Couldn't") || line.includes("No machine id")) {
                                                        colorClass = "text-red-400";
                                                    }
                                                    // Warning patterns - yellow
                                                    else if (line.includes("Warning") || line.includes("warning")) {
                                                        colorClass = "text-yellow-400";
                                                    }
                                                    // Success patterns - green
                                                    else if (line.includes("successfully") || line.includes("Success") ||
                                                        line.includes("Started") || line.includes("Initialized") ||
                                                        line.includes("Complete")) {
                                                        colorClass = "text-green-400";
                                                    }
                                                    // CFCore (mod system) - cyan
                                                    else if (prefix === "CFCore") {
                                                        prefixColor = "text-cyan-400";
                                                        colorClass = "text-cyan-300";
                                                    }
                                                    // Server status - purple
                                                    else if (line.includes("Server:") || line.includes("Status")) {
                                                        colorClass = "text-violet-400";
                                                    }
                                                    // Player activity - blue
                                                    else if (line.includes("Player") || line.includes("connected") ||
                                                        line.includes("joined") || line.includes("disconnected")) {
                                                        colorClass = "text-blue-400";
                                                    }
                                                    // Log prefixes
                                                    else if (prefix === "None") {
                                                        prefixColor = "text-slate-500";
                                                        colorClass = "text-slate-400";
                                                    }
                                                    else if (prefix === "LogNet" || prefix === "LogInit") {
                                                        prefixColor = "text-emerald-500";
                                                        colorClass = "text-emerald-300";
                                                    }

                                                    // Render with prefix highlighting
                                                    if (prefixColor && colonIdx > 0) {
                                                        return (
                                                            <div key={idx} className="py-0.5 hover:bg-slate-900/50">
                                                                <span className={prefixColor}>{line.substring(0, colonIdx + 1)}</span>
                                                                <span className={colorClass}>{line.substring(colonIdx + 1)}</span>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div key={idx} className={cn("py-0.5 hover:bg-slate-900/50", colorClass)}>
                                                            {line}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Install Server Dialog */}
            {showInstallDialog && (
                <InstallServerDialog onClose={handleDialogClose} />
            )}

            {/* Import Server Dialog */}
            {showImportDialog && (
                <ImportServerDialog onClose={handleDialogClose} />
            )}

            {/* Non-Dedicated Import Dialog */}
            {showNonDedicatedImport && (
                <ImportNonDedicatedDialog onClose={handleDialogClose} servers={servers} />
            )}

            {/* Clone Options Modal */}
            {cloneModalServer && (
                <CloneOptionsModal
                    isOpen={true}
                    onClose={() => setCloneModalServer(null)}
                    sourceServer={cloneModalServer}
                    allServers={servers}
                    onCloneServer={handleCloneServer}
                    onTransferSettings={handleTransferSettings}
                    onExtractData={handleExtractData}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={!!deleteConfirmServer}
                onClose={() => setDeleteConfirmServer(null)}
                onConfirm={confirmDeleteServer}
                title="Delete Server"
                message={`Are you sure you want to delete "${deleteConfirmServer?.name}"? This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
}
