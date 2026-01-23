import { useState, useEffect, useRef, useCallback } from 'react';
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
    RefreshCw
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';

interface RconPlayer {
    id: number;
    name: string;
    steamId: string;
}

interface RconResponse {
    success: boolean;
    message: string;
    data?: string;
}

interface CommandHistoryEntry {
    command: string;
    response: string;
    timestamp: Date;
    success: boolean;
}

const QUICK_COMMANDS = [
    { label: 'Save World', command: 'SaveWorld', icon: Save },
    { label: 'List Players', command: 'ListPlayers', icon: Users },
    { label: 'Destroy Wild Dinos', command: 'DestroyWildDinos', icon: Trash2 },
    { label: 'Day Time', command: 'SetTimeOfDay 12:00', icon: Clock },
    { label: 'Night Time', command: 'SetTimeOfDay 00:00', icon: Clock },
];

export default function RconConsole() {
    const { servers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [command, setCommand] = useState('');
    const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([]);
    const [players, setPlayers] = useState<RconPlayer[]>([]);
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

        setIsConnecting(true);
        try {
            const response = await invoke<RconResponse>('rcon_connect', {
                serverId: selectedServer.id,
                address: selectedServer.ipAddress || '127.0.0.1',
                port: selectedServer.ports.rconPort,
                password: selectedServer.config.adminPassword,
            });

            if (response.success) {
                setIsConnected(true);
                toast.success('Connected to RCON');
                addToHistory('connect', 'Connected successfully', true);
                refreshPlayers();
            }
        } catch (error) {
            toast.error(`Failed to connect: ${error}`);
            addToHistory('connect', `Failed: ${error}`, false);
        } finally {
            setIsConnecting(false);
        }
    }, [selectedServer]);

    const disconnect = async () => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_disconnect', { serverId: selectedServerId });
            setIsConnected(false);
            setPlayers([]);
            toast.success('Disconnected from RCON');
            addToHistory('disconnect', 'Disconnected', true);
        } catch (error) {
            toast.error(`Failed to disconnect: ${error}`);
        }
    };

    const addToHistory = (cmd: string, response: string, success: boolean) => {
        setCommandHistory(prev => [...prev, {
            command: cmd,
            response,
            timestamp: new Date(),
            success,
        }]);
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
            addToHistory(cmdToSend, `Error: ${error}`, false);
        }
    };

    const refreshPlayers = async () => {
        if (!selectedServerId || !isConnected) return;

        try {
            const playerList = await invoke<RconPlayer[]>('rcon_get_players', {
                serverId: selectedServerId,
            });
            setPlayers(playerList);
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
            toast.success('Player kicked');
            refreshPlayers();
        } catch (error) {
            toast.error(`Failed to kick: ${error}`);
        }
    };

    const banPlayer = async (steamId: string) => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_ban_player', {
                serverId: selectedServerId,
                steamId,
            });
            toast.success('Player banned');
            refreshPlayers();
        } catch (error) {
            toast.error(`Failed to ban: ${error}`);
        }
    };

    const broadcastMessage = async () => {
        const message = prompt('Enter broadcast message:');
        if (!message || !selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_broadcast', {
                serverId: selectedServerId,
                message,
            });
            toast.success('Message broadcasted');
            addToHistory(`ServerChat ${message}`, 'Message sent', true);
        } catch (error) {
            toast.error(`Failed to broadcast: ${error}`);
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
                        RCON Console
                    </h1>
                    <p className="text-slate-400 mt-1">Remote server control and player management</p>
                </div>

                <div className="flex items-center gap-4">
                    <select
                        value={selectedServerId || ''}
                        onChange={(e) => {
                            setSelectedServerId(Number(e.target.value));
                            setIsConnected(false);
                            setPlayers([]);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                        {servers.map(server => (
                            <option key={server.id} value={server.id}>{server.name}</option>
                        ))}
                    </select>

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
                        {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
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
                                {qc.label}
                            </button>
                        ))}
                        <button
                            onClick={broadcastMessage}
                            disabled={!isConnected}
                            className="flex items-center gap-2 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded-lg text-sm text-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Broadcast
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
                                    ? 'Connected. Type a command and press Enter...'
                                    : 'Connect to a server to start sending RCON commands...'}
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
                            placeholder={isConnected ? "Enter RCON command..." : "Connect to send commands"}
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
                            Players ({players.length})
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
                                Connect to view players
                            </p>
                        ) : players.length === 0 ? (
                            <p className="text-slate-500 text-sm text-center py-8">
                                No players online
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
                                                title="Kick"
                                            >
                                                <UserX className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => banPlayer(player.steamId)}
                                                className="p-1.5 hover:bg-red-600/20 text-red-400 rounded transition-colors"
                                                title="Ban"
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
        </div>
    );
}
