import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Plus, Play, Square, RotateCw, Trash2, Download, Settings, Terminal, Globe, Shield,
    ChevronDown, ChevronUp, Copy, AppWindow, RefreshCw, ExternalLink,
    Check, XCircle, GripVertical, Network, FolderOpen, Users, PenLine, Cpu, HelpCircle,
    Loader2, AlertTriangle, GitBranch, FileText, Edit2, LayoutGrid, LayoutList, Sparkles, Timer
} from 'lucide-react';
import { useServerStore } from '../stores/serverStore';
import { useInstallStore, normalizePath } from '../stores/installStore';
import { cn } from '../utils/helpers';
import ImportServerDialog from '../components/server/ImportServerDialog';
import ImportNonDedicatedDialog from '../components/server/ImportNonDedicatedDialog';
import ExportProfileModal from '../components/server/ExportProfileModal';
import CloneOptionsModal from '../components/server/CloneOptionsModal';
import MoveServerDialog from '../components/server/MoveServerDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PortConflictModal from '../components/server/PortConflictModal';
import { TimedShutdownModal } from '../components/server/TimedShutdownModal';
import { ServerTimedShutdownBanner } from '../components/server/ServerTimedShutdownBanner';
import { useServerOrganizationStore } from '../stores/serverOrganizationStore';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

import { startServer, stopServer, restartServer, deleteServer, checkServerHasSaves, ServerSaveInfo, updateServer, updateServerSettings, getServerLogs, cloneServer, transferSettings, extractSaveData, showServerConsole, hardcoreRetryMods, startServerNoMods, toggleServerAutomation, checkPortConflicts, ConflictCheckResult, setServerStartupConfig, moveServer, clearModCache, openInExplorer } from '../utils/tauri';
import { updateServerCustomization as apiUpdateServerCustomization } from '../utils/serverOrganization';
import toast from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import { useNavigate } from 'react-router-dom';
import { Server, ServerStartupProgressEvent } from '../types';
import ServerStatusBar from '../components/server/ServerStatusBar';
import ServerOrganizationBar from '../components/server/ServerOrganizationBar';
import { usePublicIP } from '../hooks/usePublicIP';
import serverBrowserGuide from '../assets/server_browser_guide.png';

import versionData from '../version.json';

interface ServerLogEvent {
    server_id: number;
    line: string;
    is_stderr: boolean;
}

export default function ServerManager() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: publicIp } = usePublicIP();
    const getServerDisplayIp = (ip?: string | null) => (ip && ip !== "0.0.0.0" && ip !== "127.0.0.1") ? ip : (publicIp || "0.0.0.0");
    const { 
        servers, 
        setServers, 
        removeServer, 
        updateServerStatus, 
        refreshServers,
        serverVersions,
        latestPublicVersion,
        fetchServerVersion,
        fetchAllServerVersions,
        fetchLatestPublicVersion,
        isServerOutdated
    } = useServerStore();
    const { activeInstalls, removeInstall, setDraftOpen } = useInstallStore();
    const [serverLogs, setServerLogs] = useState<Record<number, string[]>>({});
    const [expandedConsoles, setExpandedConsoles] = useState<Record<number, boolean>>({});
    const [showUpdateConsole, setShowUpdateConsole] = useState<Record<number, boolean>>({});
    const consoleRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const [appVersion] = useState<string>(versionData.version);
    const [cloneModalServer, setCloneModalServer] = useState<Server | null>(null);
    const [deleteConfirmServer, setDeleteConfirmServer] = useState<Server | null>(null);
    const [deleteSaveInfo, setDeleteSaveInfo] = useState<ServerSaveInfo | null>(null);
    const [forceStopServerId, setForceStopServerId] = useState<number | null>(null);
    const [timedShutdownServer, setTimedShutdownServer] = useState<Server | null>(null);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [showNonDedicatedImport, setShowNonDedicatedImport] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportTargetServerIds, setExportTargetServerIds] = useState<number[]>([]);
    const [updateOnStart, setUpdateOnStart] = useState(false);
    const [serverUpdateSettings, setServerUpdateSettings] = useState<Record<number, { auto_update: boolean, update_on_start: boolean }>>({});

    useEffect(() => {
        servers.forEach(async (srv) => {
            try {
                const res = await invoke<{ auto_update: boolean, update_on_start: boolean }>('get_server_update_settings', { serverId: srv.id });
                setServerUpdateSettings(prev => ({ ...prev, [srv.id]: res }));
            } catch (e) {
                console.error(e);
            }
        });
    }, [servers]);

    const handleToggleAutoUpdate = async (serverId: number, enabled: boolean) => {
        try {
            await invoke('set_auto_update', { serverId, enabled });
            setServerUpdateSettings(prev => ({
                ...prev,
                [serverId]: { ...prev[serverId], auto_update: enabled }
            }));
            toast.success(enabled ? 'Auto-Update enabled! Server will broadcast and update on new release.' : 'Auto-Update disabled');
        } catch (err: any) {
            toast.error(`Failed to update setting: ${err}`);
        }
    };

    const handleToggleUpdateOnStart = async (serverId: number, enabled: boolean) => {
        try {
            await invoke('set_update_on_start', { serverId, enabled });
            setServerUpdateSettings(prev => ({
                ...prev,
                [serverId]: { ...prev[serverId], update_on_start: enabled }
            }));
            toast.success(enabled ? 'Update on Start enabled' : 'Update on Start disabled');
        } catch (err: any) {
            toast.error(`Failed to update setting: ${err}`);
        }
    };
    const [selectedServers, setSelectedServers] = useState<number[]>([]);
    const [showGuide, setShowGuide] = useState(false);
    
    // Move Server State
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [moveServerTarget, setMoveServerTarget] = useState<Server | null>(null);
    const [moveServerPath, setMoveServerPath] = useState<string>('');
    const [isBulkMove, setIsBulkMove] = useState(false);
    
    // UI QoL State
    const { customizations, updateServerCustomization } = useServerOrganizationStore();
    const [editingServerId, setEditingServerId] = useState<number | null>(null);
    const [editServerName, setEditServerName] = useState("");
    const [collapsedServers, setCollapsedServers] = useState<Record<number, boolean>>({});

    const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => (localStorage.getItem('arkServerManagerViewMode') as 'list' | 'grid') || 'grid');

    const toggleViewMode = (mode: 'list' | 'grid') => {
        setViewMode(mode);
        localStorage.setItem('arkServerManagerViewMode', mode);
    };

    const [serverOrder, setServerOrder] = useState<number[]>(() => {
        const saved = localStorage.getItem('arkServerOrder');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('arkServerOrder', JSON.stringify(serverOrder));
    }, [serverOrder]);

    const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
    const { snapshot } = useServerOrganizationStore();

    const filteredCategoryServers = servers.filter(server => {
        if (selectedFolderId !== null) {
            const serverFolderIds = snapshot?.servers?.find((s: any) => s.id === server.id)?.folderIds || [];
            if (!serverFolderIds.includes(selectedFolderId)) return false;
        }
        return true;
    });

    const orderedServers = [...filteredCategoryServers].sort((a, b) => {
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

    const handleRenameSave = async (server: Server) => {
        if (editingServerId === server.id) {
            const newName = editServerName.trim();
            if (!newName) {
                toast.error(t('serverManager.errors.emptyName', 'Profile name cannot be empty.'));
                setEditingServerId(null);
                return;
            }

            try {
                // Save ONLY to SQLite backend 'server_customization' table (displayName)
                // DO NOT alter the INI server name (SessionName in GameUserSettings.ini)
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
                const updatedCustom = { ...custom, displayName: newName };
                await apiUpdateServerCustomization(updatedCustom);
                updateServerCustomization(updatedCustom);

                toast.success(t('serverManager.nameUpdated', `Profile name updated to "${newName}"`));
            } catch (err) {
                console.error("Failed to rename server profile:", err);
                toast.error(t('serverManager.renameFailed', 'Failed to update profile name.'));
            } finally {
                setEditingServerId(null);
            }
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

    const handleExportProfile = (server?: Server, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (server) {
            setExportTargetServerIds([server.id]);
        } else if (selectedServers.length > 0) {
            setExportTargetServerIds(selectedServers);
        } else {
            setExportTargetServerIds(servers.map(s => s.id));
        }
        setShowExportModal(true);
    };

    // Baseline: number of log lines at server start, so we only detect startup in NEW lines
    const [logBaseline, setLogBaseline] = useState<Record<number, number>>({});

    // Startup Progress State
    const [startupProgress, setStartupProgress] = useState<Record<number, { elapsed: number, confirmed: boolean }>>({});
    
    // Move Progress State
    const [moveProgress, setMoveProgress] = useState<Record<number, { status: string, progress: number }>>({});

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

    const handleAutoFixPorts = async (newPorts: { gamePort: number; queryPort: number; rconPort: number }) => {
        if (!pendingStartParams) return;
        const targetServerId = pendingStartParams.id;
        try {
            await updateServerSettings({
                serverId: targetServerId,
                gamePort: newPorts.gamePort,
                queryPort: newPorts.queryPort,
                rconPort: newPorts.rconPort,
            });

            toast.success(
                `Ports reassigned: Game (${newPorts.gamePort}), Query (${newPorts.queryPort}), RCON (${newPorts.rconPort})`
            );

            await refreshServers();

            if (pendingStartParams.noMods) {
                await handleStartServerNoMods(targetServerId, true);
            } else {
                await handleStartServer(targetServerId, true);
            }
        } catch (err) {
            console.error("Failed to auto-fix ports:", err);
            toast.error(`Auto-fix ports failed: ${err}`);
        } finally {
            setShowConflictModal(false);
            setPendingStartParams(null);
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

    const handleMoveServer = async (serverId: number) => {
        try {
            const server = servers.find(s => s.id === serverId);
            if (!server) return;
            
            if (server.status !== 'stopped' && server.status !== 'crashed') {
                toast.error(t('serverManager.move.mustBeStopped', 'Server must be stopped before moving.'));
                return;
            }

            const selectedPath = await open({
                directory: true,
                multiple: false,
                title: t('serverManager.move.selectFolder', 'Select New Server Directory')
            });

            if (selectedPath && !Array.isArray(selectedPath)) {
                setMoveServerTarget(server);
                setMoveServerPath(selectedPath as string);
                setIsBulkMove(false);
                setShowMoveDialog(true);
            }
        } catch (error) {
            console.error('Failed to prepare move server:', error);
            toast.error(t('serverManager.move.failed', 'Failed to prepare move server.'));
        }
    };

    const handleClearModCache = async (serverId: number) => {
        try {
            const server = servers.find(s => s.id === serverId);
            if (!server) return;

            if (server.status !== 'stopped' && server.status !== 'crashed') {
                toast.error(t('serverManager.modCache.mustBeStopped', 'Server must be stopped before clearing mod cache.'));
                return;
            }

            toast.loading(t('serverManager.modCache.clearing', 'Clearing mod cache...'), { id: 'clear-mod-cache' });
            const result = await clearModCache(serverId);
            toast.success(result, { id: 'clear-mod-cache', duration: 6000, icon: '🧹' });
        } catch (error) {
            console.error('Failed to clear mod cache:', error);
            toast.error(t('serverManager.modCache.failed', 'Failed to clear mod cache.'), { id: 'clear-mod-cache' });
        }
    };

    const confirmMoveServer = async () => {
        if (!moveServerPath) return;

        if (isBulkMove) {
            try {
                toast.success(t('serverManager.move.startedBulk', { count: selectedServers.length, defaultValue: `Moving ${selectedServers.length} servers...` }));
                
                let successCount = 0;
                for (const serverId of selectedServers) {
                    try {
                        const server = servers.find(s => s.id === serverId);
                        if (server) {
                            toast.loading(t('serverManager.move.movingServer', { name: server.name, defaultValue: `Moving ${server.name}...` }), { id: 'bulk-move' });
                            await moveServer(serverId, moveServerPath, false);
                            successCount++;
                        }
                    } catch (err) {
                        console.error(`Failed to move server ${serverId}:`, err);
                        toast.error(t('serverManager.move.bulkFailedOne', { defaultValue: 'Failed to move a server.' }));
                    }
                }
                
                if (successCount > 0) {
                    toast.success(t('serverManager.move.bulkSuccess', { count: successCount, defaultValue: `Successfully moved ${successCount} servers!` }), { id: 'bulk-move' });
                } else {
                    toast.dismiss('bulk-move');
                }
                
                refreshServers();
                setSelectedServers([]);
            } catch (error) {
                console.error('Failed to bulk move servers:', error);
                toast.error(t('serverManager.move.failed', 'Failed to move servers.'));
                toast.dismiss('bulk-move');
            }
        } else if (moveServerTarget) {
            try {
                toast.success(t('serverManager.move.started', 'Moving server...'));
                
                await moveServer(moveServerTarget.id, moveServerPath, false);
                
                toast.success(t('serverManager.move.success', 'Server moved successfully!'));
                refreshServers();
            } catch (error) {
                console.error('Failed to move server:', error);
                toast.error(t('serverManager.move.failed', 'Failed to move server.'));
                refreshServers();
            }
        }
    };


    useEffect(() => {
        let unlistenStatus: (() => void) | undefined;
        let unlistenProgress: (() => void) | undefined;
        let unlistenMove: (() => void) | undefined;
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

            const uMove = await listen<{ server_id: number, status: string, progress: number }>('server-move-progress', (event) => {
                if (!isMounted) return;
                setMoveProgress(prev => ({
                    ...prev,
                    [event.payload.server_id]: {
                        status: event.payload.status,
                        progress: event.payload.progress
                    }
                }));
            });
            if (!isMounted) {
                uMove();
            } else {
                unlistenMove = uMove;
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

        // Poll for server status updates
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') refreshServers();
        }, 10000);

        return () => {
            isMounted = false;
            if (unlistenStatus) unlistenStatus();
            if (unlistenProgress) unlistenProgress();
            if (unlistenMove) unlistenMove();
            clearInterval(interval);
        };
    }, [setServers, updateServerStatus, refreshServers, t]);

    // Fetch latest public version & local server versions on mount/server changes
    useEffect(() => {
        fetchLatestPublicVersion();
        fetchAllServerVersions();
    }, [servers]);

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
                        // already running from DB Ã¢â‚¬â€ check ALL lines for startup.
                        if (logBaseline[server.id] !== undefined) {
                            // Baseline already set by handleStartServer Ã¢â‚¬â€ update to actual line count
                            setLogBaseline(prev => ({
                                ...prev,
                                [server.id]: logLines.length
                            }));
                        } else if (server.status === 'running' || server.status === 'starting') {
                            // Server loaded as 'running' from DB Ã¢â‚¬â€ check all lines now
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
            // Set baseline marker Ã¢â‚¬â€ will be updated to actual line count after initial fetch
            setLogBaseline(prev => ({ ...prev, [serverId]: 0 }));
            setLogsFetched(prev => ({ ...prev, [serverId]: false }));
            setExpandedConsoles(prev => ({ ...prev, [serverId]: true })); // Auto-expand console
            setServerLogs(prev => ({ ...prev, [serverId]: [] })); // Clear old logs

            await startServer(serverId, updateOnStart);

            // Don't set to 'running' Ã¢â‚¬â€ keep 'starting' until STDERR/STDOUT detection confirms 'online'
            toast.success(updateOnStart ? t('serverManager.updatingAndStarting') : t('serverManager.serverStarted'));
            setUpdateOnStart(false); // Reset toggle
        } catch (error: any) {
            updateServerStatus(serverId, 'stopped');
            // Log error to the in-app console so it persists
            const errorMsg = String(error);
            setServerLogs(prev => ({
                ...prev,
                [serverId]: [...(prev[serverId] || []), `Ã¢ÂÅ’ STARTUP FAILED: ${errorMsg}`]
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
            // Don't set to 'running' Ã¢â‚¬â€ keep 'starting' until detection confirms 'online'
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

    const handleRestartServer = async (serverId: number, wipeDinos?: boolean) => {
        try {
            updateServerStatus(serverId, 'starting');
            setLogBaseline(prev => ({ ...prev, [serverId]: 0 }));
            setLogsFetched(prev => ({ ...prev, [serverId]: false }));
            await restartServer(serverId, wipeDinos);
            // Don't set to 'running' Ã¢â‚¬â€ keep 'starting' until detection confirms 'online'
            toast.success(wipeDinos ? t('serverManager.serverRestartedWipeDinos', 'Server restart initiated with wild dino wipe') : t('serverManager.serverRestarted'));
        } catch (error) {
            toast.error(t('serverManager.restartFailed', { error }));
        }
    };

    const handleInitiateDeleteServer = async (server: Server) => {
        setDeleteConfirmServer(server);
        setDeleteSaveInfo(null);
        try {
            const info = await checkServerHasSaves(server.id);
            setDeleteSaveInfo(info);
        } catch (_) {
            setDeleteSaveInfo(null);
        }
    };

    const confirmDeleteServer = async () => {
        if (!deleteConfirmServer) return;
        try {
            const serverId = deleteConfirmServer.id;
            const serverName = deleteConfirmServer.name;
            toast.loading(`Deleting server instance "${serverName}" and removing files on disk...`, { id: 'delete-server' });

            // Pass true to trigger complete folder removal on disk & SQL cascade
            await deleteServer(serverId, true);

            // Purge mod cache if available
            try { await clearModCache(serverId); } catch (_) {}

            removeServer(serverId);
            toast.success(`Server instance "${serverName}" deleted. Safety backup preserved if saves existed.`, { id: 'delete-server', icon: '🗑️' });
            setDeleteConfirmServer(null);
            setDeleteSaveInfo(null);
        } catch (error) {
            console.error('Failed to delete server:', error);
            toast.error(t('serverManager.deleteFailed', { error: String(error) }), { id: 'delete-server' });
        }
    };

    const handleUpdateServer = async (serverId: number) => {
        try {
            // Auto-expand the card details when starting an update
            setCollapsedServers(prev => ({ ...prev, [serverId]: false }));

            updateServerStatus(serverId, 'updating');
            const wasUpdated = await updateServer(serverId);
            updateServerStatus(serverId, 'stopped');

            // Force refresh local version for this server immediately so Update Available badge vanishes!
            const newVer = await fetchServerVersion(serverId, true);

            if (wasUpdated === false) {
                toast.success(t('serverManager.serverUpToDate', `Server up to date! (${newVer.split(' (')[0]})`), { id: `update-status-${serverId}` });
            } else {
                toast.success(t('serverManager.serverUpdated', `Server updated successfully! (${newVer.split(' (')[0]})`), { id: `update-status-${serverId}` });
            }
        } catch (error) {
            updateServerStatus(serverId, 'stopped');
            toast.error(t('serverManager.updateFailed', { error }));
        }
    };

    const handleBulkUpdateSelected = async () => {
        if (selectedServers.length === 0) return;
        toast(t('serverManager.startingParallelUpdates', { count: selectedServers.length, defaultValue: `Starting parallel update for ${selectedServers.length} server(s)...` }), { icon: 'ℹ️', id: 'bulk-update-start' });
        await Promise.all(selectedServers.map(id => handleUpdateServer(id)));
        await fetchAllServerVersions(true);
    };

    const handleUpdateAllOutdated = async () => {
        const outdatedServers = servers.filter(s => isServerOutdated(s.id));
        if (outdatedServers.length === 0) {
            toast.success(t('serverManager.allServersUpToDate', 'All servers are up to date!'), { id: 'all-up-to-date' });
            return;
        }
        toast(t('serverManager.startingParallelOutdatedUpdates', { count: outdatedServers.length, defaultValue: `Updating ${outdatedServers.length} outdated server(s) in parallel...` }), { icon: 'ℹ️', id: 'bulk-update-outdated' });
        await Promise.all(outdatedServers.map(s => handleUpdateServer(s.id)));
        await fetchAllServerVersions(true);
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
            // Don't set to 'running' Ã¢â‚¬â€ keep 'starting' until detection confirms 'online'
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
        const serversToStop = servers.filter(s => selectedServers.includes(s.id) && s.status !== 'stopped');
        if (serversToStop.length === 0) {
            toast.error(t('serverManager.noStoppableServersSelected', 'No active servers selected to stop.'));
            return;
        }

        toast.success(t('serverManager.bulkStopInitiated', { count: serversToStop.length }));
        await Promise.all(serversToStop.map(s => handleStopServer(s.id)));
        setSelectedServers([]); // Clear selection after stopping
    };

    const handleBulkMoveServers = async () => {
        try {
            if (selectedServers.length === 0) return;

            // Validate that all selected servers are stopped
            const selectedServerObjs = servers.filter(s => selectedServers.includes(s.id));
            const runningServers = selectedServerObjs.filter(s => s.status !== 'stopped' && s.status !== 'crashed');
            
            if (runningServers.length > 0) {
                toast.error(t('serverManager.move.bulkMustBeStopped', 'All selected servers must be stopped before moving.'));
                return;
            }

            const selectedPath = await open({
                directory: true,
                multiple: false,
                title: t('serverManager.move.selectFolder', 'Select New Server Directory')
            });

            if (selectedPath && !Array.isArray(selectedPath)) {
                setMoveServerPath(selectedPath as string);
                setIsBulkMove(true);
                setShowMoveDialog(true);
            }
        } catch (error) {
            console.error('Failed to bulk move servers:', error);
            toast.error(t('serverManager.move.failed', 'Failed to prepare move servers.'));
        }
    };

    const handleStopAll = async () => {
        const serversToStop = servers.filter(s => s.status !== 'stopped');
        if (serversToStop.length === 0) {
            toast.error(t('serverManager.noStoppableServers', 'No active servers available to stop.'));
            return;
        }

        toast.success(t('serverManager.bulkStopInitiated', { count: serversToStop.length }));
        await Promise.all(serversToStop.map(s => handleStopServer(s.id)));
    };

    const renderGridCard = (server: Server, index: number, provided: any, snapshot: any) => {
        const normalizedPath = normalizePath(server.installPath);
        const activeInstall = activeInstalls[normalizedPath];
        const showUpdatePanel = server.status === 'updating' || (activeInstall && (!activeInstall.isComplete || activeInstall.isError));

        return (
        <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            style={{
                ...provided.draggableProps.style,
                zIndex: snapshot.isDragging ? 100 : (orderedServers.length - index) * 10
            }}
            className={cn(
                "bg-slate-900/60 backdrop-blur-xl border rounded-2xl p-6 shadow-xl relative group flex flex-col transition-all duration-300 cursor-pointer hover:z-50 z-10",
                snapshot.isDragging 
                    ? "shadow-2xl shadow-sky-500/20 ring-2 ring-sky-500/50 cursor-grabbing scale-[1.02] z-[100]" 
                    : "hover:border-sky-500/50 hover:shadow-[0_12px_35px_rgba(14,165,233,0.18)]",
                server.status === 'online' ? "border-emerald-500/30 bg-slate-900/70" :
                server.status === 'running' || server.status === 'starting' ? "border-amber-500/30" :
                server.status === 'crashed' || server.status === 'startup_timeout' ? "border-rose-500/30" :
                "border-white/10"
            )}
            onClick={(e) => toggleCollapse(server.id, e)}
        >
            {/* Top Glow Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-sky-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-sky-500/10 blur-3xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />

            {/* Expand/Collapse Toggle Indicator */}
            <div className="absolute right-5 top-5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {collapsedServers[server.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>

            {/* Card Content Top */}
            <div>
                {/* Top Header Row */}
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                        {/* Drag handle */}
                        <div 
                            {...provided.dragHandleProps}
                            className="flex items-center justify-center w-5 h-5 cursor-grab text-slate-500 hover:text-white transition-colors no-collapse shrink-0"
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to reorder"
                        >
                            <GripVertical className="w-4 h-4" />
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
                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                selectedServers.includes(server.id)
                                    ? "bg-sky-500 border-sky-500 text-white"
                                    : "border-slate-600 bg-slate-900/50 hover:bg-slate-800/50 hover:border-sky-500/50"
                            )}>
                                {selectedServers.includes(server.id) && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                        </label>

                        {/* Status Dot */}
                        <div className="relative shrink-0 flex items-center">
                            <div className={cn(
                                'w-3.5 h-3.5 rounded-full',
                                server.status === 'running' && 'bg-yellow-500 animate-pulse',
                                server.status === 'online' && 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]',
                                server.status === 'stopped' && 'bg-slate-500',
                                server.status === 'crashed' && 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]',
                                server.status === 'starting' && 'bg-yellow-500 animate-pulse',
                                server.status === 'updating' && 'bg-blue-500 animate-pulse',
                                server.status === 'repairing' && 'bg-orange-500 animate-pulse'
                            )} />
                            {server.status === 'online' && (
                                <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20" />
                            )}
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className={cn(
                            'px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border flex items-center gap-1 shadow-inner',
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
                                className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md text-[10px] font-bold transition-colors flex items-center gap-1 no-collapse"
                                title={t('serverManager.tooltips.forceStop')}
                            >
                                <XCircle className="w-3 h-3" />
                                {server.status === 'starting' ? t('serverManager.buttons.cancel') : t('serverManager.buttons.forceStop')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Title Row & Edit */}
                <div className="mb-3 min-w-0">
                    {editingServerId === server.id ? (
                        <div className="flex items-center gap-2 no-collapse mb-2" onClick={(e) => e.stopPropagation()}>
                            <input 
                                type="text"
                                value={editServerName}
                                onChange={(e) => setEditServerName(e.target.value)}
                                onKeyDown={(e) => handleRenameKeyDown(e, server)}
                                onBlur={() => handleRenameSave(server)}
                                autoFocus
                                className="text-base font-bold bg-slate-900 border border-sky-500 rounded px-2.5 py-1 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 w-full"
                            />
                            <button
                                onClick={() => handleRenameSave(server)}
                                className="p-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg shrink-0"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-2 group/title mb-1.5">
                            <h3 
                                className="text-lg font-bold text-white group-hover/title:text-sky-400 transition-colors truncate cursor-pointer"
                                onClick={(e) => handleRenameStart(server, e)}
                                title="Click to rename"
                            >
                                {customizations.get(server.id)?.displayName || server.name}
                            </h3>
                            <button
                                onClick={(e) => handleRenameStart(server, e)}
                                className="p-1 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-md transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                title="Rename Server Profile"
                            >
                                <Edit2 className="w-3.5 h-3.5 text-sky-400" />
                            </button>
                        </div>
                    )}

                    {/* Profile Badge & Real Server Folder Link */}
                    <div className="flex items-center gap-2 max-w-full mb-3">
                        <div 
                            onClick={(e) => handleRenameStart(server, e)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 hover:border-sky-500/40 rounded-lg text-xs text-sky-300 font-mono font-medium cursor-pointer transition-all no-collapse max-w-full truncate"
                            title={`Click to rename profile | Server Path: ${server.installPath}`}
                        >
                            <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <span className="truncate">Profile: {customizations.get(server.id)?.displayName || server.name}</span>
                            <Edit2 className="w-3 h-3 text-sky-400/70 shrink-0 ml-0.5" />
                        </div>
                        {server.installPath && (
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        await openInExplorer(server.installPath);
                                        toast.success("Opened server directory in Explorer");
                                    } catch (err) {
                                        toast.error(`Cannot open folder: ${err}`);
                                    }
                                }}
                                className="p-1.5 bg-slate-800 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 rounded-lg transition-all shrink-0 cursor-pointer"
                                title={`Open real server folder on disk:\n${server.installPath}`}
                            >
                                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Grid Bento Meta Chips */}
                <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 truncate" title="Map">
                        <Globe className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                        <span className="truncate">{server.config.mapName}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 truncate" title="Port">
                        <Terminal className="w-3.5 h-3.5 text-violet-400/80 shrink-0" />
                        <span className="font-mono text-xs truncate">Port {server.ports.gamePort}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 truncate" title="App Version">
                        <Shield className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
                        <span className="font-mono text-xs truncate">v{appVersion}</span>
                    </div>
                    {serverVersions[server.id] && (
                        <div className="col-span-2 flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 truncate" title="Server Build">
                            <GitBranch className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                            <span className="font-mono text-xs truncate">{serverVersions[server.id]}</span>
                        </div>
                    )}
                </div>

                {/* Outdated Warning Badge */}
                {isServerOutdated(server.id) && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-bold animate-pulse mb-3">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{t('serverManager.status.updateAvailable', 'Update Available')}</span>
                    </div>
                )}
            </div>

            {/* Footer Actions Pod */}
            <div 
                onClick={(e) => e.stopPropagation()}
                className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 no-collapse mt-auto"
            >
                {/* Start / Stop Button */}
                {server.status === 'stopped' || server.status === 'crashed' ? (
                    <div className="relative group/gridstart">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleStartServer(server.id);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-green-500/10"
                            title="Start Server"
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Start</span>
                        </button>
                        {/* Start Options Dropdown */}
                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/gridstart:opacity-100 group-hover/gridstart:visible transition-all duration-200 z-50 overflow-hidden scale-95 group-hover/gridstart:scale-100">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartServer(server.id);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                            >
                                <Play className="w-3.5 h-3.5" />
                                <span>Normal Start</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartServerNoMods(server.id);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-yellow-500/10 text-yellow-400 hover:text-yellow-300 transition-colors flex items-center gap-2 border-t border-slate-800 cursor-pointer"
                                title="Start server without loading any mods"
                            >
                                <Shield className="w-3.5 h-3.5" />
                                <span>Start (No Mods)</span>
                            </button>
                        </div>
                    </div>
                ) : (server.status === 'running' || server.status === 'online') ? (
                    <div className="relative group/stop" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setTimedShutdownServer(server)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-red-500/10"
                            title="Stop / Shutdown Options"
                        >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>Stop</span>
                            <ChevronDown className="w-3 h-3 text-red-400/70" />
                        </button>

                        {/* Stop Options Dropdown */}
                        <div className="absolute top-full right-0 mt-2 w-52 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/stop:opacity-100 group-hover/stop:visible transition-all duration-200 z-50 overflow-hidden origin-top-right scale-95 group-hover/stop:scale-100">
                            <button
                                onClick={() => setTimedShutdownServer(server)}
                                className="w-full text-left px-3 py-2.5 text-xs hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2 font-medium"
                            >
                                <Timer className="w-4 h-4 text-amber-400 shrink-0" />
                                <div className="flex flex-col">
                                    <span className="font-bold">Timed Shutdown</span>
                                    <span className="text-[10px] text-slate-400 font-normal">Countdown with broadcasts</span>
                                </div>
                            </button>
                            <button
                                onClick={() => handleStopServer(server.id)}
                                className="w-full text-left px-3 py-2.5 text-xs hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 border-t border-slate-800 font-medium"
                            >
                                <Square className="w-4 h-4 fill-current text-red-400 shrink-0" />
                                <div className="flex flex-col">
                                    <span className="font-bold">Immediate Stop</span>
                                    <span className="text-[10px] text-slate-400 font-normal">Halt process right away</span>
                                </div>
                            </button>
                        </div>
                    </div>
                ) : (
                    <span className="text-xs text-yellow-400 font-bold flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Busy
                    </span>
                )}

                {/* Icon Bar */}
                <div className="flex items-center gap-1">
                    {/* Restart Dropdown */}
                    <div className="relative group/restart">
                        <button
                            disabled={server.status === 'stopped'}
                            className="p-1.5 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 rounded-lg transition-all disabled:opacity-30 flex items-center justify-center cursor-pointer"
                            title="Restart Options"
                        >
                            <RotateCw className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/restart:opacity-100 group-hover/restart:visible transition-all duration-200 z-50 overflow-hidden scale-95 group-hover/restart:scale-100">
                            <button
                                onClick={() => handleRestartServer(server.id)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                            >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>Normal Restart</span>
                            </button>
                            <button
                                onClick={() => handleRestartServer(server.id, true)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                                <span>Restart & Wipe Dinos</span>
                            </button>
                            <button
                                onClick={() => handleHardcoreRetry(server.id)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <Shield className="w-3.5 h-3.5" />
                                <span>Deep Repair</span>
                            </button>
                        </div>
                    </div>

                    {/* Console */}
                    <button
                        onClick={() => handleShowConsole(server.id)}
                        disabled={server.status === 'stopped'}
                        className="p-1.5 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 rounded-lg transition-all disabled:opacity-30 flex items-center justify-center cursor-pointer"
                        title="Open Console"
                    >
                        <AppWindow className="w-4 h-4" />
                    </button>

                    {/* Update Dropdown */}
                    <div className="relative group/gridupdate">
                        <button
                            onClick={() => handleUpdateServer(server.id)}
                            className={cn(
                                "p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer relative",
                                isServerOutdated(server.id)
                                    ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 bg-amber-500/5 border border-amber-500/30"
                                    : updateOnStart 
                                        ? "text-green-400 hover:text-green-300 hover:bg-green-500/10 bg-green-500/5" 
                                        : "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                            )}
                            title={isServerOutdated(server.id) ? t('serverManager.tooltips.updateRequired', 'New update available! Click to install.') : "Update Server"}
                        >
                            <Download className="w-4 h-4" />
                            {isServerOutdated(server.id) && (
                                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                            )}
                        </button>
                        <div className="absolute bottom-full right-0 mb-2 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/gridupdate:opacity-100 group-hover/gridupdate:visible transition-all duration-200 z-50 overflow-hidden scale-95 group-hover/gridupdate:scale-100">
                            <button
                                onClick={() => handleUpdateServer(server.id)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2 font-medium"
                            >
                                <Download className="w-3.5 h-3.5 text-sky-400" />
                                <span>{t('serverManager.tooltips.update', 'Update Server Now')}</span>
                            </button>
                            <label className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center justify-between border-t border-slate-800 cursor-pointer text-xs">
                                <div className="flex items-center gap-2">
                                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-xs font-semibold">{t('serverManager.buttons.updateOnStart', 'Update on Start')}</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={!!serverUpdateSettings[server.id]?.update_on_start}
                                    onChange={(e) => handleToggleUpdateOnStart(server.id, e.target.checked)}
                                    className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                                />
                            </label>
                            <label className="w-full text-left px-3 py-2 hover:bg-amber-500/10 text-amber-300 hover:text-amber-200 transition-colors flex items-center justify-between border-t border-slate-800 cursor-pointer text-xs">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                    <span className="text-xs font-semibold">Auto-Update on Release</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={!!serverUpdateSettings[server.id]?.auto_update}
                                    onChange={(e) => handleToggleAutoUpdate(server.id, e.target.checked)}
                                    className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Settings Dropdown */}
                    <div className="relative group/settings">
                        <button
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all flex items-center justify-center cursor-pointer"
                            title="More Options"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-full right-0 mb-2 w-52 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover/settings:opacity-100 group-hover/settings:visible transition-all duration-200 z-50 overflow-hidden scale-95 group-hover/settings:scale-100">
                            <button
                                onClick={() => navigate('/config', { state: { serverId: server.id } })}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                            >
                                <Settings className="w-3.5 h-3.5 text-violet-400" />
                                <span>Config Editor</span>
                            </button>
                            <button
                                onClick={() => navigate('/config', { state: { serverId: server.id, initialMode: 'gus' } })}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-amber-500/10 text-amber-300 hover:text-amber-200 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <FileText className="w-3.5 h-3.5 text-amber-400" />
                                <span>Edit Raw INI Files</span>
                            </button>
                            <button
                                onClick={() => navigate('/tools/files', { state: { initialPath: server.installPath } })}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-sky-500/10 text-sky-300 hover:text-sky-200 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                                <span>File Manager</span>
                            </button>
                            <button
                                onClick={() => handleMoveServer(server.id)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <FolderOpen className="w-3.5 h-3.5" />
                                <span>Move Server</span>
                            </button>
                            <button
                                onClick={() => openCloneModal(server)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-sky-500/10 text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Clone Server</span>
                            </button>
                            <button
                                onClick={() => handleClearModCache(server.id)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-orange-500/10 text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Clear Mod Cache</span>
                            </button>
                            <button
                                onClick={() => handleInitiateDeleteServer(server)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 border-t border-slate-800"
                            >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                <span>Delete Server</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Timed Shutdown Banner - always visible */}
            <ServerTimedShutdownBanner serverId={server.id} className="mt-3" />

            {/* Collapsible Details Section */}
            <AnimatePresence initial={false}>
                {!collapsedServers[server.id] && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        {/* Server Details Panel */}
                        <div className="mt-4 p-4 bg-slate-900/40 backdrop-blur-md rounded-xl border border-white/10 shadow-inner">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="space-y-1.5 group/field">
                                    <div className="flex items-center gap-1.5 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                        <FolderOpen className="w-3.5 h-3.5 text-sky-400/80" />
                                        <p className="text-[10px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.installPath')}</p>
                                    </div>
                                    <p className="text-slate-300 font-mono text-[11px] truncate bg-slate-950/40 p-2 rounded-lg border border-white/5 hover:border-white/10 transition-colors shadow-inner" title={server.installPath}>{server.installPath}</p>
                                </div>
                                <div className="space-y-1.5 group/field">
                                    <div className="flex items-center gap-1.5 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                        <Users className="w-3.5 h-3.5 text-sky-400/80" />
                                        <p className="text-[10px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.maxPlayers')}</p>
                                    </div>
                                    <p className="text-slate-300 text-[11px] bg-slate-950/40 p-2 rounded-lg border border-white/5 hover:border-white/10 transition-colors shadow-inner truncate">{server.config.maxPlayers} {t('serverManager.serverDetails.survivors')}</p>
                                </div>
                                <div className="space-y-1.5 group/field">
                                    <div className="flex items-center gap-1.5 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                        <PenLine className="w-3.5 h-3.5 text-sky-400/80" />
                                        <p className="text-[10px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.sessionName')}</p>
                                    </div>
                                    <p className="text-slate-300 text-[11px] truncate bg-slate-950/40 p-2 rounded-lg border border-white/5 hover:border-white/10 transition-colors shadow-inner">{server.config.sessionName}</p>
                                </div>
                                <div className="space-y-1.5 group/field">
                                    <div className="flex items-center gap-1.5 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                        <Network className="w-3.5 h-3.5 text-sky-400/80" />
                                        <p className="text-[10px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.connection')}</p>
                                    </div>
                                    <p className="text-slate-300 font-mono text-[11px] bg-slate-950/40 p-2 rounded-lg border border-white/5 hover:border-white/10 transition-colors shadow-inner truncate">
                                        {getServerDisplayIp(server.ipAddress)} : {server.ports.gamePort}
                                    </p>
                                </div>
                            </div>

                            {/* Move Progress */}
                            {moveProgress[server.id] && (
                                <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-800">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-xs font-semibold text-slate-300">Moving Server...</span>
                                        <span className="text-[10px] text-slate-400 truncate max-w-[50%]">
                                            {moveProgress[server.id].status}
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className="bg-sky-500 h-2 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(14,165,233,0.5)]" 
                                            style={{ width: `${Math.max(5, moveProgress[server.id].progress)}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                                        <span>{Math.round(moveProgress[server.id].progress)}%</span>
                                    </div>
                                </div>
                            )}

                            {/* Automation Controls */}
                            <div className="mt-4 pt-4 border-t border-slate-800/50 flex flex-wrap items-center gap-x-6 gap-y-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1.5">
                                    <Cpu className="w-3.5 h-3.5 text-sky-400" />
                                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{t('serverManager.serverDetails.automation')}</span>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer group/toggle select-none no-collapse">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.autoStart || false}
                                            onChange={() => handleToggleAutomation(server.id, 'auto_start', server.autoStart || false)}
                                        />
                                        <div className="relative w-9 h-5 bg-slate-950/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[14px] rtl:peer-checked:after:-translate-x-[14px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-emerald-400 after:rounded-full after:h-[16px] after:w-[16px] after:transition-all peer-checked:bg-emerald-500/20 peer-checked:border-emerald-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(52,211,153,0.5)] transition-all"></div>
                                    </div>
                                    <span className="text-slate-400 text-xs font-bold group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStart')}</span>
                                </label>

                                {server.autoStart && (
                                    <div className="flex items-center gap-2 bg-slate-950/40 px-2.5 py-1 rounded-lg border border-white/5 text-[10px] shadow-inner no-collapse">
                                        <div className="flex items-center gap-1 text-slate-400">
                                            <span className="font-semibold text-slate-500 uppercase tracking-wider">Delay:</span>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={server.startupDelay !== undefined ? server.startupDelay : ''}
                                                onChange={async (e) => {
                                                    const delay = parseInt(e.target.value) || 0;
                                                    try {
                                                        await setServerStartupConfig(server.id, delay, server.startupPriority || 0);
                                                        const updated = servers.map(s => s.id === server.id ? { ...s, startupDelay: delay } : s);
                                                        setServers(updated);
                                                    } catch (err) {
                                                        console.error("Failed to update delay:", err);
                                                    }
                                                }}
                                                className="w-10 bg-slate-950 border border-white/5 rounded-md px-1 py-0.5 text-white font-mono text-center text-[10px] focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50"
                                            />
                                            <span className="text-slate-500">s</span>
                                        </div>
                                        <div className="w-px h-3 bg-white/10"></div>
                                        <div className="flex items-center gap-1 text-slate-400">
                                            <span className="font-semibold text-slate-500 uppercase tracking-wider">Priority:</span>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={server.startupPriority !== undefined ? server.startupPriority : ''}
                                                onChange={async (e) => {
                                                    const priority = parseInt(e.target.value) || 0;
                                                    try {
                                                        await setServerStartupConfig(server.id, server.startupDelay || 0, priority);
                                                        const updated = servers.map(s => s.id === server.id ? { ...s, startupPriority: priority } : s);
                                                        setServers(updated);
                                                    } catch (err) {
                                                        console.error("Failed to update priority:", err);
                                                    }
                                                }}
                                                className="w-8 bg-slate-950 border border-white/5 rounded-md px-1 py-0.5 text-white font-mono text-center text-[10px] focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50"
                                            />
                                        </div>
                                    </div>
                                )}

                                <label className="flex items-center gap-2 cursor-pointer group/toggle select-none no-collapse">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.autoStop || false}
                                            onChange={() => handleToggleAutomation(server.id, 'auto_stop', server.autoStop || false)}
                                        />
                                        <div className="relative w-9 h-5 bg-slate-950/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[14px] rtl:peer-checked:after:-translate-x-[14px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-rose-400 after:rounded-full after:h-[16px] after:w-[16px] after:transition-all peer-checked:bg-rose-500/20 peer-checked:border-rose-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(244,63,94,0.5)] transition-all"></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-slate-400 text-xs font-bold group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStop')}</span>
                                        <span className="text-[9px] text-slate-500">{t('serverManager.serverDetails.onConfigChange')}</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer group/toggle select-none no-collapse">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.intelligentMode || false}
                                            onChange={() => handleToggleAutomation(server.id, 'intelligent_mode', server.intelligentMode || false)}
                                        />
                                        <div className="relative w-9 h-5 bg-slate-950/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[14px] rtl:peer-checked:after:-translate-x-[14px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-sky-400 after:rounded-full after:h-[16px] after:w-[16px] after:transition-all peer-checked:bg-sky-500/20 peer-checked:border-sky-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(14,165,233,0.5)] transition-all"></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1">
                                            <Shield className={cn("w-3.5 h-3.5 transition-colors", server.intelligentMode ? "text-sky-400" : "text-slate-500")} />
                                            <span className={cn("text-xs font-bold transition-colors", server.intelligentMode ? "text-sky-400" : "text-slate-400")}>{t('serverManager.serverDetails.intelligentMode')}</span>
                                        </div>
                                        <span className="text-[9px] text-slate-500" title={t('serverManager.tooltips.dataSafety')}>{t('serverManager.serverDetails.dataSafetyLabel')}</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Real-time Update Progress Panel */}
                        {showUpdatePanel && (
                            <div className="mt-3 bg-slate-900/60 backdrop-blur-sm rounded-xl border border-blue-500/20 p-4 shadow-inner animate-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                                            {t('serverManager.statusBar.updateMode', 'SteamCMD Update Mode')}: {activeInstall?.stage || 'Connecting'}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold text-blue-400">
                                        {activeInstall ? `${Math.round(activeInstall.progress)}%` : '0%'}
                                    </span>
                                </div>
                                
                                <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800 shadow-inner">
                                    <div 
                                        className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                        style={{ width: `${activeInstall?.progress || 0}%` }}
                                    />
                                </div>

                                <p className="text-[10px] text-slate-400 mt-1.5 italic truncate">
                                    {activeInstall?.message || t('serverManager.statusBar.startingUpdate', 'Starting SteamCMD wrapper process...')}
                                </p>

                                {/* Error state with recovery actions */}
                                {activeInstall?.isError && (
                                    <div className="mt-3 p-3 bg-red-950/20 border border-red-500/20 rounded-lg space-y-3">
                                        <p className="text-xs text-red-400 font-semibold flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            <span>Update Failed: {activeInstall.message || 'Unknown error'}</span>
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => {
                                                    removeInstall(server.installPath);
                                                    handleUpdateServer(server.id);
                                                }}
                                                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-semibold transition-all"
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
                                                className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 rounded-lg text-[10px] font-semibold transition-all"
                                            >
                                                {t('dialogs.installServer.repairSteamcmd', 'Repair SteamCMD')}
                                            </button>
                                            <button
                                                onClick={() => removeInstall(server.installPath)}
                                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-semibold transition-all"
                                            >
                                                {t('common.dismiss', 'Dismiss')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Collapsible Console View */}
                                <div className="mt-2 border-t border-slate-800/50 pt-2">
                                    <button
                                        onClick={() => setShowUpdateConsole(prev => ({ ...prev, [server.id]: !prev[server.id] }))}
                                        className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white transition-colors select-none font-semibold uppercase tracking-wider"
                                    >
                                        <Terminal className="w-3 h-3" />
                                        <span>{showUpdateConsole[server.id] ? t('serverManager.statusBar.hideLogs', 'Hide Console Logs') : t('serverManager.statusBar.showLogs', 'Show Console Logs')}</span>
                                        <span className="text-[9px] bg-slate-850 border border-slate-800/80 px-1 py-0.5 rounded text-slate-400 font-mono">
                                            {activeInstall?.logs?.length || 0} lines
                                        </span>
                                    </button>

                                    {showUpdateConsole[server.id] && (
                                        <div className="mt-2 bg-black/85 rounded-lg p-2 font-mono text-[10px] h-36 overflow-y-auto border border-slate-800/80 shadow-inner space-y-0.5 scrollbar-thin select-text">
                                            {!activeInstall || activeInstall.logs.length === 0 ? (
                                                <div className="text-slate-600 italic">{t('serverManager.statusBar.waitingOutput', 'Waiting for SteamCMD stream output...')}</div>
                                            ) : (
                                                activeInstall.logs.map((log, i) => (
                                                    <div key={i} className="flex gap-2 items-start leading-relaxed">
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
                        )}

                        <ServerStatusBar serverId={server.id} serverType="ASA" />

                        {/* Embedded Console */}
                        {(expandedConsoles[server.id] || serverLogs[server.id]?.length > 0) && (
                            <div className="mt-3 border-t border-slate-700/30 pt-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-2">
                                    <button
                                        onClick={() => toggleConsole(server.id)}
                                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 transition-colors no-collapse"
                                    >
                                        <Terminal className="w-3.5 h-3.5" />
                                        <span>{t('serverManager.serverDetails.consoleOutput')}</span>
                                        {expandedConsoles[server.id] ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                    </button>

                                    {(server.status === 'running' || server.status === 'online' || server.status === 'starting') && (
                                        <button
                                            onClick={() => handleShowConsole(server.id)}
                                            className="flex items-center gap-1 px-2 py-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 hover:text-violet-300 border border-violet-500/20 rounded-lg text-[10px] font-medium transition-all no-collapse"
                                            title={t('serverManager.tooltips.showConsoleBtn')}
                                        >
                                            <AppWindow className="w-3 h-3" />
                                            <span>{t('serverManager.serverDetails.showConsole')}</span>
                                        </button>
                                    )}
                                </div>

                                {expandedConsoles[server.id] && (
                                    <div
                                        ref={el => { consoleRefs.current[server.id] = el; }}
                                        className="bg-slate-950 rounded-lg p-2.5 font-mono text-[10px] h-36 overflow-y-auto border border-slate-800"
                                    >
                                        {(serverLogs[server.id] || []).length === 0 ? (
                                            <p className="text-slate-500 italic">{t('serverManager.serverDetails.waitingOutput')}</p>
                                        ) : (
                                            (serverLogs[server.id] || []).map((lineItem, idx) => {
                                                let line = "";
                                                if (typeof lineItem === 'string') {
                                                    line = lineItem;
                                                } else if (lineItem === null || lineItem === undefined) {
                                                    line = "";
                                                } else {
                                                    line = JSON.stringify(lineItem) || "";
                                                }

                                                let colorClass = "text-slate-300";
                                                if (typeof line === 'string') {
                                                    if (line.includes('Error') || line.includes('error') || line.includes('FAIL')) colorClass = "text-red-400 font-bold";
                                                    else if (line.includes('Warning') || line.includes('warning')) colorClass = "text-yellow-400";
                                                    else if (line.includes('success') || line.includes('Done') || line.includes('Success')) colorClass = "text-green-400 font-bold";
                                                    else if (line.includes('[online]') || line.includes('Full Startup')) colorClass = "text-emerald-400 font-bold";
                                                }

                                                return (
                                                    <div key={idx} className={cn("leading-relaxed break-all", colorClass)}>
                                                        {line}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        );
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
                        {latestPublicVersion && (
                            <span className="ml-3 inline-flex items-center gap-1.5 px-3 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-full text-xs font-bold font-mono">
                                Latest Public Build: {latestPublicVersion}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* View Mode Switcher */}
                    <div className="flex items-center gap-1 bg-slate-900/60 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-inner">
                        <button
                            onClick={() => toggleViewMode('grid')}
                            className={cn(
                                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                                viewMode === 'grid'
                                    ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm shadow-sky-500/20"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                            )}
                            title="Grid View (Bento Box Cards)"
                        >
                            <LayoutGrid className="w-4 h-4" />
                            <span>Grid</span>
                        </button>
                        <button
                            onClick={() => toggleViewMode('list')}
                            className={cn(
                                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                                viewMode === 'list'
                                    ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm shadow-sky-500/20"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                            )}
                            title="List View"
                        >
                            <LayoutList className="w-4 h-4" />
                            <span>List</span>
                        </button>
                    </div>

                    <button
                        onClick={() => setShowImportDialog(true)}
                        className="flex items-center gap-2 h-11 px-4 bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-slate-600 hover:bg-slate-800/80 text-slate-200 rounded-xl transition-all text-xs font-semibold whitespace-nowrap shadow-md active:scale-95 cursor-pointer"
                    >
                        <Download className="w-4 h-4 text-slate-300" />
                        <span>{t('serverManager.buttons.importExisting')}</span>
                    </button>
                    <button
                        onClick={() => setShowNonDedicatedImport(true)}
                        className="flex items-center gap-2 h-11 px-4 bg-amber-500/10 backdrop-blur-md border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 rounded-xl transition-all text-xs font-semibold whitespace-nowrap shadow-md shadow-amber-500/10 active:scale-95 cursor-pointer"
                    >
                        <Settings className="w-4 h-4 text-amber-400" />
                        <span>{t('serverManager.buttons.importSave')}</span>
                    </button>
                    <button
                        onClick={(e) => handleExportProfile(undefined, e)}
                        className="flex items-center gap-2 h-11 px-4 bg-violet-500/10 backdrop-blur-md border border-violet-500/30 hover:bg-violet-500/20 text-violet-300 rounded-xl transition-all text-xs font-semibold whitespace-nowrap shadow-md shadow-violet-500/10 active:scale-95 cursor-pointer"
                        title="Export single, selected, or all server profiles to JSON"
                    >
                        <Download className="w-4 h-4 text-violet-400" />
                        <span>{t('serverManager.buttons.exportProfiles', 'Export Profiles')}</span>
                    </button>
                    <button
                        onClick={() => setDraftOpen(true)}
                        className="flex items-center gap-2 h-11 px-5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl transition-all shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 text-xs font-bold whitespace-nowrap active:scale-95 cursor-pointer group"
                    >
                        <Plus className="w-4 h-4 text-white group-hover:rotate-90 transition-transform" />
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
                                <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-4 mt-3 text-xs text-slate-400 leading-relaxed">
                                    <strong className="text-purple-300 font-bold flex items-center gap-1.5 mb-1">
                                        🎮 Console (PS5 / Xbox) & Local LAN Direct Connect:
                                    </strong>
                                    If console or LAN players receive <span className="text-amber-300 font-mono">"Login Failed, Connection Lost"</span> when clicking the server from the browser (caused by router NAT loopback), they can direct-connect in seconds:
                                    <ol className="list-decimal pl-5 mt-1.5 space-y-1 text-slate-300">
                                        <li>On console, go to <strong className="text-white">Settings</strong> → <strong className="text-white">Advanced</strong> and toggle <strong className="text-purple-300">Console Access: ON</strong>.</li>
                                        <li>Press <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-white/10 text-[11px] font-mono text-purple-300">L1 + R1 + Square + Triangle</kbd> (or Options → console icon) in the main menu.</li>
                                        <li>Type <code className="bg-slate-900 px-2 py-0.5 rounded text-cyan-300 font-mono">open &lt;Host_Local_IP&gt;:7777</code> (e.g. <code className="text-emerald-300 font-mono">open 192.168.1.50:7777</code>) and press enter to connect directly across your home network.</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Server Organization Bar */}
            {servers.length > 0 && (
                <ServerOrganizationBar
                    serversCount={servers.length}
                    selectedFolderId={selectedFolderId}
                    onSelectFolderId={setSelectedFolderId}
                    className="mt-6 mb-4"
                />
            )}

            {/* Bulk Actions Bar */}
            {servers.length > 0 && (
                <div className="sticky top-4 z-20 flex flex-col lg:flex-row items-start lg:items-center justify-between bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 mt-2 mb-6 gap-4 shadow-xl">
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
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto bg-slate-950/60 rounded-xl sm:rounded-2xl border border-white/10 p-2 shadow-inner">
                        {/* Start Actions Group */}
                        <button
                            onClick={handleBulkStart}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 rounded-full transition-all text-xs font-semibold disabled:opacity-20 disabled:pointer-events-none"
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>{t('serverManager.buttons.startSelected')}</span>
                        </button>
                        <button
                            onClick={handleStartAll}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 hover:border-sky-500/30 rounded-full transition-all text-xs font-semibold"
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>{t('serverManager.buttons.startAll')}</span>
                        </button>
                        
                        <div className="w-px h-5 bg-white/10 hidden sm:block mx-1.5"></div>
                        
                        {/* Update Actions Group */}
                        <button
                            onClick={handleBulkUpdateSelected}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 rounded-full transition-all text-xs font-semibold disabled:opacity-20 disabled:pointer-events-none"
                            title="Update selected servers concurrently in parallel"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>{t('serverManager.buttons.updateSelected', 'Update Selected')}</span>
                        </button>
                        {servers.some(s => isServerOutdated(s.id)) && (
                            <button
                                onClick={handleUpdateAllOutdated}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 rounded-full transition-all text-xs font-bold animate-pulse"
                                title="Update all outdated servers simultaneously in parallel"
                            >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                <span>{t('serverManager.buttons.updateOutdated', 'Update Outdated')}</span>
                            </button>
                        )}
                        
                        <div className="w-px h-5 bg-white/10 hidden sm:block mx-1.5"></div>
                        
                        {/* Stop Actions Group */}
                        <button
                            onClick={handleBulkStop}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 rounded-full transition-all text-xs font-semibold disabled:opacity-20 disabled:pointer-events-none"
                        >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>{t('serverManager.buttons.stopSelected', 'Stop Selected')}</span>
                        </button>
                        <button
                            onClick={handleStopAll}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 rounded-full transition-all text-xs font-semibold"
                        >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>{t('serverManager.buttons.stopAll', 'Stop All')}</span>
                        </button>

                        <div className="w-px h-5 bg-white/10 hidden sm:block mx-1.5"></div>

                        {/* Manage Actions Group */}
                        <button
                            onClick={handleBulkMoveServers}
                            disabled={selectedServers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 rounded-full transition-all text-xs font-semibold disabled:opacity-20 disabled:pointer-events-none"
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>{t('serverManager.buttons.moveSelected', 'Move Selected')}</span>
                        </button>
                        <button
                            onClick={(e) => handleExportProfile(undefined, e)}
                            disabled={selectedServers.length === 0 && servers.length === 0}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/30 rounded-full transition-all text-xs font-semibold disabled:opacity-20 disabled:pointer-events-none"
                            title="Export selected server configuration profile to JSON"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Export Profile</span>
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
                    <div 
                        className="relative w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-900 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(14,165,233,0.1)] border border-slate-700/50"
                    >
                        <Plus className="w-12 h-12 text-sky-400" />
                    </div>
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
                                    className={cn(
                                        "grid gap-6 items-start",
                                        viewMode === 'grid' 
                                            ? "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" 
                                            : "grid-cols-1"
                                    )} 
                                    {...provided.droppableProps} 
                                    ref={provided.innerRef}
                                >
                                    {orderedServers.map((server, index) => (
                                        <Draggable key={server.id.toString()} draggableId={server.id.toString()} index={index}>
                                            {(provided, snapshot) => (
                                                viewMode === 'grid' ? renderGridCard(server, index, provided, snapshot) : (
                                                    <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    style={{
                                                        ...provided.draggableProps.style,
                                                        zIndex: snapshot.isDragging ? 100 : (orderedServers.length - index) * 10
                                                    }}
                                                    className={cn(
                                                        "bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-xl shadow-lg p-6 group relative hover:z-30",
                                                        snapshot.isDragging 
                                                            ? "shadow-2xl shadow-sky-500/20 ring-2 ring-sky-500/50 cursor-grabbing scale-[1.02] z-[100]" 
                                                            : "transition-all duration-300 hover:border-sky-500/50 hover:shadow-[0_8px_30px_rgba(14,165,233,0.15)] hover:-translate-y-1 cursor-pointer"
                                                    )}
                                                    onClick={(e) => toggleCollapse(server.id, e)}
                                                >
                                                    {/* Decorative background gradient clipped inside the card */}
                                                    <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                                                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-sky-500/5 to-transparent rounded-full blur-3xl -mr-32 -mt-32"></div>
                                                    </div>

                                                     <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
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
                                                                 <div className="flex items-center gap-3 min-w-0 flex-wrap">
                                                                     {editingServerId === server.id ? (
                                                                         <div className="flex items-center gap-2 no-collapse" onClick={(e) => e.stopPropagation()}>
                                                                             <input 
                                                                                 type="text"
                                                                                 value={editServerName}
                                                                                 onChange={(e) => setEditServerName(e.target.value)}
                                                                                 onKeyDown={(e) => handleRenameKeyDown(e, server)}
                                                                                 onBlur={() => handleRenameSave(server)}
                                                                                 autoFocus
                                                                                 className="text-lg font-bold bg-slate-900 border border-sky-500/50 rounded px-2.5 py-1 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 min-w-[200px]"
                                                                             />
                                                                             <button
                                                                                 onClick={() => handleRenameSave(server)}
                                                                                 className="p-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg shrink-0"
                                                                             >
                                                                                 <Check className="w-4 h-4" />
                                                                             </button>
                                                                         </div>
                                                                     ) : (
                                                                         <div className="flex items-center gap-2 group/title">
                                                                             <h3 
                                                                                 className="text-xl font-bold text-white group-hover/title:text-sky-400 transition-colors truncate cursor-pointer"
                                                                                 onClick={(e) => handleRenameStart(server, e)}
                                                                                 onDoubleClick={(e) => handleRenameStart(server, e)}
                                                                                 title="Click to rename profile"
                                                                             >
                                                                                 {customizations.get(server.id)?.displayName || server.name}
                                                                             </h3>
                                                                             <button
                                                                                 onClick={(e) => handleRenameStart(server, e)}
                                                                                 className="p-1 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-md transition-all opacity-80 group-hover/title:opacity-100 shrink-0"
                                                                                 title="Rename Server Profile"
                                                                             >
                                                                                 <Edit2 className="w-4 h-4 text-sky-400" />
                                                                             </button>
                                                                         </div>
                                                                     )}

                                                                      {/* Profile Badge & Real Server Folder Link */}
                                                                      <div className="flex items-center gap-2 no-collapse" onClick={(e) => e.stopPropagation()}>
                                                                          <div 
                                                                              onClick={(e) => handleRenameStart(server, e)}
                                                                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 hover:border-sky-500/40 rounded-lg text-xs text-sky-300 font-mono font-medium cursor-pointer transition-all no-collapse max-w-full truncate"
                                                                              title={`Click to rename profile | Server Path: ${server.installPath}`}
                                                                          >
                                                                              <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                                                              <span className="truncate">Profile: {customizations.get(server.id)?.displayName || server.name}</span>
                                                                              <Edit2 className="w-3 h-3 text-sky-400/70 shrink-0 ml-0.5" />
                                                                          </div>
                                                                          {server.installPath && (
                                                                              <button
                                                                                  onClick={async (e) => {
                                                                                      e.stopPropagation();
                                                                                      try {
                                                                                          await openInExplorer(server.installPath);
                                                                                          toast.success("Opened server directory in Explorer");
                                                                                      } catch (err) {
                                                                                          toast.error(`Cannot open folder: ${err}`);
                                                                                      }
                                                                                  }}
                                                                                  className="p-1.5 bg-slate-800 hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 rounded-lg transition-all shrink-0 cursor-pointer"
                                                                                  title={`Open real server folder on disk:\n${server.installPath}`}
                                                                              >
                                                                                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                                                                              </button>
                                                                          )}
                                                                      </div>

                                                                      <div className="flex items-center gap-2 shrink-0">
                                                                          <span className={cn(
                                                                              'px-3.5 py-1 rounded-full text-xs uppercase tracking-wider font-bold border flex items-center gap-2 shadow-inner',
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
                                                                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                                      {t('serverManager.serverStatus.loading')}
                                                                                      {startupProgress[server.id] && (
                                                                                          <span className="opacity-75">
                                                                                              ({formatElapsedTime(startupProgress[server.id].elapsed)})
                                                                                          </span>
                                                                                      )}
                                                                                      {startupProgress[server.id]?.confirmed && (
                                                                                          <Check className="w-3.5 h-3.5 text-green-400 ml-1" />
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
                                                                                  className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                                                                                  title={t('serverManager.tooltips.forceStop')}
                                                                              >
                                                                                  <XCircle className="w-3.5 h-3.5" />
                                                                                  {server.status === 'starting' ? t('serverManager.buttons.cancel') : t('serverManager.buttons.forceStop')}
                                                                              </button>
                                                                          )}
                                                                      </div>
                                                                  </div>

                                                                  {/* Metadata Tags row */}
                                                                  <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
                                                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300">
                                                                          <Globe className="w-3.5 h-3.5 text-sky-400/80" />
                                                                          <span>{server.config.mapName}</span>
                                                                      </div>
                                                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300">
                                                                          <Terminal className="w-3.5 h-3.5 text-violet-400/80" />
                                                                          <span className="font-mono">{t('common.port')} {server.ports.gamePort}</span>
                                                                      </div>
                                                                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300">
                                                                          <Shield className="w-3.5 h-3.5 text-emerald-400/80" />
                                                                          <span>v{appVersion}</span>
                                                                      </div>
                                                                      {serverVersions[server.id] && (
                                                                          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300" title={t('serverManager.tooltips.serverVersion', 'Local Server Version')}>
                                                                              <GitBranch className="w-3.5 h-3.5 text-sky-400/80" />
                                                                              <span className="font-mono text-xs">{serverVersions[server.id]}</span>
                                                                          </div>
                                                                      )}
                                                                      {isServerOutdated(server.id) && (
                                                                          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-bold animate-pulse" title={t('serverManager.tooltips.updateAvailable', 'New version is available! Click the download button to update.')}>
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
                                                              className="relative flex items-center gap-3 px-4 py-2 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)] hover:border-slate-700/80 transition-all duration-300 xl:mr-8 shrink-0 no-collapse w-fit mx-auto xl:mx-0 self-center xl:self-auto mt-4 xl:mt-0 ring-1 ring-white/5"
                                                          >
                                                              {server.status === 'stopped' || server.status === 'crashed' ? (
                                                                  <div className="relative group/start">
                                                                      <button
                                                                          onClick={() => handleStartServer(server.id)}
                                                                          className="relative flex items-center justify-center w-11 h-11 rounded-full bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.2)] hover:shadow-[0_0_22px_rgba(16,185,129,0.45)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group/btn"
                                                                          title={t('serverManager.tooltips.start')}
                                                                      >
                                                                          <Play className="w-5 h-5 fill-current ml-0.5" />
                                                                      </button>
                                                                      {/* Start Options Dropdown */}
                                                                      <div className="absolute top-full left-1/2 -translate-x-1/2 xl:translate-x-0 xl:left-0 xl:right-auto mt-3 w-52 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] opacity-0 invisible group-hover/start:opacity-100 group-hover/start:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-left scale-95 group-hover/start:scale-100 p-1.5 space-y-1">
                                                                          <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-emerald-400/80">Launch Options</div>
                                                                          <button
                                                                              onClick={() => handleStartServer(server.id)}
                                                                              className="w-full text-left px-3 py-2.5 hover:bg-emerald-500/15 text-slate-200 hover:text-white rounded-xl transition-all flex items-center gap-2.5 text-xs font-semibold group/item cursor-pointer"
                                                                          >
                                                                              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 group-hover/item:scale-110 transition-transform">
                                                                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                                                              </div>
                                                                              <div className="flex flex-col">
                                                                                  <span>{t('serverManager.buttons.start', 'Normal Start')}</span>
                                                                                  <span className="text-[10px] text-slate-400 font-normal">Launch with active mods</span>
                                                                              </div>
                                                                          </button>
                                                                          <button
                                                                              onClick={() => handleStartServerNoMods(server.id)}
                                                                              className="w-full text-left px-3 py-2.5 hover:bg-amber-500/15 text-slate-200 hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-semibold group/item cursor-pointer border-t border-slate-800/80 pt-2"
                                                                              title={t('serverManager.tooltips.startNoMods')}
                                                                          >
                                                                              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover/item:scale-110 transition-transform">
                                                                                  <Shield className="w-3.5 h-3.5" />
                                                                              </div>
                                                                              <div className="flex flex-col">
                                                                                  <span>{t('serverManager.buttons.startNoMods', 'Safe Mode (No Mods)')}</span>
                                                                                  <span className="text-[10px] text-slate-400 font-normal">Bypass custom mods</span>
                                                                              </div>
                                                                          </button>
                                                                      </div>
                                                                  </div>
                                                              ) : (server.status === 'running' || server.status === 'online') ? (
                                                                  <div className="relative group/stop" onClick={(e) => e.stopPropagation()}>
                                                                      <button
                                                                          onClick={() => setTimedShutdownServer(server)}
                                                                          className="relative flex items-center justify-center w-11 h-11 rounded-full bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 border border-rose-500/35 hover:border-rose-400/70 shadow-[0_0_14px_rgba(244,63,94,0.3)] hover:shadow-[0_0_24px_rgba(244,63,94,0.55)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group/btn"
                                                                          title="Stop / Shutdown Options"
                                                                      >
                                                                          <Square className="w-4 h-4 fill-current" />
                                                                      </button>

                                                                      {/* Stop Options Dropdown */}
                                                                      <div className="absolute top-full left-1/2 -translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 mt-3 w-56 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] opacity-0 invisible group-hover/stop:opacity-100 group-hover/stop:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-right scale-95 group-hover/stop:scale-100 p-1.5 space-y-1">
                                                                          <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-rose-400/80">Shutdown Options</div>
                                                                          <button
                                                                              onClick={() => setTimedShutdownServer(server)}
                                                                              className="w-full text-left px-3 py-2.5 hover:bg-amber-500/15 text-slate-200 hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-semibold group/item cursor-pointer"
                                                                          >
                                                                              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover/item:scale-110 transition-transform">
                                                                                  <Timer className="w-3.5 h-3.5" />
                                                                              </div>
                                                                              <div className="flex flex-col">
                                                                                  <span className="font-bold">Timed Shutdown</span>
                                                                                  <span className="text-[10px] text-slate-400 font-normal">Countdown with broadcasts</span>
                                                                              </div>
                                                                          </button>
                                                                          <button
                                                                              onClick={() => handleStopServer(server.id)}
                                                                              className="w-full text-left px-3 py-2.5 hover:bg-rose-500/15 text-slate-200 hover:text-rose-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-semibold group/item cursor-pointer border-t border-slate-800/80 pt-2"
                                                                          >
                                                                              <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400 group-hover/item:scale-110 transition-transform">
                                                                                  <Square className="w-3.5 h-3.5 fill-current" />
                                                                              </div>
                                                                              <div className="flex flex-col">
                                                                                  <span className="font-bold">Immediate Stop</span>
                                                                                  <span className="text-[10px] text-slate-400 font-normal">Halt process immediately</span>
                                                                              </div>
                                                                          </button>
                                                                      </div>
                                                                  </div>
                                                              ) : (
                                                                  <div className="relative flex items-center justify-center w-11 h-11 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]" title={server.status === 'updating' ? 'Updating...' : 'Starting...'}>
                                                                      <RefreshCw className="w-5 h-5 animate-spin" />
                                                                  </div>
                                                              )}

                                                              <div className="relative group/dropdown">
                                                                  <button
                                                                      disabled={server.status === 'stopped'}
                                                                      className="relative flex items-center justify-center w-11 h-11 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.35)] transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-25 disabled:pointer-events-none cursor-pointer group/btn"
                                                                      title={t('serverManager.tooltips.restartOptions')}
                                                                  >
                                                                      <RotateCw className="w-5 h-5 group-hover/btn:rotate-180 transition-transform duration-500" />
                                                                  </button>

                                                                  {/* Dropdown Menu */}
                                                                  <div className="absolute top-full left-1/2 -translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 mt-3 w-56 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-right scale-95 group-hover/dropdown:scale-100 p-1.5 space-y-1">
                                                                      <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-amber-400/80">Restart Control</div>
                                                                      <button
                                                                          onClick={() => handleRestartServer(server.id)}
                                                                          className="w-full text-left px-3 py-2.5 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover/item:scale-110 transition-transform">
                                                                              <RotateCw className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <div className="flex flex-col">
                                                                              <span>{t('serverManager.buttons.normalRestart', 'Normal Restart')}</span>
                                                                              <span className="text-[10px] text-slate-400 font-normal">Graceful server restart</span>
                                                                          </div>
                                                                      </button>
                                                                      <button
                                                                          onClick={() => handleRestartServer(server.id, true)}
                                                                          className="w-full text-left px-3 py-2.5 hover:bg-amber-500/15 text-slate-200 hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer border-t border-slate-800/80 pt-2"
                                                                          title="Gracefully restart the server and wipe all wild dinosaurs"
                                                                      >
                                                                          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover/item:scale-110 transition-transform">
                                                                              <RefreshCw className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <div className="flex flex-col">
                                                                              <span>{t('serverManager.buttons.restartWipeDinos', 'Restart & Wipe Dinos')}</span>
                                                                              <span className="text-[10px] text-slate-400 font-normal">DestroyWildDinos on boot</span>
                                                                          </div>
                                                                      </button>
                                                                      <button
                                                                          onClick={() => handleHardcoreRetry(server.id)}
                                                                          className="w-full text-left px-3 py-2.5 hover:bg-rose-500/15 text-slate-200 hover:text-rose-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer border-t border-slate-800/80 pt-2"
                                                                          title={t('serverManager.tooltips.deepRepair')}
                                                                      >
                                                                          <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400 group-hover/item:scale-110 transition-transform">
                                                                              <Shield className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <div className="flex flex-col">
                                                                              <span>{t('serverManager.buttons.deepRepair', 'Deep Repair')}</span>
                                                                              <span className="text-[10px] text-slate-400 font-normal">Revalidate mods & files</span>
                                                                          </div>
                                                                      </button>
                                                                  </div>
                                                              </div>

                                                              <button
                                                                  onClick={() => handleShowConsole(server.id)}
                                                                  disabled={server.status === 'stopped'}
                                                                  className="relative flex items-center justify-center w-11 h-11 rounded-full bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/50 shadow-[0_0_10px_rgba(139,92,246,0.15)] hover:shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-25 disabled:pointer-events-none cursor-pointer group/btn"
                                                                  title={t('serverManager.tooltips.showConsole')}
                                                              >
                                                                  <AppWindow className="w-5 h-5" />
                                                              </button>

                                                              <div className="w-[1.5px] h-6 bg-gradient-to-b from-transparent via-white/20 to-transparent mx-1 shrink-0" />

                                                              {/* Update Server Dropdown */}
                                                              <div className="relative group/update">
                                                                  <button
                                                                      onClick={() => handleUpdateServer(server.id)}
                                                                      className={cn(
                                                                          "relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group/btn",
                                                                          isServerOutdated(server.id)
                                                                              ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 border border-amber-400/50 hover:border-amber-400/80 shadow-[0_0_16px_rgba(245,158,11,0.35)] hover:shadow-[0_0_24px_rgba(245,158,11,0.6)]"
                                                                              : updateOnStart 
                                                                                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]" 
                                                                                  : "bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-500/50 shadow-[0_0_10px_rgba(56,189,248,0.15)] hover:shadow-[0_0_20px_rgba(56,189,248,0.35)]"
                                                                      )}
                                                                      title={isServerOutdated(server.id) ? t('serverManager.tooltips.updateRequired', 'New update available! Click to install.') : t('serverManager.tooltips.update')}
                                                                  >
                                                                      <Download className="w-5 h-5" />
                                                                      {isServerOutdated(server.id) && (
                                                                          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                                                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                                                                              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border-2 border-slate-900 shadow-sm" />
                                                                          </span>
                                                                      )}
                                                                  </button>
                                                                  
                                                                  {/* Update Options Dropdown */}
                                                                  <div className="absolute top-full left-1/2 -translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 mt-3 w-64 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] opacity-0 invisible group-hover/update:opacity-100 group-hover/update:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-right scale-95 group-hover/update:scale-100 p-1.5 space-y-1">
                                                                      <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-sky-400/80">SteamCMD Updates</div>
                                                                      <button
                                                                          onClick={() => handleUpdateServer(server.id)}
                                                                          className="w-full text-left px-3 py-2.5 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl transition-all flex items-center gap-2.5 text-xs font-semibold group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400 group-hover/item:scale-110 transition-transform">
                                                                              <Download className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <div className="flex flex-col">
                                                                              <span>{t('serverManager.tooltips.update', 'Update Server Now')}</span>
                                                                              <span className="text-[10px] text-slate-400 font-normal">Check and apply Steam updates</span>
                                                                          </div>
                                                                      </button>

                                                                      <label className="w-full text-left px-3 py-2.5 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl transition-all flex items-center justify-between border-t border-slate-800/80 cursor-pointer pt-2">
                                                                          <div className="flex items-center gap-2.5">
                                                                              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                                                                                  <RefreshCw className="w-3.5 h-3.5" />
                                                                              </div>
                                                                              <div className="flex flex-col">
                                                                                  <span className="text-xs font-semibold">{t('serverManager.buttons.updateOnStart', 'Update on Start')}</span>
                                                                                  <span className="text-[10px] text-slate-400 font-normal">Verify files before launch</span>
                                                                              </div>
                                                                          </div>
                                                                          <input
                                                                              type="checkbox"
                                                                              checked={!!serverUpdateSettings[server.id]?.update_on_start}
                                                                              onChange={(e) => handleToggleUpdateOnStart(server.id, e.target.checked)}
                                                                              className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                                                                          />
                                                                      </label>

                                                                      <label className="w-full text-left px-3 py-2.5 hover:bg-amber-500/10 text-amber-200 hover:text-amber-100 rounded-xl transition-all flex items-center justify-between border-t border-slate-800/80 cursor-pointer pt-2">
                                                                          <div className="flex items-center gap-2.5">
                                                                              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                                                                                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                                                                              </div>
                                                                              <div className="flex flex-col">
                                                                                  <span className="text-xs font-semibold">Auto-Update on Release</span>
                                                                                  <span className="text-[10px] text-slate-400 font-normal">Install Steam patches automatically</span>
                                                                              </div>
                                                                          </div>
                                                                          <input
                                                                              type="checkbox"
                                                                              checked={!!serverUpdateSettings[server.id]?.auto_update}
                                                                              onChange={(e) => handleToggleAutoUpdate(server.id, e.target.checked)}
                                                                              className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                                                                          />
                                                                      </label>
                                                                  </div>
                                                              </div>

                                                              {/* Server Settings Dropdown */}
                                                              <div className="relative group/settings">
                                                                  <button
                                                                      onClick={() => navigate('/config', { state: { serverId: server.id } })}
                                                                      className="relative flex items-center justify-center w-11 h-11 rounded-full bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50 hover:border-violet-500/40 shadow-inner hover:shadow-[0_0_15px_rgba(139,92,246,0.25)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group/btn"
                                                                      title={t('serverManager.tooltips.settings')}
                                                                  >
                                                                      <Settings className="w-5 h-5 group-hover/btn:rotate-45 transition-transform duration-300" />
                                                                  </button>

                                                                  {/* Settings Options Dropdown */}
                                                                  <div className="absolute top-full left-1/2 -translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 mt-2 w-60 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] opacity-0 invisible group-hover/settings:opacity-100 group-hover/settings:visible transition-all duration-200 z-50 overflow-hidden origin-top xl:origin-top-right scale-95 group-hover/settings:scale-100 p-1.5 space-y-0.5">
                                                                      <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-violet-400/80">Management & Config</div>
                                                                      <button
                                                                          onClick={() => navigate('/config', { state: { serverId: server.id } })}
                                                                          className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 hover:text-white rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-6 h-6 rounded-lg bg-violet-500/15 flex items-center justify-center text-violet-400 group-hover/item:scale-110 transition-transform">
                                                                              <Settings className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <span>{t('serverManager.tooltips.settings', 'Visual Config Editor')}</span>
                                                                      </button>
                                                                      <button
                                                                          onClick={() => navigate('/config', { state: { serverId: server.id, initialMode: 'gus' } })}
                                                                          className="w-full text-left px-3 py-2 hover:bg-amber-500/15 text-slate-200 hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover/item:scale-110 transition-transform">
                                                                              <FileText className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <span>{t('serverManager.buttons.editRawIni', 'Edit Files Manually (IDE)')}</span>
                                                                      </button>
                                                                      <button
                                                                          onClick={() => navigate('/tools/files', { state: { initialPath: server.installPath } })}
                                                                          className="w-full text-left px-3 py-2 hover:bg-sky-500/15 text-slate-200 hover:text-sky-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400 group-hover/item:scale-110 transition-transform">
                                                                              <FolderOpen className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <span>{t('serverManager.buttons.fileManager', 'File Manager (Browse)')}</span>
                                                                      </button>
                                                                      <button
                                                                          onClick={() => handleMoveServer(server.id)}
                                                                          className="w-full text-left px-3 py-2 hover:bg-amber-500/15 text-slate-200 hover:text-amber-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 group-hover/item:scale-110 transition-transform">
                                                                              <FolderOpen className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <span>{t('serverManager.tooltips.move', 'Move Server')}</span>
                                                                      </button>
                                                                      <button
                                                                          onClick={() => openCloneModal(server)}
                                                                          className="w-full text-left px-3 py-2 hover:bg-sky-500/15 text-slate-200 hover:text-sky-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400 group-hover/item:scale-110 transition-transform">
                                                                              <Copy className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <span>{t('serverManager.tooltips.clone', 'Clone Server')}</span>
                                                                      </button>
                                                                      <button
                                                                          onClick={() => handleClearModCache(server.id)}
                                                                          className="w-full text-left px-3 py-2 hover:bg-orange-500/15 text-slate-200 hover:text-orange-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                          title={t('serverManager.modCache.tooltip', 'Clear cached mod files to fix mod loading issues')}
                                                                      >
                                                                          <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center text-orange-400 group-hover/item:scale-110 transition-transform">
                                                                              <RefreshCw className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <span>{t('serverManager.modCache.button', 'Clear Mod Cache')}</span>
                                                                      </button>
                                                                      <div className="border-t border-slate-800/80 my-1"></div>
                                                                      <button
                                                                          onClick={() => handleInitiateDeleteServer(server)}
                                                                          className="w-full text-left px-3 py-2 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 rounded-xl transition-all flex items-center gap-2.5 text-xs font-medium group/item cursor-pointer"
                                                                      >
                                                                          <div className="w-6 h-6 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400 group-hover/item:scale-110 transition-transform">
                                                                              <Trash2 className="w-3.5 h-3.5" />
                                                                          </div>
                                                                          <span>{t('serverManager.tooltips.delete', 'Delete Server')}</span>
                                                                      </button>
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      </div>

                            {/* Expand/Collapse Toggle Indicator */}
                            <div className="absolute right-6 top-6 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                {collapsedServers[server.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </div>

                            {/* Timed Shutdown Banner - always visible in expanded view */}
                            <ServerTimedShutdownBanner serverId={server.id} className="mt-4 mx-6" />

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
                             <div className="mt-6 p-5 bg-slate-900/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl transition-all duration-300 hover:shadow-sky-500/5">
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                                     <div className="space-y-2 group/field">
                                         <div className="flex items-center gap-2 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                             <FolderOpen className="w-4 h-4 text-sky-400/80" />
                                             <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.installPath')}</p>
                                         </div>
                                         <p className="text-slate-300 font-mono text-xs truncate bg-slate-950/40 p-2.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors shadow-inner" title={server.installPath}>{server.installPath}</p>
                                     </div>
                                     <div className="space-y-2 group/field">
                                         <div className="flex items-center gap-2 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                             <Users className="w-4 h-4 text-sky-400/80" />
                                             <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.maxPlayers')}</p>
                                         </div>
                                         <p className="text-slate-300 text-xs bg-slate-950/40 p-2.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors shadow-inner truncate">{server.config.maxPlayers} {t('serverManager.serverDetails.survivors')}</p>
                                     </div>
                                     <div className="space-y-2 group/field">
                                         <div className="flex items-center gap-2 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                             <PenLine className="w-4 h-4 text-sky-400/80" />
                                             <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.sessionName')}</p>
                                         </div>
                                         <p className="text-slate-300 text-xs truncate bg-slate-950/40 p-2.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors shadow-inner">{server.config.sessionName}</p>
                                     </div>
                                     <div className="space-y-2 group/field">
                                         <div className="flex items-center gap-2 text-slate-400 group-hover/field:text-slate-200 transition-colors">
                                             <Network className="w-4 h-4 text-sky-400/80" />
                                             <p className="text-[11px] uppercase tracking-wider font-bold select-none">{t('serverManager.serverDetails.connection')}</p>
                                         </div>
                                         <p className="text-slate-300 font-mono text-xs bg-slate-950/40 p-2.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors shadow-inner truncate">
                                             {getServerDisplayIp(server.ipAddress)} : {server.ports.gamePort}
                                         </p>
                                     </div>
                                 </div>
                                {moveProgress[server.id] && (
                                    <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-800">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-semibold text-slate-300">Moving Server...</span>
                                            <span className="text-xs text-slate-400 truncate max-w-[50%]">
                                                {moveProgress[server.id].status}
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-800 rounded-full h-2.5 mb-1 overflow-hidden">
                                            <div 
                                                className="bg-sky-500 h-2.5 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(14,165,233,0.5)]" 
                                                style={{ width: `${Math.max(5, moveProgress[server.id].progress)}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                                            <span>{Math.round(moveProgress[server.id].progress)}%</span>
                                        </div>
                                    </div>
                                )}

                                {/* Automation Controls */}
                                <div className="mt-5 pt-5 border-t border-slate-800/50 flex flex-wrap items-center gap-x-8 gap-y-4">
                                    <div className="flex items-center gap-2">
                                        <Cpu className="w-4 h-4 text-sky-400" />
                                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">{t('serverManager.serverDetails.automation')}</span>
                                    </div>
                                <label className="flex items-center gap-2.5 cursor-pointer group/toggle select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.autoStart || false}
                                            onChange={() => handleToggleAutomation(server.id, 'auto_start', server.autoStart || false)}
                                        />
                                        <div className="relative w-10 h-6 bg-slate-950/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] rtl:peer-checked:after:-translate-x-[16px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-emerald-400 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-emerald-500/20 peer-checked:border-emerald-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(52,211,153,0.5)] transition-all"></div>
                                    </div>
                                    <span className="text-slate-400 text-sm font-bold group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStart')}</span>
                                </label>

                                {server.autoStart && (
                                    <div className="flex items-center gap-3 bg-slate-950/40 px-3 py-1.5 rounded-xl border border-white/5 animate-in fade-in duration-200 text-xs shadow-inner">
                                        <div className="flex items-center gap-1.5 text-slate-400">
                                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Delay:</span>
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
                                                className="w-12 bg-slate-950 border border-white/5 rounded-lg px-1.5 py-0.5 text-white font-mono text-center focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50"
                                            />
                                            <span className="text-slate-500">s</span>
                                        </div>
                                        <div className="w-px h-3.5 bg-white/10"></div>
                                        <div className="flex items-center gap-1.5 text-slate-400">
                                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Priority:</span>
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
                                                className="w-10 bg-slate-950 border border-white/5 rounded-lg px-1.5 py-0.5 text-white font-mono text-center focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50"
                                            />
                                        </div>
                                    </div>
                                )}

                                <label className="flex items-center gap-2.5 cursor-pointer group/toggle select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.autoStop || false}
                                            onChange={() => handleToggleAutomation(server.id, 'auto_stop', server.autoStop || false)}
                                        />
                                        <div className="relative w-10 h-6 bg-slate-955/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] rtl:peer-checked:after:-translate-x-[16px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-rose-400 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-rose-500/20 peer-checked:border-rose-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(244,63,94,0.5)] transition-all"></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-slate-400 text-sm font-bold group-hover/toggle:text-slate-200 transition-colors">{t('serverManager.serverDetails.autoStop')}</span>
                                        <span className="text-[10px] text-slate-500">{t('serverManager.serverDetails.onConfigChange')}</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2.5 cursor-pointer group/toggle select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={!!serverUpdateSettings[server.id]?.auto_update}
                                            onChange={(e) => handleToggleAutoUpdate(server.id, e.target.checked)}
                                        />
                                        <div className="relative w-10 h-6 bg-slate-950/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] rtl:peer-checked:after:-translate-x-[16px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-amber-400 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-amber-500/20 peer-checked:border-amber-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(245,158,11,0.5)] transition-all"></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <Sparkles className={cn("w-4 h-4 transition-colors", serverUpdateSettings[server.id]?.auto_update ? "text-amber-400 animate-pulse" : "text-slate-500")} />
                                            <span className={cn("text-sm font-bold transition-colors", serverUpdateSettings[server.id]?.auto_update ? "text-amber-400" : "text-slate-400")}>Auto-Update</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">Steam Web API Release</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2.5 cursor-pointer group/toggle ml-auto lg:ml-0 select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={server.intelligentMode || false}
                                            onChange={() => handleToggleAutomation(server.id, 'intelligent_mode', server.intelligentMode || false)}
                                        />
                                        <div className="relative w-10 h-6 bg-slate-950/60 border border-slate-700/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] rtl:peer-checked:after:-translate-x-[16px] peer-checked:after:border-white/10 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 peer-checked:after:bg-sky-400 after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-sky-500/20 peer-checked:border-sky-500/40 shadow-inner after:shadow-md peer-checked:after:shadow-[0_0_8px_rgba(14,165,233,0.5)] transition-all"></div>
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
                                                )
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

            {/* Export Profile Modal */}
            <ExportProfileModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                servers={servers}
                initialSelectedServerIds={exportTargetServerIds}
            />

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
                onClose={() => { setDeleteConfirmServer(null); setDeleteSaveInfo(null); }}
                onConfirm={confirmDeleteServer}
                title={t('serverManager.confirmDelete')}
                message={
                    deleteConfirmServer ? (
                        deleteSaveInfo?.has_saves ? (
                            `${t('serverManager.confirmDeleteMsg', { name: deleteConfirmServer.name })}\n\n⚠️ WARNING: Active save data detected (${deleteSaveInfo.player_count} players, ${deleteSaveInfo.tribe_count} tribes)! An emergency safety backup will be created in C:\\ASA_Backups\\safety_net\\ before disk removal.`
                        ) : (
                            t('serverManager.confirmDeleteMsg', { name: deleteConfirmServer.name })
                        )
                    ) : ''
                }
                confirmText={t('serverManager.buttons.delete')}
                variant="danger"
            />

            {/* Force Stop Confirmation Dialog */}
            <ConfirmDialog
                isOpen={forceStopServerId !== null}
                onClose={() => setForceStopServerId(null)}
                onConfirm={confirmForceStop}
                title={t('serverManager.confirmForceStopTitle', 'Force Stop Server')}
                message={t('serverManager.confirmForceStop')}
                confirmText={t('serverManager.buttons.forceStop', 'Force Stop')}
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
                onAutoFix={handleAutoFixPorts}
                result={conflictResult}
                existingServers={servers}
                currentServerId={pendingStartParams?.id}
            />

            <MoveServerDialog
                isOpen={showMoveDialog}
                onClose={() => setShowMoveDialog(false)}
                onConfirm={confirmMoveServer}
                isBulk={isBulkMove}
                serverCount={selectedServers.length}
                serverName={moveServerTarget?.name}
            />

            {timedShutdownServer && (
                <TimedShutdownModal
                    isOpen={!!timedShutdownServer}
                    onClose={() => setTimedShutdownServer(null)}
                    serverId={timedShutdownServer.id}
                    serverName={timedShutdownServer.name}
                    serverType="ASA"
                    onImmediateStop={() => handleStopServer(timedShutdownServer.id)}
                />
            )}
        </div>
    );
}
