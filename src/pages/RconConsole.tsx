import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Terminal,
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
    HelpCircle
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { useRconStore, RconPlayer } from '../stores/rconStore';
import RconHelpModal from '../components/ui/RconHelpModal';

interface RconResponse {
    success: boolean;
    message: string;
    data?: string;
}

const QUICK_COMMANDS = [
    { labelKey: 'rcon.quickCommands.saveWorld', command: 'SaveWorld', icon: Save },
    { labelKey: 'rcon.quickCommands.listPlayers', command: 'ListPlayers', icon: Users },
    { labelKey: 'rcon.quickCommands.destroyWild', command: 'DestroyWildDinos', icon: Trash2 },
    { labelKey: 'rcon.quickCommands.dayTime', command: 'SetTimeOfDay 12:00', icon: Clock },
    { labelKey: 'rcon.quickCommands.nightTime', command: 'SetTimeOfDay 00:00', icon: Clock },
];

export default function RconConsole() {
    const { t } = useTranslation();
    const { servers } = useServerStore();

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

    const [command, setCommand] = useState('');
    const [historyIndex, setHistoryIndex] = useState(-1);
    const terminalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [commandHistory]);

    // Select first server
    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

    const selectedServer = servers.find(s => s.id === selectedServerId);

    const connect = useCallback(async () => {
        if (!selectedServer) return;

        rconStore.setConnecting(selectedServer.id, true);
        try {
            console.log(`[RCON] Connecting to ${selectedServer.ipAddress || '127.0.0.1'}:${selectedServer.ports.rconPort}...`);
            const response = await invoke<RconResponse>('rcon_connect', {
                serverId: selectedServer.id,
                address: selectedServer.ipAddress || '127.0.0.1',
                port: selectedServer.ports.rconPort,
                password: selectedServer.config.adminPassword,
            });

            if (response.success) {
                console.log('[RCON] Connected successfully!');
                rconStore.setConnected(selectedServer.id, true);
                toast.success(t('rcon.connectedMsg', 'Connected to RCON'));
                addToHistory('connect', t('rcon.connectedMsg', 'Connected to RCON'), true);
                refreshPlayers();
            }
        } catch (error) {
            const errMsg = String(error);
            console.error('[RCON] Connection failed:', errMsg);
            toast.error(t('rcon.connectFailed', { error: errMsg, defaultValue: `Connection failed: ${errMsg}` }));
            addToHistory('connect', `Failed: ${errMsg}`, false);
        } finally {
            rconStore.setConnecting(selectedServer.id, false);
        }
    }, [selectedServer, rconStore]);

    const disconnect = async () => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_disconnect', { serverId: selectedServerId });
            rconStore.setConnected(selectedServerId, false);
            rconStore.setPlayers(selectedServerId, []);
            toast.success(t('rcon.disconnectedMsg'));
            addToHistory('disconnect', t('rcon.disconnectedMsg'), true);
        } catch (error) {
            toast.error(t('rcon.disconnectFailed', { error: String(error) }));
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

            if (!cmd) {
                setCommand('');
                setHistoryIndex(-1);
            }
        } catch (error) {
            addToHistory(cmdToSend, t('common.error', { error: String(error) }), false);
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
            console.error('Failed to get players:', error);
        }
    };

    const kickPlayer = async (steamId: string, reason?: string) => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_kick_player', {
                serverId: selectedServerId,
                steamId,
                reason,
            });
            toast.success(t('rcon.playerKicked'));
            refreshPlayers();
        } catch (error) {
            toast.error(t('rcon.kickFailed', { error: String(error) }));
        }
    };

    const banPlayer = async (steamId: string) => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_ban_player', {
                serverId: selectedServerId,
                steamId,
            });
            toast.success(t('rcon.playerBanned'));
            refreshPlayers();
        } catch (error) {
            toast.error(t('rcon.banFailed', { error: String(error) }));
        }
    };

    const broadcastMessage = async () => {
        const message = prompt(t('rcon.broadcastPrompt'));
        if (!message || !selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_broadcast', {
                serverId: selectedServerId,
                message,
            });
            toast.success(t('rcon.broadcastSent'));
            addToHistory(`ServerChat ${message}`, t('rcon.broadcastSent'), true);
        } catch (error) {
            toast.error(t('rcon.broadcastFailed', { error: String(error) }));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
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

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                        {t('rcon.title')}
                    </h1>
                    <p className="text-slate-400 mt-1">{t('rcon.description')}</p>
                </div>

                <div className="flex items-center gap-4">
                    <select
                        value={selectedServerId || ''}
                        onChange={(e) => {
                            setSelectedServerId(Number(e.target.value));
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                        {servers.map(server => (
                            <option key={server.id} value={server.id}>{server.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => setIsHelpOpen(true)}
                        className="p-2 bg-slate-800 border border-slate-700 hover:bg-slate-700/80 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors"
                        title="RCON Guide"
                    >
                        <HelpCircle className="w-5 h-5" />
                    </button>

                    <button
                        onClick={isConnected ? disconnect : connect}
                        disabled={isConnecting || !selectedServer}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all",
                            isConnected
                                ? "bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
                                : "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30",
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
                        {isConnecting ? t('rcon.connecting') : isConnected ? t('rcon.disconnect') : t('rcon.connect')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Terminal */}
                <div className="lg:col-span-3 glass-panel rounded-2xl p-4 flex flex-col" style={{ height: '600px' }}>
                    {/* Quick Commands */}
                    <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-700/50">
                        {QUICK_COMMANDS.map((qc) => (
                            <button
                                key={qc.command}
                                onClick={() => sendCommand(qc.command)}
                                disabled={!isConnected}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <qc.icon className="w-3.5 h-3.5" />
                                {t(qc.labelKey)}
                            </button>
                        ))}
                        <button
                            onClick={broadcastMessage}
                            disabled={!isConnected}
                            className="flex items-center gap-2 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded-lg text-sm text-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            {t('rcon.quickCommands.broadcast')}
                        </button>
                    </div>

                    {/* Terminal Output */}
                    <div
                        ref={terminalRef}
                        className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-sm overflow-y-auto mb-4"
                        onClick={() => inputRef.current?.focus()}
                    >
                        {commandHistory.length === 0 ? (
                            <div className="text-slate-600 italic">
                                {isConnected
                                    ? t('rcon.welcomeMsg')
                                    : t('rcon.connectMsg')}
                            </div>
                        ) : (
                            commandHistory.map((entry, i) => (
                                <div key={i} className="mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-cyan-500">❯</span>
                                        <span className="text-cyan-400">{entry.command}</span>
                                        <span className="text-slate-600 text-xs ml-auto">
                                            {entry.timestamp.toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className={cn(
                                        "pl-4 mt-1 whitespace-pre-wrap",
                                        entry.success ? "text-slate-300" : "text-red-400"
                                    )}>
                                        {entry.response}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Command Input */}
                    <div className="flex items-center gap-3 bg-slate-900 rounded-xl px-4 py-3 border border-slate-700">
                        <Terminal className="w-5 h-5 text-cyan-500" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isConnected ? t('rcon.typeCommand') : t('rcon.connectMsg')}
                            disabled={!isConnected}
                            className="flex-1 bg-transparent text-white focus:outline-none font-mono placeholder:text-slate-600 disabled:cursor-not-allowed"
                        />
                        <button
                            onClick={() => sendCommand()}
                            disabled={!isConnected || !command.trim()}
                            className="p-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Player List */}
                <div className="glass-panel rounded-2xl p-4" style={{ height: '600px' }}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-cyan-400" />
                            {t('rcon.playersOnline', { count: players.length })}
                        </h3>
                        <button
                            onClick={refreshPlayers}
                            disabled={!isConnected}
                            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>

                    <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100% - 60px)' }}>
                        {!isConnected ? (
                            <p className="text-slate-500 text-sm text-center py-8">
                                {t('rcon.connectToView')}
                            </p>
                        ) : players.length === 0 ? (
                            <p className="text-slate-500 text-sm text-center py-8">
                                {t('rcon.noPlayers')}
                            </p>
                        ) : (
                            players.map((player) => (
                                <div
                                    key={player.steamId}
                                    className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-white">{player.name}</p>
                                            <p className="text-xs text-slate-500 font-mono">{player.steamId}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => kickPlayer(player.steamId)}
                                                className="p-1.5 hover:bg-amber-600/20 text-amber-400 rounded transition-colors"
                                                title={t('rcon.quickCommands.kickPlayer')}
                                            >
                                                <UserX className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => banPlayer(player.steamId)}
                                                className="p-1.5 hover:bg-red-600/20 text-red-400 rounded transition-colors"
                                                title={t('rcon.quickCommands.banPlayer')}
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
