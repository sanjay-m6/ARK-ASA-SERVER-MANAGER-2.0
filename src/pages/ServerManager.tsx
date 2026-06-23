import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Plus, Play, Square, RotateCw, Trash2, Download, Settings, Terminal, Globe, Shield,
    ChevronDown, ChevronUp, Copy, AppWindow, RefreshCw,
    Check, XCircle, GripVertical, Network, FolderOpen, Users, PenLine, Cpu, HelpCircle,
    Loader2, AlertTriangle, GitBranch
} from 'lucide-react';
import { useServerStore } from '../stores/serverStore';
import { useInstallStore, normalizePath } from '../stores/installStore';
import { cn } from '../utils/helpers';
import ImportServerDialog from '../components/server/ImportServerDialog';
import ImportNonDedicatedDialog from '../components/server/ImportNonDedicatedDialog';
import CloneOptionsModal from '../components/server/CloneOptionsModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PortConflictModal from '../components/server/PortConflictModal';
import { useServerOrganizationStore } from '../stores/serverOrganizationStore';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

import { startServer, stopServer, restartServer, deleteServer, updateServer, getServerLogs, cloneServer, transferSettings, extractSaveData, showServerConsole, hardcoreRetryMods, startServerNoMods, toggleServerAutomation, checkPortConflicts, ConflictCheckResult, setServerStartupConfig, getServerVersion, getLatestServerVersion } from '../utils/tauri';
import toast from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';

import { useNavigate } from 'react-router-dom';
import { Server, ServerStartupProgressEvent } from '../types';
import ServerStatusBar from '../components/server/ServerStatusBar';
import serverBrowserGuide from '../assets/server_browser_guide.png';

interface ServerLogEvent {
    server_id: number;
    line: string;
    is_stderr: boolean;
}

export default function ServerManager() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { servers, setServers, removeServer, updateServerStatus, refreshServers } = useServerStore();
    const { activeInstalls, removeInstall, setDraftOpen } = useInstallStore();
    const [serverLogs, setServerLogs] = useState<Record<number, string[]>>({});
    const [expandedConsoles, setExpandedConsoles] = useState<Record<number, boolean>>({});
    const [showUpdateConsole, setShowUpdateConsole] = useState<Record<number, boolean>>({});
    const consoleRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const [appVersion] = useState<string>('4.5.1');
    const [cloneModalServer, setCloneModalServer] = useState<Server | null>(null);
    const [deleteConfirmServer, setDeleteConfirmServer] = useState<Server | null>(null);
    const [forceStopServerId, setForceStopServerId] = useState<number | null>(null);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [showNonDedicatedImport, setShowNonDedicatedImport] = useState(false);
    const [updateOnStart, setUpdateOnStart] = useState(false);
    const [selectedServers, setSelectedServers] = useState<number[]>([]);
    const [showGuide, setShowGuide] = useState(false);
    
    // UI QoL State
    const { customizations, updateServerCustomization } = useServerOrganizationStore();
    const [editingServerId, setEditingServerId] = useState<number | null>(null);
    const [editServerName, setEditServerName] = useState("");
    const [collapsedServers, setCollapsedServers] = useState<Record<number, boolean>>({});
    const [serverVersions, setServerVersions] = useState<Record<number, string>>({});
    const [latestVersion, setLatestVersion] = useState<string | null>(null);

    const [serverOrder, setServerOrder] = useState<number[]>(() => {
        const saved = localStorage.getItem('arkServerOrder');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('arkServerOrder', JSON.stringify(serverOrder));
    }, [serverOrder]);

    const orderedServers = [...servers].sort((a, b) => {
        const indexA = serverOrder.indexOf(a.id);
        const indexB = serverOrder.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    const handleDragEnd = (result: any) => {
        if (!result.destination) return;

        const currentOrder = orderedServers.map(s => s.id);
        const [reorderedItem] = currentOrder.splice(result.source.index, 1);
        currentOrder.splice(result.destination.index, 0, reorderedItem);

        setServerOrder(currentOrder);
    };

    const handleRenameStart = (server: Server, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingServerId(server.id);
        const custom = customizations.get(server.id);
        setEditServerName(custom?.displayName || server.name);
    };

    const handleRenameSave = (server: Server) => {
        if (editingServerId === server.id) {
            const custom = customizations.get(server.id) || {
                serverId: server.id,
                isPinned: false,
                pinOrder: 0,
                isMinimized: false,
                tags: [],
                favorite: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            updateServerCustomization({ ...custom, displayName: editServerName });
            setEditingServerId(null);
        }
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent, server: Server) => {
        if (e.key === 'Enter') {
            handleRenameSave(server);
        } else if (e.key === 'Escape') {
            setEditingServerId(null);
        }
    };

    const toggleCollapse = (serverId: number, e: React.MouseEvent) => {
        // Prevent toggle if interacting with buttons, inputs, labels
        if ((e.target as HTMLElement).closest('button, input, label, .no-collapse')) return;
        setCollapsedServers(prev => ({ ...prev, [serverId]: !prev[serverId] }));
    };

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
        setDraftOpen(false);
        setShowImportDialog(false);
        setShowNonDedicatedImport(false);
        await refreshServers();
    };

    const handleToggleAutomation = async (serverId: number, type: 'auto_start' | 'auto_stop' | 'intelligent_mode', current: boolean) => {
        try {
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

    // Fetch latest public version on mount
    useEffect(() => {
        const fetchLatest = async () => {
            try {
                const latest = await getLatestServerVersion();
                setLatestVersion(latest);
            } catch (err) {
                console.error('Failed to fetch latest ASA version:', err);
            }
        };
        fetchLatest();
    }, []);

    // Fetch local versions for servers
    useEffect(() => {
        const fetchLocalVersions = async () => {
            const targets = servers.filter(s => !serverVersions[s.id]);
            if (targets.length === 0) return;

            for (const server of targets) {
                try {
                    const ver = await getServerVersion(server.id);
                    setServerVersions(prev => ({ ...prev, [server.id]: ver }));
                } catch (err) {
                    console.error(`Failed to get version for server ${server.id}:`, err);
                    setServerVersions(prev => ({ ...prev, [server.id]: 'Unknown' }));
                }
            }
        };
        fetchLocalVersions();
    }, [servers, serverVersions]);

    const isServerOutdated = (serverId: number) => {
        const localVer = serverVersions[serverId];
        if (!localVer || !latestVersion) return false;
        if (localVer.startsWith('Build ')) {
            return !localVer.includes(latestVersion);
        }
        return false;
    };

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
            // Auto-expand the card details when starting an update
            setCollapsedServers(prev => ({ ...prev, [serverId]: false }));

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
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">
                            {t('serverManager.title')}
                        </h1>
                        <button
                            onClick={() => setShowGuide(!showGuide)}
                            className={cn(
                                "p-2 bg-slate-900/40 backdrop-blur-md border border-white/10 hover:bg-white/5 text-slate-300 rounded-xl transition-all hover:scale-105 active:scale-95 focus:outline-none",
                                showGuide && "bg-sky-500/10 border-sky-500/20 text-sky-400"
                            )}
                            title={showGuide ? t('serverManager.statusBar.hideGuide', 'Hide Search Guide') : t('serverManager.statusBar.showGuide', 'Show Search Guide')}
                        >
                            <HelpCircle className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-slate-400 mt-2 text-lg">
                        {t('serverManager.subtitle')}
                        {latestVersion && (
                            <span className="ml-3 inline-flex items-center gap-1.5 px-3 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-full text-xs font-bold font-mono">
                                Latest Public Build: {latestVersion}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowImportDialog(true)}
                        className="flex items-center space-x-2 px-5 py-3 bg-slate-900/40 backdrop-blur-md border border-white/10 hover:bg-white/5 text-slate-200 rounded-xl transition-all font-medium"
                    >
                        <Download className="w-5 h-5 text-slate-300" />
                        <span>{t('serverManager.buttons.importExisting')}</span>
                    </button>
                    <button
                        onClick={() => setShowNonDedicatedImport(true)}
                        className="flex items-center space-x-2 px-5 py-3 bg-orange-500/5 backdrop-blur-md border border-orange-500/20 hover:bg-orange-500/10 text-orange-400 rounded-xl transition-all font-medium"
                    >
                        <Settings className="w-5 h-5 text-orange-400" />
                        <span>{t('serverManager.buttons.importSave')}</span>
                    </button>
                    <button
                        onClick={() => setDraftOpen(true)}
                        className="flex items-center space-x-2 px-6 py-3 bg-sky-500/10 backdrop-blur-md border border-sky-500/30 hover:bg-sky-500/20 text-sky-400 rounded-xl transition-all shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 font-medium group"
                    >
                        <Plus className="w-5 h-5 text-sky-400 group-hover:rotate-90 transition-transform" />
                        <span>{t('serverManager.buttons.deployServer')}</span>
                    </button>
                </div>
            </div>

            {/* Server Listing Guide (Collapsible) */}
            <AnimatePresence>
                {showGuide && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, y: -10 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="glass-panel rounded-2xl p-6 border border-slate-700/50 bg-slate-950/45 shadow-inner">
                            <h5 className="text-sm font-bold text-slate-200 mb-3.5 flex items-center gap-2">
                                <HelpCircle className="w-5 h-5 text-sky-400" />
                                {t('serverManager.statusBar.guideTitle', 'Guide: How to Find Your Server in the In-Game Browser')}
                            </h5>
                            <div className="text-sm text-slate-400 space-y-3.5 leading-relaxed max-w-4xl">
                                <p className="flex items-start gap-3">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300 shrink-0 mt-0.5">1</span>
                                    <span>
                                        To find the server in the server list, you first need to enter <code className="bg-slate-900/80 border border-white/5 px-2 py-1 rounded font-mono text-cyan-300 select-text">Ark.UseServerList 0</code> in the in-game console.
                                    </span>
                                </p>
                                <p className="flex items-start gap-3">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300 shrink-0 mt-0.5">2</span>
                                    <span>
                                        Then, under the <strong className="text-slate-200">Unofficial</strong> tab, enable the checkboxes at the bottom:
                                        <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-400">
                                            <li>Enable <strong className="text-slate-200">Show Password Protected Servers</strong> (if your server has a password).</li>
                                            <li>Enable <strong className="text-slate-200">Show Player Servers</strong>.</li>
                                            <li>If the server is set to crossplay, enable the crossplay-related checkboxes. If it is <strong className="text-amber-400">not</strong> a crossplay server, make sure to enable the <strong className="text-slate-200">PC-Only Online Multiplayer</strong> checkbox.</li>
                                        </ul>
                                    </span>
                                </p>
                                <p className="flex items-start gap-3">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300 shrink-0 mt-0.5">3</span>
                                    <span>
                                        After that, you can search for your server name in the top right search bar.
                                    </span>
                                </p>
                                <div className="mt-5 border border-white/5 rounded-xl overflow-hidden shadow-2xl bg-slate-950/60 max-w-4xl hover:border-sky-500/20 transition-all duration-300">
                                    <img 
                                        src={serverBrowserGuide} 
                                        alt="ARK: Survival Ascended Server List Browser Settings Guide" 
                                        className="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity duration-300"
                                    />
                                </div>
                                <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 mt-4 text-xs text-slate-500">
                                    <strong className="text-slate-400 font-bold block mb-1">Additional Filters & Mods Checklist:</strong>
                                    Make sure that the server filters for <strong className="text-slate-400">Maps</strong> and <strong className="text-slate-400">PvP/PvE</strong> are either set to <strong className="text-slate-400">All</strong> or match your server's current settings exactly, and that the list is not being filtered by any active mods.
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bulk Actions Bar */}
            {servers.length > 0 && (
                <div className="sticky top-4 z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-xl p-6 mt-2 mb-6 gap-4 shadow-lg">
                    <div className="flex items-center">
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors select-none">
                            {/* Spacer to align checkbox with server row checkbox */}
                            <div className="w-5 shrink-0 hidden sm:block" />
                            <div className="relative flex items-center justify-center w-5 h-5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={servers.length > 0 && selectedServers.length === servers.length}
                                    onChange={handleSelectAll}
                                    className="sr-only"
                                />
                                <div className={cn(
                                    "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                                    servers.length > 0 && selectedServers.length === servers.length
                                        ? "bg-sky-500 border-sky-500 text-white"
                                        : "border-slate-600 bg-slate-900/50 hover:bg-slate-800/50 hover:border-sky-500/50"
                                )}>
                                    {servers.length > 0 && selectedServers.length === servers.length && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                            </div>
                            <span className="font-medium text-sm text-slate-300 ml-1">
                                {selectedServers.length > 0
                                    ? t('serverManager.buttons.selectedCount', { count: selectedServers.length })
                                    : t('serverManager.buttons.selectAll')}
                            </span>
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto bg-slate-950/40 rounded-xl border border-white/5 p-1">
                        <button
                            onClick={handleBulkStart}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-green-500/10 text-green-500 rounded-lg transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.startSelected')}</span>
                        </button>
                        <button
                            onClick={handleStartAll}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-sky-500/10 text-sky-400 rounded-lg transition-all text-sm font-medium"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.startAll')}</span>
                        </button>
                        <div className="w-px h-6 bg-white/10 hidden sm:block mx-1"></div>
                        <button
                            onClick={handleBulkStop}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Square className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.stopSelected', 'Stop Selected')}</span>
                        </button>
                        <button
                            onClick={handleStopAll}
                            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-all text-sm font-medium"
                        >
                            <Square className="w-4 h-4 fill-current" />
                            <span>{t('serverManager.buttons.stopAll', 'Stop All')}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Server List */}
            {servers.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-2xl p-16 text-center border border-slate-700/50 relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-blue-500/5 animate-pulse"></div>
                    <motion.div 
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="relative w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-900 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(14,165,233,0.1)] border border-slate-700/50"
                    >
                        <Plus className="w-12 h-12 text-sky-400" />
                    </motion.div>
                    <h3 className="text-2xl font-bold text-white mb-3 relative z-10">{t('serverManager.emptyState.title', 'No Servers Found')}</h3>
                    <p className="text-slate-400 mb-8 max-w-md mx-auto relative z-10 text-lg">
                        {t('serverManager.emptyState.description', 'Get started by deploying your first ARK: Survival Ascended server.')}
                    </p>
                    <div className="flex flex-col gap-4 items-center relative z-10">
                        <button
                            onClick={() => setDraftOpen(true)}
                            className="px-8 py-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-sky-500/20 hover:scale-105"
                        >
                            {t('serverManager.buttons.installFirst', 'Deploy Server')}
                        </button>
                    </div>
                </motion.div>
            ) : (
                <div className="grid gap-6">
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="server-list">
                            {(provided) => (
                                <div 
                                    className="grid gap-6" 
                                    {...provided.droppableProps} 
                                    ref={provided.innerRef}
                                >
                                    {orderedServers.map((server, index) => (
                                        <Draggable key={server.id.toString()} draggableId={server.id.toString()} index={index}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    style={{ ...provided.draggableProps.style, zIndex: snapshot.isDragging ? 50 : 'auto' }}
                                                    className={cn(
                                                        "bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-xl shadow-lg p-6 group relative",
                                                        snapshot.isDragging 
                                                            ? "shadow-2xl shadow-sky-500/20 ring-2 ring-sky-500/50 cursor-grabbing scale-[1.02]" 
                                                            : "transition-all duration-300 hover:border-sky-500/50 hover:shadow-[0_8px_30px_rgba(14,165,233,0.15)] hover:-translate-y-1 cursor-pointer"
                                                    )}
                                                    onClick={(e) => toggleCollapse(server.id, e)}
                                                >
                                                    {/* Decorative background gradient clipped inside the card */}
                                                    <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                                                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-sky-500/5 to-transparent rounded-full blur-3xl -mr-32 -mt-32"></div>
                                                    </div>

                                                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                                         {/* Left-hand section: Info */}
                                                         <div className="flex items-center gap-4 flex-1 min-w-0">
                                                             {/* Drag Handle */}
                                                             <div 
                                                                 {...provided.dragHandleProps}
                                                                 className="flex items-center justify-center w-5 h-5 cursor-grab text-slate-500 hover:text-white transition-colors no-collapse shrink-0"
                                                                 onClick={(e) => e.stopPropagation()}
                                                             >
                                                                 <GripVertical className="w-5 h-5" />
                                                             </div>

                                                             {/* Selection Checkbox */}
                                                             <label className="relative flex items-center justify-center w-5 h-5 cursor-pointer no-collapse shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                 <input
                                                                     type="checkbox"
                                                                     checked={selectedServers.includes(server.id)}
                                                                     onChange={() => handleSelectServer(server.id)}
                                                                     className="sr-only"
                                                                 />
                                                                 <div className={cn(
                                                                     "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                                                                     selectedServers.includes(server.id)
                                                                         ? "bg-sky-500 border-sky-500 text-white"
                                                                         : "border-slate-600 bg-slate-900/50 hover:bg-slate-800/50 hover:border-sky-500/50"
                                                                 )}>
                                                                     {selectedServers.includes(server.id) && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                                 </div>
                                                             </label>

                                                             {/* Status Dot */}
                                                             <div className="relative shrink-0 flex items-center">
                                                                 <div className={cn(
                                                                     'w-4 h-4 rounded-full',
                                                                     server.status === 'running' && 'bg-yellow-500 animate-pulse',
                                                                     server.status === 'online' && 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]',
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

                                                             {/* Name and Tags Block */}
                                                             <div className="flex-1 min-w-0">
                                                                 {/* Title row */}
                                                                 <div className="flex items-center gap-3 min-w-0">
                                                                     {editingServerId === server.id ? (
                                                                         <input 
                                                                             type="text"
                                                                             value={editServerName}
                                                                             onChange={(e) => setEditServerName(e.target.value)}
                                                                             onKeyDown={(e) => handleRenameKeyDown(e, server)}
                                                                             onBlur={() => handleRenameSave(server)}
                                                                             autoFocus
                                                                             className="no-collapse text-xl font-bold bg-slate-900 border border-sky-500/50 rounded px-2 py-0.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 min-w-[200px]"
                                                                             onClick={(e) => e.stopPropagation()}
                                                                         />
                                                                     ) : (
                                                                         <h3 
                                                                             className="text-xl font-bold text-white group-hover:text-sky-400 transition-colors truncate"
                                                                             onDoubleClick={(e) => handleRenameStart(server, e)}
                                                                             title={t('serverManager.tooltips.doubleClickToRename', 'Double-click to rename')}
                                                                         >
                                                                             {customizations.get(server.id)?.displayName || server.name}
                                                                         </h3>
                                                                     )}
                                                                     
                                                                     <div className="flex items-center gap-2 shrink-0">
                                                                         <span className={cn(
                                                                             'px-3 py-0.5 rounded-full text-[11px] uppercase tracking-wider font-bold border flex items-center gap-2 shadow-inner',
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

                                                                 {/* Metadata Tags row */}
                                                                 <div className="flex flex-wrap items-center gap-2 mt-2">
                                                                     <div className="flex items-center gap-1 px-2.5 py-0.5 bg-white/5 border border-white/10 rounded-md text-xs text-slate-300">
                                                                         <Globe className="w-3.5 h-3.5 text-sky-400/80" />
                                                                         <span>{server.config.mapName}</span>
                                                                     </div>
                                                                     <div className="flex items-center gap-1 px-2.5 py-0.5 bg-white/5 border border-white/10 rounded-md text-xs text-slate-300">
                                                                         <Terminal className="w-3.5 h-3.5 text-violet-400/80" />
                                                                         <span className="font-mono">{t('common.port')} {server.ports.gamePort}</span>
                                                                     </div>
                                                                     <div className="flex items-center gap-1 px-2.5 py-0.5 bg-white/5 border border-white/10 rounded-md text-xs text-slate-300">
                                                                         <Shield className="w-3.5 h-3.5 text-emerald-400/80" />
                                                                         <span>v{appVersion}</span>
                                                                     </div>
                                                                     {serverVersions[server.id] && (
                                                                         <div className="flex items-center gap-1 px-2.5 py-0.5 bg-white/5 border border-white/10 rounded-md text-xs text-slate-300" title={t('serverManager.tooltips.serverVersion', 'Local Server Version')}>
                                                                             <GitBranch className="w-3.5 h-3.5 text-sky-400/80" />
                                                                             <span className="font-mono text-xs">{serverVersions[server.id]}</span>
                                                                         </div>
                                                                     )}
                                                                     {isServerOutdated(server.id) && (
                                                                         <div className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md text-xs font-bold animate-pulse" title={t('serverManager.tooltips.updateAvailable', 'New version is available! Click the download button to update.')}>
                                                                             <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                                                             <span>{t('serverManager.status.updateAvailable', 'Update Available')}</span>
                                                                         </div>
                                                                     )}
                                                                 </div>
                                                             </div>
                                                         </div>

                                                         {/* Actions Toolbar (Server Action Pod) */}
                                                         <div 
                                                             onClick={(e) => e.stopPropagation()}
                                                             className="flex items-center gap-4 p-1.5 bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-full shadow-lg lg:mr-8 shrink-0 no-collapse"
                                                         >
                                                             {server.status === 'stopped' || server.status === 'crashed' ? (
                                                                 <div className="relative group/start">
                                                                     <button
                                                                         onClick={() => handleStartServer(server.id)}
                                                                         className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-full transition-all flex items-center justify-center"
                                                                         title={t('serverManager.tooltips.start')}
                                                                     >
                                                                         <Play className="w-5 h-5 fill-current" />
                                                                     </button>
                                                                     {/* Start Options Dropdown */}
                                                                     <div className="absolute top-full right-0 lg:left-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/start:opacity-100 group-hover/start:visible transition-all duration-200 z-50 overflow-hidden origin-top-right lg:origin-top-left scale-95 group-hover/start:scale-100">
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
                                                                     className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full transition-all flex items-center justify-center"
                                                                     title={t('serverManager.tooltips.stop')}
                                                                 >
                                                                     <Square className="w-5 h-5 fill-current" />
                                                                 </button>
                                                             ) : null}

                                                             <div className="relative group/dropdown">
                                                                 <button
                                                                     disabled={server.status === 'stopped'}
                                                                     className="p-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 rounded-full transition-all disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
                                                                     title={t('serverManager.tooltips.restartOptions')}
                                                                 >
                                                                     <RotateCw className="w-5 h-5" />
                                                                 </button>

                                                                 {/* Dropdown Menu */}
                                                                 <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/dropdown:scale-100">
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
                                                                 className="p-2 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 rounded-full transition-all disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
                                                                 title={t('serverManager.tooltips.showConsole')}
                                                             >
                                                                 <AppWindow className="w-5 h-5" />
                                                             </button>

                                                             <div className="w-px h-6 bg-white/10 mx-1"></div>

                                                             {/* Update Server Dropdown */}
                                                             <div className="relative group/update">
                                                                 <button
                                                                     onClick={() => handleUpdateServer(server.id)}
                                                                     className={cn(
                                                                         "p-2 rounded-full transition-all flex items-center justify-center relative",
                                                                         isServerOutdated(server.id)
                                                                             ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 bg-amber-500/5 shadow-[0_0_10px_rgba(245,158,11,0.15)] border border-amber-500/30"
                                                                             : updateOnStart 
                                                                                 ? "text-green-400 hover:text-green-300 hover:bg-green-500/10 bg-green-500/5 shadow-[0_0_10px_rgba(34,197,94,0.1)]" 
                                                                                 : "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                                                     )}
                                                                     title={isServerOutdated(server.id) ? t('serverManager.tooltips.updateRequired', 'New update available! Click to install.') : t('serverManager.tooltips.update')}
                                                                 >
                                                                     <Download className="w-5 h-5" />
                                                                     {isServerOutdated(server.id) && (
                                                                         <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                                                                     )}
                                                                 </button>
                                                                 
                                                                 {/* Update Options Dropdown */}
                                                                 <div className="absolute top-full right-0 mt-2 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/update:opacity-100 group-hover/update:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/update:scale-100">
                                                                     <button
                                                                         onClick={() => handleUpdateServer(server.id)}
                                                                         className="w-full text-left px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                                                                     >
                                                                         <Download className="w-4 h-4" />
                                                                         <span>{t('serverManager.tooltips.update', 'Update Server Now')}</span>
                                                                     </button>
                                                                     <label className="w-full text-left px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2 border-t border-slate-800 cursor-pointer">
                                                                         <input
                                                                             type="checkbox"
                                                                             checked={updateOnStart}
                                                                             onChange={(e) => setUpdateOnStart(e.target.checked)}
                                                                             className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-sky-500/50 cursor-pointer"
                                                                         />
                                                                         <span>{t('serverManager.buttons.updateOnStart', 'Update on Start')}</span>
                                                                     </label>
                                                                 </div>
                                                             </div>

                                                             {/* Server Settings Dropdown */}
                                                             <div className="relative group/settings">
                                                                 <button
                                                                     onClick={() => navigate('/config', { state: { serverId: server.id } })}
                                                                     className="p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-full transition-all flex items-center justify-center"
                                                                     title={t('serverManager.tooltips.settings')}
                                                                 >
                                                                     <Settings className="w-5 h-5" />
                                                                 </button>

                                                                 {/* Settings Options Dropdown */}
                                                                 <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/settings:opacity-100 group-hover/settings:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/settings:scale-100">
                                                                     <button
                                                                         onClick={() => navigate('/config', { state: { serverId: server.id } })}
                                                                         className="w-full text-left px-4 py-3 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                                                                     >
                                                                         <Settings className="w-4 h-4" />
                                                                         <span>{t('serverManager.tooltips.settings')}</span>
                                                                     </button>
                                                                     <button
                                                                         onClick={() => openCloneModal(server)}
                                                                         className="w-full text-left px-4 py-3 hover:bg-sky-500/10 text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                                                                     >
                                                                         <Copy className="w-4 h-4" />
                                                                         <span>{t('serverManager.tooltips.clone')}</span>
                                                                     </button>
                                                                     <button
                                                                         onClick={() => setDeleteConfirmServer(server)}
                                                                         className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                                                                     >
                                                                         <Trash2 className="w-4 h-4" />
                                                                         <span>{t('serverManager.tooltips.delete')}</span>
                                                                     </button>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     </div>

                            {/* Expand/Collapse Toggle Indicator */}
                            <div className="absolute right-6 top-6 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                {collapsedServers[server.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </div>

                            {/* Collapsible Section */}
                            <AnimatePresence initial={false}>
                                {!collapsedServers[server.id] && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >

                            {/* Server Details Footer */}
                            <div className="mt-6 p-5 bg-slate-950/30 rounded-xl border border-slate-800/50 shadow-inner">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <FolderOpen className="w-4 h-4" />
                                            <p className="text-[11px] uppercase tracking-wider font-semibold">{t('serverManager.serverDetails.installPath')}</p>
                                        </div>
                                        <p className="text-slate-300 font-mono text-xs truncate bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 shadow-inner" title={server.installPath}>{server.installPath}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <Users className="w-4 h-4" />
                                            <p className="text-[11px] uppercase tracking-wider font-semibold">{t('serverManager.serverDetails.maxPlayers')}</p>
                                        </div>
                                        <p className="text-slate-300 text-xs bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 shadow-inner truncate">{server.config.maxPlayers} {t('serverManager.serverDetails.survivors')}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <PenLine className="w-4 h-4" />
                                            <p className="text-[11px] uppercase tracking-wider font-semibold">{t('serverManager.serverDetails.sessionName')}</p>
                                        </div>
                                        <p className="text-slate-300 text-xs truncate bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 shadow-inner">{server.config.sessionName}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <Network className="w-4 h-4" />
                                            <p className="text-[11px] uppercase tracking-wider font-semibold">{t('serverManager.serverDetails.connection')}</p>
                                        </div>
                                        <p className="text-slate-300 font-mono text-xs bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 shadow-inner truncate">
                                            {server.ipAddress ? server.ipAddress : "0.0.0.0"} : {server.ports.gamePort}
                                        </p>
                                    </div>
                                </div>

                                {/* Automation Controls */}
                                <div className="mt-5 pt-5 border-t border-slate-800/50 flex flex-wrap items-center gap-x-8 gap-y-4">
                                    <div className="flex items-center gap-2">
                                        <Cpu className="w-4 h-4 text-sky-400" />
                                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">{t('serverManager.serverDetails.automation')}</span>
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

                                {server.autoStart && (
                                    <div className="flex items-center gap-3 bg-slate-800/40 px-3 py-1 rounded-lg border border-slate-700/50 animate-in fade-in duration-200 text-xs">
                                        <div className="flex items-center gap-1.5 text-slate-400">
                                            <span>Delay:</span>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={server.startupDelay !== undefined ? server.startupDelay : ''}
                                                onChange={async (e) => {
                                                    const delay = parseInt(e.target.value) || 0;
                                                    try {
                                                        await setServerStartupConfig(server.id, delay, server.startupPriority || 0);
                                                        // Update state
                                                        const updated = servers.map(s => s.id === server.id ? { ...s, startupDelay: delay } : s);
                                                        setServers(updated);
                                                    } catch (err) {
                                                        console.error("Failed to update delay:", err);
                                                    }
                                                }}
                                                className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono text-center focus:outline-none focus:border-sky-500"
                                            />
                                            <span>s</span>
                                        </div>
                                        <div className="w-px h-3 bg-slate-700"></div>
                                        <div className="flex items-center gap-1.5 text-slate-400">
                                            <span>Priority:</span>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={server.startupPriority !== undefined ? server.startupPriority : ''}
                                                onChange={async (e) => {
                                                    const priority = parseInt(e.target.value) || 0;
                                                    try {
                                                        await setServerStartupConfig(server.id, server.startupDelay || 0, priority);
                                                        // Update state
                                                        const updated = servers.map(s => s.id === server.id ? { ...s, startupPriority: priority } : s);
                                                        setServers(updated);
                                                    } catch (err) {
                                                        console.error("Failed to update priority:", err);
                                                    }
                                                }}
                                                className="w-10 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono text-center focus:outline-none focus:border-sky-500"
                                            />
                                        </div>
                                    </div>
                                )}

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
                            </div>

                            {/* Real-time Update Progress Panel */}
                            {(() => {
                                const normalizedPath = normalizePath(server.installPath);
                                const activeInstall = activeInstalls[normalizedPath];
                                const showUpdatePanel = server.status === 'updating' || (activeInstall && (!activeInstall.isComplete || activeInstall.isError));
                                
                                if (!showUpdatePanel) return null;

                                return (
                                    <div className="mt-5 bg-slate-900/60 backdrop-blur-sm rounded-xl border border-blue-500/20 p-5 shadow-inner animate-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                                <span className="text-sm font-bold text-white uppercase tracking-wider">
                                                    {t('serverManager.statusBar.updateMode', 'SteamCMD Update Mode')}: {activeInstall?.stage || 'Connecting'}
                                                </span>
                                            </div>
                                            <span className="text-xs font-mono font-bold text-blue-400">
                                                {activeInstall ? `${Math.round(activeInstall.progress)}%` : '0%'}
                                            </span>
                                        </div>
                                        
                                        {/* Premium animated progress bar */}
                                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800 shadow-inner">
                                            <div 
                                                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                                style={{ width: `${activeInstall?.progress || 0}%` }}
                                            />
                                        </div>

                                        <p className="text-xs text-slate-400 mt-2 italic">
                                            {activeInstall?.message || t('serverManager.statusBar.startingUpdate', 'Starting SteamCMD wrapper process...')}
                                        </p>

                                        {/* Error state with recovery actions */}
                                        {activeInstall?.isError && (
                                            <div className="mt-4 p-4 bg-red-950/20 border border-red-500/20 rounded-xl space-y-4">
                                                <p className="text-sm text-red-400 font-semibold flex items-center gap-2">
                                                    <AlertTriangle className="w-4 h-4" />
                                                    <span>Update Failed: {activeInstall.message || 'Unknown error'}</span>
                                                </p>
                                                <div className="flex flex-wrap gap-3">
                                                    <button
                                                        onClick={() => {
                                                            removeInstall(server.installPath);
                                                            handleUpdateServer(server.id);
                                                        }}
                                                        className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                                                    >
                                                        {t('dialogs.installServer.tryAgain', 'Try Again')}
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const { repairSteamcmd } = await import('../utils/tauri');
                                                                toast.loading('Repairing SteamCMD...', { id: 'repair' });
                                                                await repairSteamcmd();
                                                                toast.success('SteamCMD repaired! Try updating again.', { id: 'repair' });
                                                            } catch (e) {
                                                                toast.error(`Repair failed: ${e}`, { id: 'repair' });
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                                                    >
                                                        {t('dialogs.installServer.repairSteamcmd', 'Repair SteamCMD')}
                                                    </button>
                                                    <button
                                                        onClick={() => removeInstall(server.installPath)}
                                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
                                                    >
                                                        {t('common.dismiss', 'Dismiss')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Collapsible Console View */}
                                        <div className="mt-3 border-t border-slate-800/50 pt-3">
                                            <button
                                                onClick={() => setShowUpdateConsole(prev => ({ ...prev, [server.id]: !prev[server.id] }))}
                                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors select-none font-semibold uppercase tracking-wider"
                                            >
                                                <Terminal className="w-3.5 h-3.5" />
                                                <span>{showUpdateConsole[server.id] ? t('serverManager.statusBar.hideLogs', 'Hide Console Logs') : t('serverManager.statusBar.showLogs', 'Show Console Logs')}</span>
                                                <span className="text-[10px] bg-slate-850 border border-slate-800/80 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                                                    {activeInstall?.logs?.length || 0} lines
                                                </span>
                                            </button>

                                            {showUpdateConsole[server.id] && (
                                                <div className="mt-2.5 bg-black/85 rounded-lg p-3 font-mono text-[11px] h-48 overflow-y-auto border border-slate-800/80 shadow-inner space-y-1 scrollbar-thin select-text">
                                                    {!activeInstall || activeInstall.logs.length === 0 ? (
                                                        <div className="text-slate-600 italic">{t('serverManager.statusBar.waitingOutput', 'Waiting for SteamCMD stream output...')}</div>
                                                    ) : (
                                                        activeInstall.logs.map((log, i) => (
                                                            <div key={i} className="flex gap-2.5 items-start leading-relaxed">
                                                                <span className="text-slate-600 select-none shrink-0">{log.timestamp}</span>
                                                                <span className={cn(
                                                                    "break-all",
                                                                    log.lineType === 'error' && 'text-red-400 font-bold',
                                                                    log.lineType === 'success' && 'text-green-400 font-bold',
                                                                    log.lineType === 'warning' && 'text-yellow-400',
                                                                    log.lineType === 'progress' && 'text-blue-400',
                                                                    log.lineType === 'info' && 'text-slate-300'
                                                                )}>
                                                                    {log.line}
                                                                </span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            <ServerStatusBar serverId={server.id} serverType="ASA" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

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
                                                    // Server status - indigo
                                                    else if (line.includes("Server:") || line.includes("Status")) {
                                                        colorClass = "text-indigo-400";
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
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                </div>
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
