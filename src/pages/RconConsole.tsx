import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Terminal as TerminalIcon,
    Send,
    Users,
    Wifi,
    WifiOff,
    Save,
    Trash2,
    MessageSquare,
    UserX,
    Ban,
    Clock,
    RefreshCw,
    HelpCircle,
    AlertTriangle,
    ShieldAlert,
    Timer,
    Unplug,
    Layers,
    Search,
    Play,
    XCircle,
    Database,
    ShieldCheck,
    Eye,
    EyeOff,
    Check,
    Pause,
    History
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { useRconStore, RconPlayer } from '../stores/rconStore';
import RconHelpModal from '../components/ui/RconHelpModal';
import ServerSelect from '../components/ui/ServerSelect';

interface RconResponse {
    success: boolean;
    message: string;
    data?: string;
}

interface SaveValidationInfo {
    exists: boolean;
    file_name: string;
    last_modified: string;
    file_size_bytes: number;
    integrity_ok: boolean;
    error_message: string | null;
}

interface SaveHistoryEntry {
    serverId: number;
    serverName: string;
    timestamp: Date;
    info: SaveValidationInfo;
}

interface ClusterResult {
    server_id: number;
    success: boolean;
    response: string;
}

const QUICK_COMMANDS = [
    { labelKey: 'rcon.quickCommands.saveWorld', labelDefault: 'Save World', command: 'SaveWorld', icon: Save },
    { labelKey: 'rcon.quickCommands.listPlayers', labelDefault: 'List Players', command: 'ListPlayers', icon: Users },
    { labelKey: 'rcon.quickCommands.destroyWild', labelDefault: 'Destroy Wild Dinos', command: 'DestroyWildDinos', icon: Trash2 },
    { labelKey: 'rcon.quickCommands.dayTime', labelDefault: 'Set Day Time', command: 'SetTimeOfDay 12:00', icon: Clock },
    { labelKey: 'rcon.quickCommands.nightTime', labelDefault: 'Set Night Time', command: 'SetTimeOfDay 00:00', icon: Clock },
];

const AUTOCOMPLETE_COMMANDS = [
    { command: 'SaveWorld', desc: 'Forces an immediate server world save.' },
    { command: 'ListPlayers', desc: 'Displays SteamID, character name, and level of all active players.' },
    { command: 'Broadcast', desc: 'Displays an on-screen alert banner to all players.' },
    { command: 'DestroyWildDinos', desc: 'Clears all wild dinosaurs from the map.' },
    { command: 'KickPlayer', desc: 'Kicks a player from the server by SteamID.' },
    { command: 'BanPlayer', desc: 'Bans a player from the server by SteamID.' },
    { command: 'UnbanPlayer', desc: 'Unbans a player by SteamID.' },
    { command: 'GetChat', desc: 'Fetches recent server chat messages.' },
    { command: 'SetTimeOfDay', desc: 'Changes map time (e.g. SetTimeOfDay 12:00).' },
    { command: 'DoExit', desc: 'Saves and halts the server immediately.' },
    { command: 'ShowMessageOfTheDay', desc: 'Shows the configured MOTD to all players.' },
    { command: 'ServerChat', desc: 'Sends a chat message visible in the global feed.' },
    { command: 'AdminCheat', desc: 'Prefix to run server administration commands.' }
];

function classifyError(errMsg: string): { category: string; icon: typeof AlertTriangle; colorClass: string } {
    const lower = errMsg.toLowerCase();
    if (lower.includes('authentication failed') || lower.includes('wrong admin password')) {
        return { category: 'Authentication Failed', icon: ShieldAlert, colorClass: 'text-red-400 border-red-500/20 bg-red-950/20' };
    }
    if (lower.includes('timed out') || lower.includes('timeout')) {
        return { category: 'Command Timeout', icon: Timer, colorClass: 'text-amber-400 border-amber-500/20 bg-amber-950/20' };
    }
    if (lower.includes('connection lost') || lower.includes('reconnect failed') || lower.includes('socket closed')) {
        return { category: 'Connection Lost', icon: Unplug, colorClass: 'text-orange-400 border-orange-500/20 bg-orange-950/20' };
    }
    if (lower.includes('no active rcon connection')) {
        return { category: 'Not Connected', icon: WifiOff, colorClass: 'text-slate-400 border-slate-700/50 bg-slate-900/50' };
    }
    return { category: 'Error', icon: AlertTriangle, colorClass: 'text-red-400 border-red-500/20 bg-red-950/20' };
}

export default function RconConsole() {
    const { t } = useTranslation();
    const { servers } = useServerStore();

    // Active Tab state: terminal, log_stream, cluster, save_manager
    const [activeTab, setActiveTab] = useState<'terminal' | 'log_stream' | 'cluster' | 'save_manager'>('terminal');

    const [isHelpOpen, setIsHelpOpen] = useState(false);

    // Zustand global state for RCON
    const rconStore = useRconStore();
    const selectedServerId = rconStore.selectedServerId;
    const setSelectedServerId = rconStore.setSelectedServerId;

    const serverState = selectedServerId ? rconStore.serverStates[selectedServerId] : null;
    const isConnected = serverState?.isConnected || false;
    const isConnecting = serverState?.isConnecting || false;
    const commandHistory = serverState?.commandHistory || [];
    const players = serverState?.players || [];
    const connectionInfo = serverState?.connectionInfo || null;

    const [command, setCommand] = useState('');
    const [historyIndex, setHistoryIndex] = useState(-1);
    const terminalRef = useRef<HTMLDivElement>(null);
    const logFeedRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Live log streaming states
    const [isStreamingLogs, setIsStreamingLogs] = useState(false);
    const [logStream, setLogStream] = useState<{ line: string; timestamp: Date }[]>([]);
    const [logSearchQuery, setLogSearchQuery] = useState('');
    const [autoScrollLogs, setAutoScrollLogs] = useState(true);

    // Autocomplete states
    const [autocompleteVisible, setAutocompleteVisible] = useState(false);
    const [autocompleteIndex, setAutocompleteIndex] = useState(0);

    // Cluster execution states
    const [clusterCommand, setClusterCommand] = useState('');
    const [clusterSelectedServers, setClusterSelectedServers] = useState<number[]>([]);
    const [clusterProgress, setClusterProgress] = useState<Record<number, { status: 'idle' | 'sending' | 'success' | 'error'; response: string }>>({});
    const [clusterIsExecuting, setClusterIsExecuting] = useState(false);

    // Manual Save Validation states
    const [saveProgressState, setSaveProgressState] = useState<'idle' | 'sending' | 'syncing' | 'verifying' | 'success' | 'error'>('idle');
    const [saveValidationResult, setSaveValidationResult] = useState<SaveValidationInfo | null>(null);
    const [saveValidationHistory, setSaveValidationHistory] = useState<SaveHistoryEntry[]>([]);

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalRef.current && activeTab === 'terminal') {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [commandHistory, activeTab]);

    // Auto-scroll log feed
    useEffect(() => {
        if (logFeedRef.current && autoScrollLogs && activeTab === 'log_stream') {
            logFeedRef.current.scrollTop = logFeedRef.current.scrollHeight;
        }
    }, [logStream, autoScrollLogs, activeTab]);

    // Select first server if none selected
    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId, setSelectedServerId]);

    const selectedServer = useMemo(() => servers.find(s => s.id === selectedServerId), [servers, selectedServerId]);

    // Set cluster servers selection default
    useEffect(() => {
        if (servers.length > 0 && clusterSelectedServers.length === 0) {
            setClusterSelectedServers(servers.map(s => s.id));
        }
    }, [servers, clusterSelectedServers.length]);

    // Start/Stop log streaming when tab active / streaming toggle enabled
    useEffect(() => {
        if (isStreamingLogs && selectedServerId) {
            invoke('start_log_stream', { serverId: selectedServerId })
                .then(() => console.log(`[RCON] Log stream started for server #${selectedServerId}`))
                .catch(err => console.error('Error starting backend log stream:', err));
                
            return () => {
                invoke('stop_log_stream', { serverId: selectedServerId })
                    .then(() => console.log(`[RCON] Log stream stopped for server #${selectedServerId}`))
                    .catch(err => console.error('Error stopping backend log stream:', err));
            };
        }
    }, [selectedServerId, isStreamingLogs]);

    // Listen for live log streaming events
    useEffect(() => {
        let active = true;
        let unlistenFn: (() => void) | null = null;
        
        async function setupListener() {
            if (!selectedServerId || !isStreamingLogs) return;
            try {
                const unlisten = await listen<{ server_id: number; line: string }>('server_log_line', (event) => {
                    if (!active) return;
                    const { server_id, line } = event.payload;
                    if (server_id === selectedServerId) {
                        setLogStream((prev) => {
                            const next = [...prev, { line, timestamp: new Date() }];
                            return next.slice(-1000); // Buffer size limit
                        });
                    }
                });
                unlistenFn = unlisten;
            } catch (err) {
                console.error('Failed to listen to log stream:', err);
            }
        }
        
        setupListener();
        
        return () => {
            active = false;
            if (unlistenFn) {
                unlistenFn();
            }
        };
    }, [selectedServerId, isStreamingLogs]);

    const connect = useCallback(async () => {
        if (!selectedServer) return;

        rconStore.setConnecting(selectedServer.id, true);
        rconStore.setLastError(selectedServer.id, null);
        try {
            const address = selectedServer.ipAddress || '127.0.0.1';
            const port = selectedServer.ports.rconPort;
            console.log(`[RCON] Connecting to ${address}:${port}...`);
            const response = await invoke<RconResponse>('rcon_connect', {
                serverId: selectedServer.id,
                address,
                port,
                password: selectedServer.config.adminPassword,
            });

            if (response.success) {
                console.log('[RCON] Connected successfully!');
                rconStore.setConnected(selectedServer.id, true);
                rconStore.setConnectionInfo(selectedServer.id, {
                    address,
                    port,
                    connectedSince: new Date(),
                });
                toast.success(t('rcon.connectedMsg', 'Connected to RCON'));
                addToHistory('connect', t('rcon.connectedMsg', 'Connected to RCON'), true);
                refreshPlayers();
            }
        } catch (error) {
            const errMsg = String(error);
            console.error('[RCON] Connection failed:', errMsg);
            rconStore.setLastError(selectedServer.id, errMsg);
            toast.error(t('rcon.connectFailed', { error: errMsg, defaultValue: `Connection failed: ${errMsg}` }));
            addToHistory('connect', `Failed: ${errMsg}`, false);
        } finally {
            rconStore.setConnecting(selectedServer.id, false);
        }
    }, [selectedServer, rconStore, t]);

    const disconnect = async () => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_disconnect', { serverId: selectedServerId });
            rconStore.setConnected(selectedServerId, false);
            rconStore.setPlayers(selectedServerId, []);
            rconStore.setConnectionInfo(selectedServerId, null);
            rconStore.setLastError(selectedServerId, null);
            setIsStreamingLogs(false);
            setLogStream([]);
            toast.success(t('rcon.disconnectedMsg', 'Disconnected from RCON'));
            addToHistory('disconnect', t('rcon.disconnectedMsg', 'Disconnected from RCON'), true);
        } catch (error) {
            const errMsg = String(error);
            if (errMsg.includes('No active RCON connection')) {
                rconStore.setConnected(selectedServerId, false);
                rconStore.setPlayers(selectedServerId, []);
                rconStore.setConnectionInfo(selectedServerId, null);
                setIsStreamingLogs(false);
                setLogStream([]);
                toast.success(t('rcon.disconnectedMsg', 'Disconnected from RCON'));
                return;
            }
            toast.error(t('rcon.disconnectFailed', { error: errMsg, defaultValue: `Disconnect failed: ${errMsg}` }));
        }
    };

    const addToHistory = (cmd: string, response: string, success: boolean) => {
        if (!selectedServerId) return;
        rconStore.addHistory(selectedServerId, {
            command: cmd,
            response,
            timestamp: new Date(),
            success,
        });
    };

    const sendCommand = async (cmd?: string) => {
        const cmdToSend = cmd || command;
        if (!cmdToSend.trim() || !selectedServerId || !isConnected) return;

        try {
            const response = await invoke<RconResponse>('rcon_send_command', {
                serverId: selectedServerId,
                command: cmdToSend,
            });

            addToHistory(cmdToSend, response.data || response.message, response.success);
            rconStore.setLastError(selectedServerId, null);

            if (!cmd) {
                setCommand('');
                setHistoryIndex(-1);
                setAutocompleteVisible(false);
            }
        } catch (error) {
            const errMsg = String(error);
            addToHistory(cmdToSend, errMsg, false);
            rconStore.setLastError(selectedServerId, errMsg);

            if (errMsg.toLowerCase().includes('connection lost') || errMsg.includes('No active RCON connection') || errMsg.toLowerCase().includes('reconnect')) {
                rconStore.setConnected(selectedServerId, false);
                rconStore.setPlayers(selectedServerId, []);
                rconStore.setConnectionInfo(selectedServerId, null);
                setIsStreamingLogs(false);
            }
        }
    };

    const refreshPlayers = async () => {
        if (!selectedServerId || !isConnected) return;

        try {
            const playerList = await invoke<RconPlayer[]>('rcon_get_players', {
                serverId: selectedServerId,
            });
            rconStore.setPlayers(selectedServerId, playerList);
        } catch (error) {
            const errMsg = String(error);
            console.error('Failed to get players:', errMsg);

            if (errMsg.toLowerCase().includes('connection lost') || errMsg.includes('No active RCON connection') || errMsg.toLowerCase().includes('reconnect')) {
                rconStore.setConnected(selectedServerId, false);
                rconStore.setPlayers(selectedServerId, []);
                rconStore.setConnectionInfo(selectedServerId, null);
            }
        }
    };

    // Connection Heartbeat: Verify connection is still alive every 15 seconds
    useEffect(() => {
        if (!isConnected || !selectedServerId) return;

        const interval = setInterval(async () => {
            try {
                const connected = await invoke<boolean>('rcon_is_connected', {
                    serverId: selectedServerId,
                });

                if (!connected) {
                    console.log('[RCON] Heartbeat detected lost connection');
                    rconStore.setConnected(selectedServerId, false);
                    rconStore.setPlayers(selectedServerId, []);
                    rconStore.setConnectionInfo(selectedServerId, null);
                    setIsStreamingLogs(false);
                    addToHistory('system', t('rcon.connectionLost', 'Connection to RCON was lost'), false);
                }
            } catch (error) {
                console.error('[RCON] Heartbeat check failed:', error);
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [isConnected, selectedServerId, rconStore, t]);

    const kickPlayer = async (steamId: string, reason?: string) => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_kick_player', {
                serverId: selectedServerId,
                steamId,
                reason,
            });
            toast.success(t('rcon.playerKicked', 'Player kicked successfully'));
            refreshPlayers();
        } catch (error) {
            toast.error(t('rcon.kickFailed', { error: String(error), defaultValue: `Kick failed: ${error}` }));
        }
    };

    const banPlayer = async (steamId: string) => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_ban_player', {
                serverId: selectedServerId,
                steamId,
            });
            toast.success(t('rcon.playerBanned', 'Player banned successfully'));
            refreshPlayers();
        } catch (error) {
            toast.error(t('rcon.banFailed', { error: String(error), defaultValue: `Ban failed: ${error}` }));
        }
    };

    const broadcastMessage = async () => {
        const message = prompt(t('rcon.broadcastPrompt', 'Enter the global announcement text:'));
        if (!message || !selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_broadcast', {
                serverId: selectedServerId,
                message,
            });
            toast.success(t('rcon.broadcastSent', 'Announcement sent'));
            addToHistory(`ServerChat ${message}`, t('rcon.broadcastSent', 'Announcement sent'), true);
        } catch (error) {
            toast.error(t('rcon.broadcastFailed', { error: String(error), defaultValue: `Broadcast failed: ${error}` }));
        }
    };

    // Filter autocomplete suggestions based on user typing
    const suggestions = useMemo(() => {
        if (!command.trim() || command.includes(' ')) return [];
        return AUTOCOMPLETE_COMMANDS.filter(c =>
            c.command.toLowerCase().startsWith(command.toLowerCase())
        );
    }, [command]);

    useEffect(() => {
        if (suggestions.length > 0) {
            setAutocompleteVisible(true);
        } else {
            setAutocompleteVisible(false);
        }
        setAutocompleteIndex(0);
    }, [suggestions]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (autocompleteVisible && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAutocompleteIndex(prev => (prev + 1) % suggestions.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAutocompleteIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                return;
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                setCommand(suggestions[autocompleteIndex].command + ' ');
                setAutocompleteVisible(false);
                return;
            }
            if (e.key === 'Escape') {
                setAutocompleteVisible(false);
                return;
            }
        }

        if (e.key === 'Enter') {
            sendCommand();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const commands = commandHistory.map(h => h.command);
            if (historyIndex < commands.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setCommand(commands[commands.length - 1 - newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const commands = commandHistory.map(h => h.command);
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setCommand(commands[commands.length - 1 - newIndex]);
            } else {
                setHistoryIndex(-1);
                setCommand('');
            }
        }
    };

    // Execute cluster command
    const executeClusterCommand = async () => {
        if (!clusterCommand.trim() || clusterSelectedServers.length === 0) return;
        
        setClusterIsExecuting(true);
        const nextProgress = { ...clusterProgress };
        clusterSelectedServers.forEach(id => {
            nextProgress[id] = { status: 'sending', response: 'Sending...' };
        });
        setClusterProgress(nextProgress);

        try {
            const results = await invoke<ClusterResult[]>('rcon_execute_cluster_command', {
                serverIds: clusterSelectedServers,
                command: clusterCommand
            });

            const finalProgress = { ...clusterProgress };
            results.forEach(res => {
                finalProgress[res.server_id] = {
                    status: res.success ? 'success' : 'error',
                    response: res.response
                };
            });
            setClusterProgress(finalProgress);
            toast.success(t('rcon.clusterExecComplete', 'Cluster commands execution complete'));
        } catch (error) {
            console.error('Cluster execution failed:', error);
            toast.error(t('rcon.clusterExecFailed', `Cluster execution failed: ${error}`));
        } finally {
            setClusterIsExecuting(false);
        }
    };

    // Dedicated verified manual world save procedure
    const triggerManualSave = async () => {
        if (!selectedServerId || !isConnected) {
            toast.error(t('rcon.notConnectedSave', 'Must be connected to run saves.'));
            return;
        }

        setSaveProgressState('sending');
        setSaveValidationResult(null);

        try {
            // Step 1: Send SaveWorld command via RCON
            await invoke<RconResponse>('rcon_save_world', { serverId: selectedServerId });
            
            // Step 2: Waiting for server disk sync (3 seconds delay to let engine flush stream)
            setSaveProgressState('syncing');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Step 3: Verifying filesystem integrity
            setSaveProgressState('verifying');
            const validationInfo = await invoke<SaveValidationInfo>('rcon_validate_save', { serverId: selectedServerId });
            
            setSaveValidationResult(validationInfo);
            
            if (validationInfo.exists && validationInfo.integrity_ok) {
                setSaveProgressState('success');
                toast.success(t('rcon.saveVerified', 'World save successfully verified!'));
                
                setSaveValidationHistory(prev => [
                    {
                        serverId: selectedServerId,
                        serverName: selectedServer?.name || `Server #${selectedServerId}`,
                        timestamp: new Date(),
                        info: validationInfo
                    },
                    ...prev
                ]);
            } else {
                setSaveProgressState('error');
                toast.error(validationInfo.error_message || t('rcon.saveIntegrityError', 'Save file verification failed.'));
            }
        } catch (error) {
            console.error('Manual save failed:', error);
            setSaveProgressState('error');
            toast.error(t('rcon.saveFailed', `Manual save failed: ${error}`));
        }
    };

    // Filter live log stream
    const filteredLogs = useMemo(() => {
        if (!logSearchQuery.trim()) return logStream;
        const q = logSearchQuery.toLowerCase();
        return logStream.filter(l => l.line.toLowerCase().includes(q));
    }, [logStream, logSearchQuery]);

    // Format bytes to human readable sizes
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = 2;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const renderErrorResponse = (response: string) => {
        const { category, icon: ErrorIcon, colorClass } = classifyError(response);
        return (
            <div className={cn("pl-4 mt-1.5 flex items-start gap-2.5 p-2 rounded-lg border text-sm font-sans", colorClass)}>
                <ErrorIcon className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                    <span className="font-bold">{category}:</span>{' '}
                    <span className="whitespace-pre-wrap opacity-90">{response}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20 select-none">
            {/* Header section with layout adjustments */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/30 p-5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 flex items-center gap-3">
                        <TerminalIcon className="w-8 h-8 text-cyan-400" />
                        {t('rcon.title', 'RCON Console')}
                    </h1>
                    <p className="text-slate-400 mt-1 text-sm">{t('rcon.description', 'Advanced live logs streaming, cluster controls and world save verification')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <ServerSelect 
                        value={selectedServerId} 
                        onChange={setSelectedServerId} 
                        accentColor="sky" 
                    />

                    <button
                        onClick={() => setIsHelpOpen(true)}
                        className="p-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 hover:text-cyan-400 rounded-xl text-slate-400 transition-colors"
                        title="RCON Commands Guide"
                    >
                        <HelpCircle className="w-5 h-5" />
                    </button>

                    <button
                        onClick={isConnected ? disconnect : connect}
                        disabled={isConnecting || !selectedServer}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg active:scale-98",
                            isConnected
                                ? "bg-red-950/30 text-red-400 border border-red-500/30 hover:bg-red-900/30 shadow-red-950/10"
                                : "bg-cyan-950/30 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-900/30 shadow-cyan-950/10",
                            isConnecting && "opacity-50 cursor-wait"
                        )}
                    >
                        {isConnecting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : isConnected ? (
                            <WifiOff className="w-4 h-4" />
                        ) : (
                            <Wifi className="w-4 h-4" />
                        )}
                        {isConnecting ? t('rcon.connecting', 'Connecting...') : isConnected ? t('rcon.disconnect', 'Disconnect') : t('rcon.connect', 'Connect')}
                    </button>
                </div>
            </div>

            {/* Modern Glassmorphic Tabs Navigation */}
            <div className="flex p-1.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-md w-max shadow-inner gap-1 mb-2">
                <button
                    onClick={() => setActiveTab('terminal')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'terminal' 
                            ? "text-cyan-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <TerminalIcon className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.terminal', 'Interactive Terminal')}</span>
                </button>

                <button
                    onClick={() => setActiveTab('log_stream')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'log_stream' 
                            ? "text-blue-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <Eye className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.logStream', 'Live Log Feed')}</span>
                    {isStreamingLogs && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('cluster')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'cluster' 
                            ? "text-purple-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <Layers className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.cluster', 'Cluster Deck')}</span>
                </button>

                <button
                    onClick={() => setActiveTab('save_manager')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'save_manager' 
                            ? "text-emerald-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <Save className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.saveManager', 'Verified Saves')}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* Main Action Deck Container */}
                <div className="lg:col-span-3 glass-panel rounded-2xl border border-slate-800 bg-slate-900/10 p-5 flex flex-col min-h-[600px] relative overflow-visible">
                    
                    {/* TAB 1: INTERACTIVE TERMINAL */}
                    {activeTab === 'terminal' && (
                        <div className="flex-1 flex flex-col h-full">
                            {/* Connection Info Bar */}
                            {isConnected && connectionInfo && (
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl text-xs font-mono text-cyan-400">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                                        <span>{t('rcon.connectedTo', { address: `${connectionInfo.address}:${connectionInfo.port}`, defaultValue: `Connected to ${connectionInfo.address}:${connectionInfo.port}` })}</span>
                                    </div>
                                    {connectionInfo.connectedSince && (
                                        <span className="text-cyan-500/60 font-sans">
                                            {t('rcon.since', { time: connectionInfo.connectedSince.toLocaleTimeString(), defaultValue: `since ${connectionInfo.connectedSince.toLocaleTimeString()}` })}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Quick Commands Grid */}
                            <div className="flex flex-wrap gap-2.5 mb-4 pb-4 border-b border-slate-800/60">
                                {QUICK_COMMANDS.map((qc) => (
                                    <button
                                        key={qc.command}
                                        onClick={() => sendCommand(qc.command)}
                                        disabled={!isConnected}
                                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-900/60 hover:bg-slate-850 border border-slate-800/80 rounded-xl text-xs text-slate-300 font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <qc.icon className="w-4 h-4 text-cyan-400" />
                                        {t(qc.labelKey, qc.labelDefault)}
                                    </button>
                                ))}
                                <button
                                    onClick={broadcastMessage}
                                    disabled={!isConnected}
                                    className="flex items-center gap-2 px-3.5 py-2 bg-amber-950/20 hover:bg-amber-900/20 border border-amber-800/30 rounded-xl text-xs text-amber-400 font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    {t('rcon.quickCommands.broadcast', 'Broadcast')}
                                </button>
                                <button
                                    onClick={() => {
                                        if (selectedServerId) rconStore.clearServerState(selectedServerId);
                                    }}
                                    className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 text-slate-400 hover:text-slate-300 border border-slate-850 rounded-xl text-xs ml-auto transition-all active:scale-95"
                                    title="Clear output console log buffer"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>{t('rcon.clearLogs', 'Clear')}</span>
                                </button>
                            </div>

                            {/* Terminal Shell scroll view */}
                            <div
                                ref={terminalRef}
                                className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-sm overflow-y-auto mb-4 border border-slate-850 max-h-[400px] shadow-inner"
                                onClick={() => inputRef.current?.focus()}
                            >
                                {commandHistory.length === 0 ? (
                                    <div className="text-slate-500 italic text-xs p-2">
                                        {isConnected
                                            ? t('rcon.welcomeMsg', 'RCON Connection ready. Enter commands in the prompt below.')
                                            : t('rcon.connectMsg', 'Please click "Connect" to open RCON connection.')}
                                    </div>
                                ) : (
                                    commandHistory.map((entry, i) => (
                                        <div key={i} className="mb-4 last:mb-1 animate-in fade-in duration-300">
                                            <div className="flex items-center gap-2 border-b border-slate-900/50 pb-1 mb-1.5">
                                                <span className="text-cyan-500 font-bold">❯</span>
                                                <span className="text-cyan-400 text-xs font-semibold">{entry.command}</span>
                                                <span className="text-slate-600 text-[10px] ml-auto">
                                                    {entry.timestamp.toLocaleTimeString()}
                                                </span>
                                            </div>
                                            {entry.success ? (
                                                <div className="pl-4 whitespace-pre-wrap text-slate-300 text-xs leading-relaxed font-sans bg-slate-900/20 p-2.5 rounded-lg border border-slate-900/50">
                                                    {entry.response}
                                                </div>
                                            ) : (
                                                renderErrorResponse(entry.response)
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Command Input & Autocomplete system */}
                            <div className="relative">
                                <div className="flex items-center gap-3 bg-slate-950 rounded-xl px-4 py-3 border border-slate-850 focus-within:border-cyan-500/50 transition-all duration-300 shadow-md">
                                    <TerminalIcon className="w-5 h-5 text-cyan-400 shrink-0" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={command}
                                        onChange={(e) => setCommand(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={isConnected ? t('rcon.typeCommand', 'Type an RCON command and press Enter...') : t('rcon.connectMsg', 'Please click "Connect" to open RCON connection.')}
                                        disabled={!isConnected}
                                        className="flex-1 bg-transparent text-white text-sm focus:outline-none font-mono placeholder:text-slate-600 disabled:cursor-not-allowed"
                                    />
                                    <button
                                        onClick={() => sendCommand()}
                                        disabled={!isConnected || !command.trim()}
                                        className="p-2 bg-cyan-950/50 hover:bg-cyan-900/20 text-cyan-400 border border-cyan-800/30 rounded-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Autocomplete Suggestion Dropdown */}
                                {autocompleteVisible && suggestions.length > 0 && (
                                    <div className="absolute left-0 bottom-full mb-2 w-full bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                                        <div className="bg-slate-900/50 px-4 py-2 border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                                            RCON Command Autocomplete (Use ↑ ↓ Tab / Enter to select)
                                        </div>
                                        <div className="max-h-[220px] overflow-y-auto">
                                            {suggestions.map((s, idx) => (
                                                <button
                                                    key={s.command}
                                                    onClick={() => {
                                                        setCommand(s.command + ' ');
                                                        setAutocompleteVisible(false);
                                                        inputRef.current?.focus();
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-4 py-3 flex items-center justify-between text-xs border-b border-slate-900/40 transition-colors",
                                                        idx === autocompleteIndex 
                                                            ? "bg-cyan-950/30 text-cyan-400 border-l-2 border-l-cyan-400" 
                                                            : "text-slate-300 hover:bg-slate-900/40"
                                                    )}
                                                >
                                                    <span className="font-mono font-semibold">{s.command}</span>
                                                    <span className="text-slate-500 text-[11px] font-sans truncate ml-4 max-w-[60%]">{s.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 2: LIVE LOG STREAM FEED */}
                    {activeTab === 'log_stream' && (
                        <div className="flex-1 flex flex-col h-full">
                            {/* Streaming Control Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 border border-slate-850 p-4 rounded-xl mb-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setIsStreamingLogs(!isStreamingLogs)}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95",
                                            isStreamingLogs
                                                ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20 hover:bg-emerald-900/20"
                                                : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-300"
                                        )}
                                    >
                                        {isStreamingLogs ? (
                                            <>
                                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                <span>Log Streaming Active</span>
                                            </>
                                        ) : (
                                            <>
                                                <EyeOff className="w-4 h-4" />
                                                <span>Enable Log Streaming</span>
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                                        className={cn(
                                            "p-2 rounded-xl border text-xs transition-colors",
                                            autoScrollLogs
                                                ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/20 hover:bg-cyan-900/20"
                                                : "bg-slate-950 text-slate-500 border-slate-850 hover:text-slate-400"
                                        )}
                                        title={autoScrollLogs ? "Auto-scroll logs enabled" : "Auto-scroll logs paused"}
                                    >
                                        {autoScrollLogs ? <Check className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                    </button>

                                    <button
                                        onClick={() => setLogStream([])}
                                        className="p-2 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl text-slate-500 hover:text-red-400 transition-colors"
                                        title="Clear live logs"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="relative max-w-xs w-full">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={logSearchQuery}
                                        onChange={(e) => setLogSearchQuery(e.target.value)}
                                        placeholder="Quick filter log content..."
                                        className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                                    />
                                </div>
                            </div>

                            {/* Log Feed Console view */}
                            <div
                                ref={logFeedRef}
                                className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-xs overflow-y-auto border border-slate-850 max-h-[420px] shadow-inner text-slate-400 leading-relaxed"
                            >
                                {filteredLogs.length === 0 ? (
                                    <div className="text-slate-600 italic text-center py-12">
                                        {isStreamingLogs 
                                            ? "Waiting for ShooterGame.log events... (or search found zero hits)" 
                                            : "Streaming is disabled. Enable it above to listen to live server logs in real time."}
                                    </div>
                                ) : (
                                    filteredLogs.map((entry, idx) => (
                                        <div key={idx} className="mb-2 last:mb-0 hover:bg-slate-900/30 p-1 rounded transition-colors flex items-start gap-3">
                                            <span className="text-slate-600 text-[10px] shrink-0 mt-0.5 select-none">{entry.timestamp.toLocaleTimeString()}</span>
                                            <span className="whitespace-pre-wrap break-all">{entry.line}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 3: CLUSTER COMMAND CONTROL PANEL */}
                    {activeTab === 'cluster' && (
                        <div className="flex-1 flex flex-col h-full space-y-5">
                            <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl">
                                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-cyan-400" />
                                    <span>Cluster wide target server selection</span>
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Select which active servers this command will execute on simultaneously:</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {servers.map(server => (
                                        <label
                                            key={server.id}
                                            className={cn(
                                                "p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all hover:bg-slate-800/40",
                                                clusterSelectedServers.includes(server.id)
                                                    ? "bg-cyan-950/15 border-cyan-500/20 text-cyan-300"
                                                    : "bg-slate-900/50 border-slate-850 text-slate-400"
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={clusterSelectedServers.includes(server.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setClusterSelectedServers(prev => [...prev, server.id]);
                                                    } else {
                                                        setClusterSelectedServers(prev => prev.filter(id => id !== server.id));
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-slate-800 accent-cyan-500 bg-slate-950 focus:ring-0 cursor-pointer"
                                            />
                                            <div className="truncate">
                                                <p className="text-xs font-semibold text-white truncate">{server.name}</p>
                                                <p className="text-[10px] text-slate-500 font-mono">{server.ipAddress || '127.0.0.1'}:{server.ports.rconPort}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Command Input Deck */}
                            <div className="flex items-center gap-3 bg-slate-950 rounded-xl px-4 py-3.5 border border-slate-850 focus-within:border-cyan-500/50 transition-all duration-300 shadow-md">
                                <TerminalIcon className="w-5 h-5 text-cyan-400" />
                                <input
                                    type="text"
                                    value={clusterCommand}
                                    onChange={(e) => setClusterCommand(e.target.value)}
                                    placeholder="Enter command to broadcast/run on all cluster members simultaneously..."
                                    className="flex-1 bg-transparent text-white text-sm focus:outline-none font-mono placeholder:text-slate-600"
                                    disabled={clusterIsExecuting}
                                />
                                <button
                                    onClick={executeClusterCommand}
                                    disabled={clusterIsExecuting || !clusterCommand.trim() || clusterSelectedServers.length === 0}
                                    className="flex items-center gap-2 px-5 py-2 bg-cyan-950/50 hover:bg-cyan-900/20 text-cyan-400 border border-cyan-800/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {clusterIsExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                    <span>Execute</span>
                                </button>
                            </div>

                            {/* Responses Output Cards Grid */}
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                {Object.keys(clusterProgress).length === 0 ? (
                                    <div className="text-slate-600 italic text-xs py-8 text-center bg-slate-950/20 rounded-xl border border-slate-900/50">
                                        No cluster executions triggered yet in this session.
                                    </div>
                                ) : (
                                    Object.entries(clusterProgress).map(([idStr, val]) => {
                                        const sId = Number(idStr);
                                        const server = servers.find(s => s.id === sId);
                                        return (
                                            <div
                                                key={sId}
                                                className="bg-slate-950 rounded-xl p-4 border border-slate-850 flex items-start gap-4 hover:border-slate-800 transition-colors duration-200"
                                            >
                                                <div className="w-40 truncate">
                                                    <p className="text-xs font-bold text-white truncate">{server?.name || `Server #${sId}`}</p>
                                                    <div className="mt-1">
                                                        {val.status === 'sending' && (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                                                <span>Executing</span>
                                                            </span>
                                                        )}
                                                        {val.status === 'success' && (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                <Check className="w-2.5 h-2.5" />
                                                                <span>Success</span>
                                                            </span>
                                                        )}
                                                        {val.status === 'error' && (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                                <XCircle className="w-2.5 h-2.5" />
                                                                <span>Failed</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Response</p>
                                                    <div className="mt-1 font-mono text-[11px] text-slate-300 whitespace-pre-wrap bg-slate-900/30 p-2.5 rounded-lg border border-slate-900/50 truncate max-h-[100px] overflow-y-auto">
                                                        {val.response}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 4: MANUAL WORLD SAVE DECK */}
                    {activeTab === 'save_manager' && (
                        <div className="flex-1 flex flex-col h-full space-y-6">
                            
                            {/* Massive Verified Manual Save Control Board */}
                            <div className="bg-slate-950/40 border border-slate-850 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-md relative overflow-hidden">
                                <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none select-none text-[150px] text-cyan-400">
                                    🦖
                                </div>

                                <div className="space-y-2 max-w-lg">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Database className="w-5 h-5 text-cyan-400" />
                                        <span>Verified Save World Engine</span>
                                    </h3>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Triggers the <code className="text-cyan-400 font-semibold font-mono bg-cyan-950/20 px-1 py-0.5 rounded">SaveWorld</code> engine command via RCON and verifies that the output save file is successfully written to disk, checking size and timestamp metrics in real time.
                                    </p>
                                </div>

                                <div className="shrink-0 flex flex-col items-center gap-2">
                                    <button
                                        onClick={triggerManualSave}
                                        disabled={saveProgressState !== 'idle' && saveProgressState !== 'success' && saveProgressState !== 'error'}
                                        className={cn(
                                            "flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm shadow-xl transition-all duration-300 transform active:scale-95",
                                            saveProgressState === 'idle' || saveProgressState === 'success' || saveProgressState === 'error'
                                                ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-cyan-950/20"
                                                : "bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed"
                                        )}
                                    >
                                        {['sending', 'syncing', 'verifying'].includes(saveProgressState) ? (
                                            <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                                        ) : (
                                            <Save className="w-5 h-5" />
                                        )}
                                        <span>Trigger Verified Save</span>
                                    </button>

                                    {/* Action Status Label */}
                                    {saveProgressState === 'sending' && (
                                        <span className="text-[10px] text-amber-400 font-semibold animate-pulse">1. Sending RCON command...</span>
                                    )}
                                    {saveProgressState === 'syncing' && (
                                        <span className="text-[10px] text-amber-500 font-semibold animate-pulse">2. Waiting for server disk sync (3s)...</span>
                                    )}
                                    {saveProgressState === 'verifying' && (
                                        <span className="text-[10px] text-cyan-400 font-semibold animate-pulse">3. Scanning file integrity...</span>
                                    )}
                                    {saveProgressState === 'success' && (
                                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Save verified successfully!</span>
                                        </span>
                                    )}
                                    {saveProgressState === 'error' && (
                                        <span className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>Save verification failed</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Save Validation Result Panel */}
                            {saveValidationResult && (
                                <div className="bg-slate-950 rounded-2xl p-5 border border-slate-850 shadow-inner grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Save File Name</p>
                                        <p className="text-sm font-semibold text-white truncate font-mono mt-1" title={saveValidationResult.file_name}>
                                            {saveValidationResult.file_name}
                                        </p>
                                    </div>
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">File Size</p>
                                        <p className="text-sm font-semibold text-cyan-400 font-mono mt-1">
                                            {formatBytes(saveValidationResult.file_size_bytes)}
                                        </p>
                                    </div>
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Last Modified</p>
                                        <p className="text-sm font-semibold text-white truncate font-mono mt-1">
                                            {saveValidationResult.last_modified}
                                        </p>
                                    </div>
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">FS Integrity Scan</p>
                                        <div className="mt-1">
                                            {saveValidationResult.integrity_ok ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                                    <span>OK (PASSED)</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                                                    <span>CORRUPTED/FAILED</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Saves Validation Logs History */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-400 flex items-center gap-2">
                                    <History className="w-4 h-4" />
                                    <span>Verified Save validation logs history</span>
                                </h4>

                                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                                    {saveValidationHistory.length === 0 ? (
                                        <p className="text-[11px] text-slate-600 italic py-4">No validation history records for this session.</p>
                                    ) : (
                                        saveValidationHistory.map((h, i) => (
                                            <div
                                                key={i}
                                                className="bg-slate-950/40 border border-slate-850/60 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs"
                                            >
                                                <div className="space-y-1">
                                                    <p className="font-bold text-white">{h.serverName}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono">{h.info.file_name}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-semibold text-cyan-400 font-mono">{formatBytes(h.info.file_size_bytes)}</span>
                                                    <p className="text-[9px] text-slate-500 mt-0.5">{h.timestamp.toLocaleTimeString()} | {h.info.last_modified}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* SIDE PANEL: ONLINE PLAYER LISTING */}
                <div className="glass-panel rounded-2xl border border-slate-800 p-5 flex flex-col min-h-[600px] bg-slate-950/10 shadow-lg">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-cyan-400" />
                            <span>{t('rcon.playersOnline', { count: players.length, defaultValue: `Players Online (${players.length})` })}</span>
                        </h3>
                        <button
                            onClick={refreshPlayers}
                            disabled={!isConnected}
                            className="p-2 bg-slate-900 border border-slate-850 hover:bg-slate-850 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Refresh player list"
                        >
                            <RefreshCw className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>

                    <div className="space-y-2.5 overflow-y-auto flex-1 max-h-[500px] pr-1">
                        {!isConnected ? (
                            <p className="text-slate-500 text-xs text-center py-12">
                                {t('rcon.connectToView', 'Please connect to RCON to fetch current server player lists.')}
                            </p>
                        ) : players.length === 0 ? (
                            <p className="text-slate-500 text-xs text-center py-12">
                                {t('rcon.noPlayers', 'No survivors currently connected to this server.')}
                            </p>
                        ) : (
                            players.map((player) => (
                                <div
                                    key={player.steamId}
                                    className="bg-slate-950 border border-slate-850/80 hover:border-slate-800 rounded-xl p-3.5 transition-colors duration-250"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-white truncate">{player.name}</p>
                                            <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{player.steamId}</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => kickPlayer(player.steamId)}
                                                className="p-1.5 bg-amber-950/20 border border-amber-900/20 hover:bg-amber-900/20 text-amber-400 rounded-lg transition-colors"
                                                title={t('rcon.quickCommands.kickPlayer', 'Kick Survivor')}
                                            >
                                                <UserX className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => banPlayer(player.steamId)}
                                                className="p-1.5 bg-rose-950/20 border border-rose-900/20 hover:bg-rose-900/20 text-rose-400 rounded-lg transition-colors"
                                                title={t('rcon.quickCommands.banPlayer', 'Ban Survivor')}
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <RconHelpModal
                isOpen={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
            />
        </div>
    );
}
