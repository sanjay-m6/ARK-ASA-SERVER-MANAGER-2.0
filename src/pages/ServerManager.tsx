import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Plus, Play, Square, RotateCw, Trash2, Download, Settings, Terminal, Globe, Shield,
    ChevronDown, ChevronUp, Copy, AppWindow, RefreshCw,
    Check, XCircle
} from 'lucide-react';
import { useServerStore } from '../stores/serverStore';
import { cn } from '../utils/helpers';
import InstallServerDialog from '../components/server/InstallServerDialog';
import ImportServerDialog from '../components/server/ImportServerDialog';
import ImportNonDedicatedDialog from '../components/server/ImportNonDedicatedDialog';
import CloneOptionsModal from '../components/server/CloneOptionsModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PortConflictModal from '../components/server/PortConflictModal';

import { startServer, stopServer, restartServer, deleteServer, updateServer, getServerLogs, cloneServer, transferSettings, extractSaveData, showServerConsole, hardcoreRetryMods, startServerNoMods, toggleServerAutomation, checkPortConflicts, ConflictCheckResult } from '../utils/tauri';
import toast from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';

import { useNavigate } from 'react-router-dom';
import { Server, ServerStartupProgressEvent } from '../types';

interface ServerLogEvent {
    server_id: number;
    line: string;
    is_stderr: boolean;
}

export default function ServerManager() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { servers, setServers, removeServer, updateServerStatus, refreshServers } = useServerStore();
    const [showInstallDialog, setShowInstallDialog] = useState(false);
    const [serverLogs, setServerLogs] = useState<Record<number, string[]>>({});
    const [expandedConsoles, setExpandedConsoles] = useState<Record<number, boolean>>({});
    const consoleRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const [appVersion] = useState<string>('2.2.6');
    const [cloneModalServer, setCloneModalServer] = useState<Server | null>(null);
    const [deleteConfirmServer, setDeleteConfirmServer] = useState<Server | null>(null);
    const [forceStopServerId, setForceStopServerId] = useState<number | null>(null);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [showNonDedicatedImport, setShowNonDedicatedImport] = useState(false);
    const [updateOnStart, setUpdateOnStart] = useState(false);
    const [selectedServers, setSelectedServers] = useState<number[]>([]);

    // Baseline: number of log lines at server start, so we only detect startup in NEW lines
    const [logBaseline, setLogBaseline] = useState<Record<number, number>>({});

    // Startup Progress State
    const [startupProgress, setStartupProgress] = useState<Record<number, { elapsed: number, confirmed: boolean }>>({});

    // Port Conflict State
    const [showConflictModal, setShowConflictModal] = useState(false);
    const [conflictResult, setConflictResult] = useState<ConflictCheckResult | null>(null);
    const [pendingStartParams, setPendingStartParams] = useState<{ id: number, noMods: boolean } | null>(null);

    const checkPortsBeforeStart = async (serverId: number): Promise<boolean> => {
        try {
            const result = await checkPortConflicts(serverId);
            if (result.has_active_conflicts || result.has_inactive_conflicts) {
                setConflictResult(result);
                setShowConflictModal(true);
                return false;
            }
            return true;
        } catch (error) {
            console.error("Failed to check port conflicts:", error);
            // If check fails, proceed anyway and let backend handle errors
            return true;
        }
    };

    // Helper to format elapsed time
    const formatElapsedTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs} s`;
    };

    const handleForceStop = (serverId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setForceStopServerId(serverId);
    };

    const confirmForceStop = async () => {
        if (forceStopServerId === null) return;
        try {
            await stopServer(forceStopServerId);
            toast.success(t('serverManager.serverStopped'));
            refreshServers();
        } catch (error) {
            toast.error(t('serverManager.stopFailed', { error }));
        } finally {
            setForceStopServerId(null);
        }
    };




    const handleDialogClose = async () => {
        setShowInstallDialog(false);
        setShowImportDialog(false);
        setShowNonDedicatedImport(false);
        await refreshServers();
    };

    const handleToggleAutomation = async (serverId: number, type: 'auto_start' | 'auto_stop' | 'intelligent_mode', current: boolean) => {
        try {
            await toggleServerAutomation(serverId, type, !current);
            await toggleServerAutomation(serverId, type, !current);
            toast.success(current ? t('serverManager.automationDisabled') : t('serverManager.automationEnabled'));
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
            toast.error(t('serverManager.automationFailed', { error }));
        }
    };


    useEffect(() => {
        let unlistenStatus: (() => void) | undefined;
        let unlistenProgress: (() => void) | undefined;
        let isMounted = true;

        const setupListeners = async () => {
            // Listen for startup progress events
            const u1 = await listen<ServerStartupProgressEvent>('server-startup-progress', (event) => {
                if (!isMounted) return;
                setStartupProgress(prev => ({
                    ...prev,
                    [event.payload.server_id]: {
                        elapsed: event.payload.elapsed_seconds,
                        confirmed: event.payload.startup_confirmed
                    }
                }));
            });
            if (!isMounted) {
                u1();
            } else {
                unlistenProgress = u1;
            }

            const u2 = await listen<{ server_id: number, status: any }>('server-status-change', (event) => {
                if (!isMounted) return;
                const { server_id, status } = event.payload;

                // If timed out, show error toast
                if (status === 'startup_timeout') {
                    toast.error(t('serverManager.startupTimeout'));
                    setStartupProgress(prev => {
                        const newProgress = { ...prev };
                        delete newProgress[server_id];
                        return newProgress;
                    });
                } else if (status === 'online' || status === 'stopped' || status === 'crashed') {
                    // Clear progress on final states
                    setStartupProgress(prev => {
                        const newProgress = { ...prev };
                        delete newProgress[server_id];
                        return newProgress;
                    });
                }

                updateServerStatus(server_id, status);

                // Refresh list to ensure UI is in sync
                refreshServers();
            });
            if (!isMounted) {
                u2();
            } else {
                unlistenStatus = u2;
            }
        };

        setupListeners();

        // Initial fetch
        refreshServers();

        // Poll for updates (heartbeat)
        const interval = setInterval(refreshServers, 3000);

        return () => {
            isMounted = false;
            if (unlistenStatus) unlistenStatus();
            if (unlistenProgress) unlistenProgress();
            clearInterval(interval);
        };
    }, [setServers, updateServerStatus, refreshServers, t]);

    // Subscribe to server log events
    useEffect(() => {
        let unlisten: Function | undefined;
        let isMounted = true;

        listen<ServerLogEvent>('server_log', (event) => {
            if (!isMounted) return;
            const { server_id, line } = event.payload;

            setServerLogs(prev => {
                const logs = prev[server_id] || [];
                // Deduplicate explicitly to be safe: check if last log line is identical
                if (logs.length > 0 && logs[logs.length - 1] === line) {
                    return prev;
                }
                const newLogs = [...logs, line].slice(-500); // Keep last 500 lines
                return { ...prev, [server_id]: newLogs };
            });

            // Failsafe: If log indicates startup, force UI to update status
            const lowerLine = line.toLowerCase();
            // STRICTER CHECK per user request: Only "advertising for join" confirms online
            if (lowerLine.includes('advertising for join')) {
                console.log(`[Frontend] Detected startup log for server ${server_id}, forcing ONLINE status.`);
                updateServerStatus(server_id, 'online');
                // Trigger a refresh to sync with backend DB (which should also be updated by now)
                setTimeout(() => refreshServers(), 1000);
            }

            // Auto-scroll logic needs to run after render, but we can try here
            setTimeout(() => {
                const consoleEl = consoleRefs.current[server_id];
                if (consoleEl) {
                    consoleEl.scrollTop = consoleEl.scrollHeight;
                }
            }, 0);

        }).then((unlistenFn) => {
            if (!isMounted) {
                unlistenFn();
            } else {
                unlisten = unlistenFn;
            }
        });

        return () => {
            isMounted = false;
            if (unlisten) unlisten();
        };
    }, []);

    // Fetch initial logs for running servers
    const [logsFetched, setLogsFetched] = useState<Record<number, boolean>>({});

    useEffect(() => {
        servers.forEach(server => {
            if ((server.status === 'running' || server.status === 'online' || server.status === 'starting') && !logsFetched[server.id]) {
                setLogsFetched(prev => ({ ...prev, [server.id]: true }));
                setExpandedConsoles(prev => ({ ...prev, [server.id]: true }));

                getServerLogs(server.id, server.installPath)
                    .then(logEvents => {
                        // FIX: Extract 'line' from ServerLogEvent objects
                        const logLines = logEvents.map((e: any) => e.line);
                        setServerLogs(prev => ({
                            ...prev,
                            [server.id]: logLines
                        }));

                        // If we started this server THIS session, record current line count as baseline
                        // so the poll only checks NEW lines. If no baseline exists, the server was
                        // already running from DB — check ALL lines for startup.
                        if (logBaseline[server.id] !== undefined) {
                            // Baseline already set by handleStartServer — update to actual line count
                            setLogBaseline(prev => ({
                                ...prev,
                                [server.id]: logLines.length
                            }));
                        } else if (server.status === 'running' || server.status === 'starting') {
                            // Server loaded as 'running' from DB — check all lines now
                            const hasStartupLine = logLines.some((line: string) =>
                                line.toLowerCase().includes('advertising for join')
                            );
                            if (hasStartupLine) {
                                console.log(`[Frontend] Initial fetch detected online for server ${server.id} (already running from DB)`);
                                updateServerStatus(server.id, 'online');
                            }
                        }

                        // Auto-scroll
                        setTimeout(() => {
                            const consoleEl = consoleRefs.current[server.id];
                            if (consoleEl) {
                                consoleEl.scrollTop = consoleEl.scrollHeight;
                            }
                        }, 100);
                    })
                    .catch(console.error);
            }
        });
    }, [servers, logsFetched]);

    // Periodic startup detection: poll log file every 10s for 'starting' or 'running' servers
    useEffect(() => {
        const pendingServers = servers.filter(s => s.status === 'starting' || s.status === 'running');
        if (pendingServers.length === 0) return;

        const pollInterval = setInterval(() => {
            pendingServers.forEach(server => {
                if (server.status !== 'starting' && server.status !== 'running') return;
                getServerLogs(server.id, server.installPath)
                    .then(logEvents => {
                        const logLines = logEvents.map((e: any) => e.line);
                        setServerLogs(prev => ({
                            ...prev,
                            [server.id]: logLines
                        }));

                        // Only check NEW lines (after the baseline from initial fetch)
                        const baseline = logBaseline[server.id] ?? 0;
                        const newLines = logLines.slice(baseline);
                        const hasStartupLine = newLines.some((line: string) =>
                            line.toLowerCase().includes('advertising for join')
                        );
                        if (hasStartupLine) {
                            console.log(`[Frontend] Startup poll detected online for server ${server.id} (new lines after baseline ${baseline})`);
                            updateServerStatus(server.id, 'online');
                            clearInterval(pollInterval);
                        }
                    })
                    .catch(console.error);
            });
        }, 10000); // Check every 10 seconds

        return () => clearInterval(pollInterval);
    }, [servers, updateServerStatus, logBaseline]);

    const toggleConsole = (serverId: number) => {
        setExpandedConsoles(prev => ({ ...prev, [serverId]: !prev[serverId] }));
    };

    const handleStartServer = async (serverId: number, skipCheck: boolean = false) => {
        if (!skipCheck) {
            const ok = await checkPortsBeforeStart(serverId);
            if (!ok) {
                setPendingStartParams({ id: serverId, noMods: false });
                return;
            }
        }

        try {
            updateServerStatus(serverId, 'starting');
            // Set baseline marker — will be updated to actual line count after initial fetch
            setLogBaseline(prev => ({ ...prev, [serverId]: 0 }));
            setLogsFetched(prev => ({ ...prev, [serverId]: false }));
            setExpandedConsoles(prev => ({ ...prev, [serverId]: true })); // Auto-expand console
            setServerLogs(prev => ({ ...prev, [serverId]: [] })); // Clear old logs

            await startServer(serverId, updateOnStart);

            // Don't set to 'running' — keep 'starting' until STDERR/STDOUT detection confirms 'online'
            toast.success(updateOnStart ? t('serverManager.updatingAndStarting') : t('serverManager.serverStarted'));
            setUpdateOnStart(false); // Reset toggle
        } catch (error: any) {
            updateServerStatus(serverId, 'stopped');
            // Log error to the in-app console so it persists
            const errorMsg = String(error);
            setServerLogs(prev => ({
                ...prev,
                [serverId]: [...(prev[serverId] || []), `❌ STARTUP FAILED: ${errorMsg}`]
            }));

            // Show long-duration toast
            toast.error(errorMsg, { duration: 10000 });
        }
    };

    const handleStartServerNoMods = async (serverId: number, skipCheck: boolean = false) => {
        if (!skipCheck) {
            const ok = await checkPortsBeforeStart(serverId);
            if (!ok) {
                setPendingStartParams({ id: serverId, noMods: true });
                return;
            }
        }

        try {
            updateServerStatus(serverId, 'starting');
            setLogBaseline(prev => ({ ...prev, [serverId]: 0 }));
            setLogsFetched(prev => ({ ...prev, [serverId]: false }));
            setExpandedConsoles(prev => ({ ...prev, [serverId]: true }));
            setServerLogs(prev => ({ ...prev, [serverId]: [] }));
            await startServerNoMods(serverId);
            // Don't set to 'running' — keep 'starting' until detection confirms 'online'
            toast.success(t('serverManager.serverStartedNoMods'));
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(t('serverManager.startFailed', { error }));
        }
    };

    const handleStopServer = async (serverId: number) => {
        try {
            await stopServer(serverId);
            updateServerStatus(serverId, 'stopped');
            // Clear logs and collapse console on stop
            setServerLogs(prev => ({ ...prev, [serverId]: [] }));
            setExpandedConsoles(prev => ({ ...prev, [serverId]: false }));
            toast.success(t('serverManager.serverStopped'));
        } catch (error) {
            toast.error(t('serverManager.stopFailed', { error }));
        }
    };

    const handleRestartServer = async (serverId: number) => {
        try {
            updateServerStatus(serverId, 'starting');
            setLogBaseline(prev => ({ ...prev, [serverId]: 0 }));
            setLogsFetched(prev => ({ ...prev, [serverId]: false }));
            await restartServer(serverId);
            // Don't set to 'running' — keep 'starting' until detection confirms 'online'
            toast.success(t('serverManager.serverRestarted'));
        } catch (error) {
            toast.error(t('serverManager.restartFailed', { error }));
        }
    };

    const confirmDeleteServer = async () => {
        if (!deleteConfirmServer) return;
        try {
            await deleteServer(deleteConfirmServer.id);
            removeServer(deleteConfirmServer.id);
            toast.success(t('serverManager.serverDeleted'));
            setDeleteConfirmServer(null);
        } catch (error) {
            toast.error(t('serverManager.deleteFailed', { error }));
        }
    };

    const handleUpdateServer = async (serverId: number) => {
        try {
            updateServerStatus(serverId, 'updating');
            await updateServer(serverId);
            toast.success(t('serverManager.serverUpdated'));
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(t('serverManager.updateFailed', { error }));
        }
    };

    const handleShowConsole = async (serverId: number) => {
        try {
            await showServerConsole(serverId);
            toast.success(t('serverManager.consoleSent'));
        } catch (error) {
            toast.error(t('serverManager.consoleFailed', { error }));
        }
    };

    const handleHardcoreRetry = async (serverId: number) => {
        try {
            if (!window.confirm(t('serverManager.confirmDeepRepair', 'Deep Repair will stop the server, delete the mod cache (.temp folder), and force a fresh download. This may take longer than a normal restart. Continue?'))) {
                return;
            }
            updateServerStatus(serverId, 'starting');
            setExpandedConsoles(prev => ({ ...prev, [serverId]: true }));
            await hardcoreRetryMods(serverId);
            // Don't set to 'running' — keep 'starting' until detection confirms 'online'
            toast.success(t('serverManager.deepRepairStarted'));
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(t('serverManager.deepRepairFailed', { error }));
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
            toast.success(t('serverManager.serverCloned', { name: newServer.name }));
        } catch (error) {
            toast.error(t('serverManager.cloneFailed', { error }));
        }
    };

    const handleTransferSettings = async (targetServerId: number) => {
        if (!cloneModalServer) return;
        try {
            await transferSettings(cloneModalServer.id, targetServerId);
            toast.success(t('dashboard.settingsTransferred'));
        } catch (error) {
            toast.error(t('dashboard.failedTransfer', { error }));
        }
    };

    const handleExtractData = async (targetServerId: number) => {
        if (!cloneModalServer) return;
        try {
            await extractSaveData(cloneModalServer.id, targetServerId);
            toast.success(t('dashboard.saveDataExtracted'));
        } catch (error) {
            toast.error(t('dashboard.failedExtract', { error }));
        }
    };

    const handleSelectServer = (serverId: number) => {
        setSelectedServers(prev =>
            prev.includes(serverId) ? prev.filter(id => id !== serverId) : [...prev, serverId]
        );
    };

    const handleSelectAll = () => {
        if (selectedServers.length === servers.length && servers.length > 0) {
            setSelectedServers([]);
        } else {
            setSelectedServers(servers.map(s => s.id));
        }
    };

    const handleBulkStart = async () => {
        const serversToStart = servers.filter(s => selectedServers.includes(s.id) && (s.status === 'stopped' || s.status === 'crashed'));
        if (serversToStart.length === 0) {
            toast.error(t('serverManager.noStartableServersSelected', 'No startable servers selected.'));
            return;
        }

        toast.success(t('serverManager.bulkStartInitiated', { count: serversToStart.length }));

        for (const server of serversToStart) {
            handleStartServer(server.id); // fire off and continue
            await new Promise(resolve => setTimeout(resolve, 500)); // stagger starts
        }
        setSelectedServers([]); // Clear selection after starting
    };

    const handleStartAll = async () => {
        const serversToStart = servers.filter(s => s.status === 'stopped' || s.status === 'crashed');
        if (serversToStart.length === 0) {
            toast.error(t('serverManager.noStartableServers', 'No offline servers available to start.'));
            return;
        }

        toast.success(t('serverManager.bulkStartInitiated', { count: serversToStart.length }));

        for (const server of serversToStart) {
            handleStartServer(server.id);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    };

    const handleBulkStop = async () => {
        const serversToStop = servers.filter(s => selectedServers.includes(s.id) && (s.status === 'running' || s.status === 'online' || s.status === 'starting'));
        if (serversToStop.length === 0) {
            toast.error(t('serverManager.noStoppableServersSelected', 'No running servers selected.'));
            return;
        }

        toast.success(t('serverManager.bulkStopInitiated', { count: serversToStop.length }));

        for (const server of serversToStop) {
            handleStopServer(server.id); // fire off and continue
            await new Promise(resolve => setTimeout(resolve, 500)); // stagger stops
        }
        setSelectedServers([]); // Clear selection after stopping
    };

    const handleStopAll = async () => {
        const serversToStop = servers.filter(s => s.status === 'running' || s.status === 'online' || s.status === 'starting');
        if (serversToStop.length === 0) {
            toast.error(t('serverManager.noStoppableServers', 'No running servers available to stop.'));
            return;
        }

        toast.success(t('serverManager.bulkStopInitiated', { count: serversToStop.length }));

        for (const server of serversToStop) {
            handleStopServer(server.id);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
                        {t('serverManager.title')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('serverManager.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowImportDialog(true)}
                        className="flex items-center space-x-2 px-5 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-all font-medium"
                    >
                        <Download className="w-5 h-5" />
                        <span>{t('serverManager.buttons.importExisting')}</span>
                    </button>
                    <button
                        onClick={() => setShowNonDedicatedImport(true)}
                        className="flex items-center space-x-2 px-5 py-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl transition-all font-medium"
                    >
                        <Settings className="w-5 h-5" />
                        <span>{t('serverManager.buttons.importSave')}</span>
                    </button>
                    <button
                        onClick={() => setShowInstallDialog(true)}
                        className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl transition-all shadow-lg shadow-sky-500/20 font-medium group"
                    >
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        <span>{t('serverManager.buttons.deployServer')}</span>
                    </button>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {servers.length > 0 && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 mt-2 mb-2 gap-4">
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors select-none">
                            <input
                                type="checkbox"
                                checked={servers.length > 0 && selectedServers.length === servers.length}
                                onChange={handleSelectAll}
                                className="w-5 h-5 rounded border-slate-600 text-sky-500 focus:ring-sky-500/50 cursor-pointer"
                                style={{ backgroundColor: 'transparent' }}
                            />
                            <span className="font-medium">
                                {selectedServers.length > 0
                                    ? t('serverManager.buttons.selectedCount', { count: selectedServers.length })
                                    : t('serverManager.buttons.selectAll')}
                            </span>
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleBulkStart}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.startSelected')}</span>
                        </button>
                        <button
                            onClick={handleStartAll}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg transition-all font-medium"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.startAll')}</span>
                        </button>
                        <div className="w-px h-6 bg-slate-700 hidden sm:block mx-1"></div>
                        <button
                            onClick={handleBulkStop}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Square className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.stopSelected', 'Stop Selected')}</span>
                        </button>
                        <button
                            onClick={handleStopAll}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg transition-all font-medium"
                        >
                            <Square className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.stopAll', 'Stop All')}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Server List */}
            {servers.length === 0 ? (
                <div className="glass-panel rounded-2xl p-16 text-center border-2 border-dashed border-slate-700/50">
                    <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Plus className="w-10 h-10 text-slate-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">{t('serverManager.emptyState.title')}</h3>
                    <p className="text-slate-400 mb-8 max-w-md mx-auto">
                        {t('serverManager.emptyState.description')}
                    </p>
                    <div className="flex flex-col gap-4 items-center">
                        <button
                            onClick={() => setShowInstallDialog(true)}
                            className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors border border-slate-700"
                        >
                            {t('serverManager.buttons.installFirst')}
                        </button>
                    </div>
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
                                <div className="flex items-start space-x-4">
                                    {/* Selection Checkbox */}
                                    <div className="flex items-center h-full pt-1.5">
                                        <input
                                            type="checkbox"
                                            checked={selectedServers.includes(server.id)}
                                            onChange={() => handleSelectServer(server.id)}
                                            className="w-5 h-5 rounded border-slate-600 text-sky-500 focus:ring-sky-500/50 cursor-pointer"
                                            style={{ backgroundColor: 'transparent' }}
                                        />
                                    </div>
                                    <div className="relative mt-1">
                                        <div className={cn(
                                            'w-4 h-4 rounded-full',
                                            server.status === 'running' && 'bg-yellow-500 animate-pulse', // Yellow for loading
                                            server.status === 'online' && 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]', // Green only when fully ready
                                            server.status === 'stopped' && 'bg-slate-500',
                                            server.status === 'crashed' && 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]',
                                            server.status === 'starting' && 'bg-yellow-500 animate-pulse',
                                            server.status === 'updating' && 'bg-blue-500 animate-pulse',
                                            server.status === 'repairing' && 'bg-orange-500 animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.5)]'
                                        )} />
                                        {server.status === 'online' && (
                                            <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                                        )}
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-xl font-bold text-white group-hover:text-sky-400 transition-colors">
                                                {server.name}
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    'px-2.5 py-0.5 rounded-md text-xs font-bold border flex items-center gap-2',
                                                    server.status === 'online' && 'bg-green-500/10 text-green-400 border-green-500/20',
                                                    server.status === 'running' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                                                    server.status === 'stopped' && 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                                                    server.status === 'crashed' && 'bg-red-500/10 text-red-400 border-red-500/20',
                                                    server.status === 'starting' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                                                    server.status === 'updating' && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                                                    server.status === 'repairing' && 'bg-orange-500/10 text-orange-400 border-orange-500/20',
                                                    server.status === 'startup_timeout' && 'bg-red-500/10 text-red-400 border-red-500/20'
                                                )}>
                                                    {server.status === 'running' || server.status === 'starting' ? (
                                                        <>
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                            {t('serverManager.serverStatus.loading')}
                                                            {startupProgress[server.id] && (
                                                                <span className="opacity-75">
                                                                    ({formatElapsedTime(startupProgress[server.id].elapsed)})
                                                                </span>
                                                            )}
                                                            {startupProgress[server.id]?.confirmed && (
                                                                <Check className="w-3 h-3 text-green-400 ml-1" />
                                                            )}
                                                        </>
                                                    ) : server.status === 'repairing' ? (
                                                        t('serverManager.serverStatus.repairing')
                                                    ) : server.status === 'startup_timeout' ? (
                                                        t('serverManager.serverStatus.startup_timeout')
                                                    ) : (
                                                        t(`serverManager.serverStatus.${server.status}`, (server.status || 'UNKNOWN').toUpperCase())
                                                    )}
                                                </span>

                                                {(server.status === 'running' || server.status === 'starting' || server.status === 'startup_timeout') && (
                                                    <button
                                                        onClick={(e) => handleForceStop(server.id, e)}
                                                        className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md text-xs font-bold transition-colors flex items-center gap-1"
                                                        title={t('serverManager.tooltips.forceStop')}
                                                    >
                                                        <XCircle className="w-3 h-3" />
                                                        {server.status === 'starting' ? t('serverManager.buttons.cancel') : t('serverManager.buttons.forceStop')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                                            <div className="flex items-center gap-1.5">
                                                <Globe className="w-4 h-4 text-slate-500" />
                                                <span>{server.config.mapName}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Terminal className="w-4 h-4 text-slate-500" />
                                                <span className="font-mono">{t('common.port')} {server.ports.gamePort}</span>
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
                                    {/* Update on Start Toggle */}
                                    {(server.status === 'stopped' || server.status === 'crashed') && (
                                        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer hover:text-white transition-colors mr-2 select-none" title={t('serverManager.tooltips.updateOnStart')}>
                                            <input
                                                type="checkbox"
                                                checked={updateOnStart}
                                                onChange={(e) => setUpdateOnStart(e.target.checked)}
                                                className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-sky-500/50 cursor-pointer"
                                            />
                                            {t('serverManager.buttons.updateOnStart')}
                                        </label>
                                    )}

                                    {server.status === 'stopped' || server.status === 'crashed' ? (
                                        <div className="relative group/start">
                                            <button
                                                onClick={() => handleStartServer(server.id)}
                                                className="p-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                                title={t('serverManager.tooltips.start')}
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
                                                    <span>{t('serverManager.buttons.start')}</span>
                                                </button>
                                                <button
                                                    onClick={() => handleStartServerNoMods(server.id)}
                                                    className="w-full text-left px-4 py-3 hover:bg-yellow-500/10 text-yellow-400 hover:text-yellow-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                                                    title={t('serverManager.tooltips.startNoMods')}
                                                >
                                                    <Shield className="w-4 h-4" />
                                                    <span>{t('serverManager.buttons.startNoMods')}</span>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (server.status === 'running' || server.status === 'online') ? (
                                        <button
                                            onClick={() => handleStopServer(server.id)}
                                            className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                            title={t('serverManager.tooltips.stop')}
                                        >
                                            <Square className="w-5 h-5 fill-current" />
                                        </button>
                                    ) : null}

                                    <div className="relative group/dropdown">
                                        <button
                                            disabled={server.status === 'stopped'}
                                            className="p-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                            title={t('serverManager.tooltips.restartOptions')}
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
                                                <span>{t('serverManager.buttons.normalRestart')}</span>
                                            </button>
                                            <button
                                                onClick={() => handleHardcoreRetry(server.id)}
                                                className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                                                title={t('serverManager.tooltips.deepRepair')}
                                            >
                                                <Shield className="w-4 h-4" />
                                                <span>{t('serverManager.buttons.deepRepair')}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleShowConsole(server.id)}
                                        disabled={server.status === 'stopped'}
                                        className="p-2.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                        title={t('serverManager.tooltips.showConsole')}
                                    >
                                        <AppWindow className="w-5 h-5" />
                                    </button>

                                    <div className="w-px h-8 bg-slate-700/50 mx-1"></div>

                                    <button
                                        onClick={() => handleUpdateServer(server.id)}
                                        className="p-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title={t('serverManager.tooltips.update')}
                                    >
                                        <Download className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => navigate('/config', { state: { serverId: server.id } })}
                                        className="p-2.5 bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/30 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title={t('serverManager.tooltips.settings')}
                                    >
                                        <Settings className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => openCloneModal(server)}
                                        className="p-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title={t('serverManager.tooltips.clone')}
                                    >
                                        <Copy className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={() => setDeleteConfirmServer(server)}
                                        className="p-2.5 bg-slate-700/30 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-600/30 hover:border-red-500/20 rounded-lg transition-all hover:scale-105 active:scale-95"
                                        title={t('serverManager.tooltips.delete')}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Server Details Footer */}
                            <div className="mt-6 pt-4 border-t border-slate-700/30 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.installPath')}</p>
                                    <p className="text-slate-300 font-mono text-xs truncate" title={server.installPath}>{server.installPath}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.maxPlayers')}</p>
                                    <p className="text-slate-300">{server.config.maxPlayers} {t('serverManager.serverDetails.survivors')}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.sessionName')}</p>
                                    <p className="text-slate-300 truncate">{server.config.sessionName}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">{t('serverManager.serverDetails.connection')}</p>
                                    <p className="text-slate-300 font-mono text-xs">
                                        {server.ipAddress ? server.ipAddress : "0.0.0.0"} : {server.ports.gamePort}
                                    </p>
                                </div>
                            </div>

                            {/* Automation Controls */}
                            <div className="mt-4 pt-4 border-t border-slate-700/30 flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{t('serverManager.serverDetails.automation')}</span>
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
                                    <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStart')}</span>
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
                                        <span className="text-slate-400 text-sm group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStop')}</span>
                                        <span className="text-[10px] text-slate-500">{t('serverManager.serverDetails.onConfigChange')}</span>
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
                                            <span className={cn("text-sm font-bold transition-colors", server.intelligentMode ? "text-sky-400" : "text-slate-400")}>{t('serverManager.serverDetails.intelligentMode')}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500" title={t('serverManager.tooltips.dataSafety')}>{t('serverManager.serverDetails.dataSafetyLabel')}</span>
                                    </div>
                                </label>
                            </div>

                            {/* Embedded Console */}
                            {(expandedConsoles[server.id] || serverLogs[server.id]?.length > 0) && (
                                <div className="mt-4 border-t border-slate-700/30 pt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <button
                                            onClick={() => toggleConsole(server.id)}
                                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-sky-400 transition-colors"
                                        >
                                            <Terminal className="w-4 h-4" />
                                            <span>{t('serverManager.serverDetails.consoleOutput')}</span>
                                            {expandedConsoles[server.id] ? (
                                                <ChevronUp className="w-4 h-4" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4" />
                                            )}
                                        </button>

                                        {(server.status === 'running' || server.status === 'online' || server.status === 'starting') && (
                                            <button
                                                onClick={() => handleShowConsole(server.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 hover:text-violet-300 border border-violet-500/20 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95"
                                                title={t('serverManager.tooltips.showConsoleBtn')}
                                            >
                                                <AppWindow className="w-3.5 h-3.5" />
                                                <span>{t('serverManager.serverDetails.showConsole')}</span>
                                            </button>
                                        )}
                                    </div>

                                    {expandedConsoles[server.id] && (
                                        <div
                                            ref={el => { consoleRefs.current[server.id] = el; }}
                                            className="bg-slate-950 rounded-lg p-3 font-mono text-xs h-48 overflow-y-auto border border-slate-800"
                                        >
                                            {(serverLogs[server.id] || []).length === 0 ? (
                                                <p className="text-slate-500 italic">{t('serverManager.serverDetails.waitingOutput')}</p>
                                            ) : (
                                                (serverLogs[server.id] || []).map((lineItem, idx) => {
                                                    // Defensive check for non-string log items
                                                    let line = "";
                                                    if (typeof lineItem === 'string') {
                                                        line = lineItem;
                                                    } else if (lineItem === null || lineItem === undefined) {
                                                        line = "";
                                                    } else {
                                                        line = JSON.stringify(lineItem) || "";
                                                    }

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
                title={t('serverManager.confirmDelete')}
                message={t('serverManager.confirmDeleteMsg', { name: deleteConfirmServer?.name })}
                confirmText={t('serverManager.buttons.delete')}
                variant="danger"
            />

            {/* Force Stop Confirmation Dialog */}
            <ConfirmDialog
                isOpen={forceStopServerId !== null}
                onClose={() => setForceStopServerId(null)}
                onConfirm={confirmForceStop}
                title={t('serverManager.buttons.forceStop')}
                message={t('serverManager.confirmForceStop')}
                confirmText={t('serverManager.buttons.forceStop')}
                variant="danger"
            />

            {/* Port Conflict Modal */}
            <PortConflictModal
                isOpen={showConflictModal}
                onClose={() => {
                    setShowConflictModal(false);
                    setPendingStartParams(null);
                }}
                onConfirm={() => {
                    if (pendingStartParams) {
                        if (pendingStartParams.noMods) {
                            handleStartServerNoMods(pendingStartParams.id, true);
                        } else {
                            handleStartServer(pendingStartParams.id, true);
                        }
                    }
                }}
                result={conflictResult}
            />
        </div>
    );
}
