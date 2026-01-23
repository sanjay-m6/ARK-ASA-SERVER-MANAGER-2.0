import React, { useState, useEffect, useRef } from 'react';
import { Send, Search, Download, Pause, Play, Trash2, Terminal, Users, Save, Radio, AlertTriangle, Info, Bug, RefreshCw } from 'lucide-react';
import { cn } from '../utils/helpers';
import { useServerStore } from '../stores/serverStore';
import { getAllServers, startLogWatcher } from '../utils/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';

interface LogEntry {
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'debug' | 'cfcore';
    message: string;
    raw: string;
}

interface ServerLogEvent {
    server_id: number;
    line: string;
    is_stderr: boolean;
}

const QUICK_COMMANDS = [
    { label: 'Save World', command: 'SaveWorld', icon: Save },
    { label: 'List Players', command: 'ListPlayers', icon: Users },
    { label: 'Broadcast', command: 'Broadcast ', icon: Radio },
    { label: 'Destroy Wild Dinos', command: 'DestroyWildDinos', icon: RefreshCw },
];

function parseLogLevel(line: string): 'info' | 'warning' | 'error' | 'debug' | 'cfcore' {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
        return 'error';
    }
    if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
        return 'warning';
    }
    if (lowerLine.includes('cfcore') || lowerLine.includes('curseforge')) {
        return 'cfcore';
    }
    if (lowerLine.includes('debug') || lowerLine.includes('verbose')) {
        return 'debug';
    }
    return 'info';
}

function parseTimestamp(line: string): string {
    // Try to extract timestamp from ARK log format: [2024.01.14-12.34.56:789]
    const match = line.match(/\[(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3})\]/);
    if (match) {
        return match[1].replace(/\./g, ':').replace('-', ' ');
    }
    return new Date().toLocaleTimeString();
}

export default function LogsConsole() {
    const { servers, setServers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [command, setCommand] = useState('');
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['info', 'warning', 'error', 'cfcore', 'debug']));
    const [autoScroll, setAutoScroll] = useState(true);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Load servers
    useEffect(() => {
        getAllServers().then(setServers).catch(console.error);
    }, [setServers]);

    // Auto-select first running server
    useEffect(() => {
        if (!selectedServerId && servers.length > 0) {
            const runningServer = servers.find(s => s.status === 'running');
            if (runningServer) {
                setSelectedServerId(runningServer.id);
            } else {
                setSelectedServerId(servers[0].id);
            }
        }
    }, [servers, selectedServerId]);

    // Subscribe to log events
    useEffect(() => {
        let unlisten: UnlistenFn | null = null;

        const setupListener = async () => {
            unlisten = await listen<ServerLogEvent>('server_log', (event) => {
                if (event.payload.server_id === selectedServerId) {
                    const line = event.payload.line;
                    const entry: LogEntry = {
                        timestamp: parseTimestamp(line),
                        level: parseLogLevel(line),
                        message: line.replace(/\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]\[\s*\d+\]/, '').trim(),
                        raw: line,
                    };
                    setLogs(prev => [...prev, entry].slice(-1000)); // Keep last 1000 lines
                }
            });
        };

        if (selectedServerId) {
            setupListener();
            // Start log watcher for selected server
            const server = servers.find(s => s.id === selectedServerId);
            if (server) {
                startLogWatcher(selectedServerId, server.installPath).catch(console.error);
            }
        }

        return () => { unlisten?.(); };
    }, [selectedServerId, servers]);

    // Auto-scroll effect
    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // Filter logs
    const filteredLogs = logs.filter(log => {
        if (!activeFilters.has(log.level)) return false;
        if (searchQuery && !log.raw.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Log stats
    const logStats = {
        info: logs.filter(l => l.level === 'info').length,
        warning: logs.filter(l => l.level === 'warning').length,
        error: logs.filter(l => l.level === 'error').length,
        cfcore: logs.filter(l => l.level === 'cfcore').length,
    };

    const toggleFilter = (level: string) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            if (next.has(level)) {
                next.delete(level);
            } else {
                next.add(level);
            }
            return next;
        });
    };

    const handleSendCommand = async () => {
        if (!command.trim() || !selectedServerId) return;

        try {
            const response = await invoke<{ success: boolean; message: string }>('rcon_send_command', {
                serverId: selectedServerId,
                command: command,
            });

            // Add command to history
            setCommandHistory(prev => [command, ...prev].slice(0, 50));
            setHistoryIndex(-1);

            // Add response to logs
            setLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                level: 'info',
                message: `[RCON] > ${command}`,
                raw: `[RCON] > ${command}`,
            }, {
                timestamp: new Date().toLocaleTimeString(),
                level: response.success ? 'info' : 'error',
                message: `[RCON] ${response.message}`,
                raw: `[RCON] ${response.message}`,
            }]);

            setCommand('');
            toast.success('Command sent');
        } catch (error) {
            toast.error(`RCON error: ${error}`);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSendCommand();
        } else if (e.key === 'ArrowUp' && commandHistory.length > 0) {
            e.preventDefault();
            const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
            setHistoryIndex(newIndex);
            setCommand(commandHistory[newIndex]);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const newIndex = Math.max(historyIndex - 1, -1);
            setHistoryIndex(newIndex);
            setCommand(newIndex === -1 ? '' : commandHistory[newIndex]);
        }
    };

    const exportLogs = () => {
        const content = logs.map(l => l.raw).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `server_logs_${selectedServerId}_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Logs exported');
    };

    const selectedServer = servers.find(s => s.id === selectedServerId);

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                        Logs Console
                    </h1>
                    <p className="text-slate-400 mt-1">Real-time server logs and RCON commands</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Server Selector */}
                    <select
                        value={selectedServerId || ''}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            setSelectedServerId(Number(e.target.value));
                            setLogs([]);
                        }}
                        className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        {servers.length === 0 ? (
                            <option value="">No servers</option>
                        ) : (
                            servers.map(server => (
                                <option key={server.id} value={server.id}>
                                    {server.name} {server.status === 'running' ? '🟢' : '⚫'}
                                </option>
                            ))
                        )}
                    </select>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                        placeholder="Search logs..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => toggleFilter('info')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                            activeFilters.has('info')
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                        )}
                    >
                        <Info className="w-3 h-3" />
                        Info ({logStats.info})
                    </button>
                    <button
                        onClick={() => toggleFilter('warning')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                            activeFilters.has('warning')
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                        )}
                    >
                        <AlertTriangle className="w-3 h-3" />
                        Warning ({logStats.warning})
                    </button>
                    <button
                        onClick={() => toggleFilter('error')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                            activeFilters.has('error')
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                        )}
                    >
                        <Bug className="w-3 h-3" />
                        Error ({logStats.error})
                    </button>
                    <button
                        onClick={() => toggleFilter('cfcore')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                            activeFilters.has('cfcore')
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                        )}
                    >
                        CFCore ({logStats.cfcore})
                    </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={cn(
                            'p-2 rounded-lg transition-all',
                            autoScroll
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-slate-800 text-slate-400'
                        )}
                        title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
                    >
                        {autoScroll ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => setLogs([])}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-all"
                        title="Clear logs"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={exportLogs}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-all"
                        title="Export logs"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Log Viewer */}
            <div
                ref={logContainerRef}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-sm overflow-y-auto min-h-[400px]"
            >
                {filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Terminal className="w-12 h-12 mb-3 opacity-50" />
                        <p>No logs yet. Start a server to see logs here.</p>
                        {selectedServer?.status !== 'running' && (
                            <p className="text-xs mt-2 text-slate-600">Selected server is not running</p>
                        )}
                    </div>
                ) : (
                    filteredLogs.map((log, index) => (
                        <div
                            key={index}
                            className={cn(
                                'py-1 px-2 rounded hover:bg-slate-900/50 transition-colors',
                                log.level === 'error' && 'bg-red-500/5',
                                log.level === 'warning' && 'bg-yellow-500/5'
                            )}
                        >
                            <span className="text-slate-600 text-xs">[{log.timestamp}]</span>
                            <span className={cn(
                                'ml-2 font-semibold text-xs',
                                log.level === 'info' && 'text-blue-400',
                                log.level === 'warning' && 'text-yellow-400',
                                log.level === 'error' && 'text-red-400',
                                log.level === 'cfcore' && 'text-cyan-400',
                                log.level === 'debug' && 'text-slate-500'
                            )}>
                                [{log.level.toUpperCase()}]
                            </span>
                            <span className="ml-2 text-slate-300">{log.message}</span>
                        </div>
                    ))
                )}
            </div>

            {/* RCON Panel */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Terminal className="w-4 h-4" />
                    <span>RCON Console</span>
                    {selectedServer?.status === 'running' && (
                        <span className="ml-auto flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Connected to {selectedServer.name}
                        </span>
                    )}
                </div>

                {/* Quick Commands */}
                <div className="flex items-center gap-2 flex-wrap">
                    {QUICK_COMMANDS.map((cmd) => (
                        <button
                            key={cmd.command}
                            onClick={() => setCommand(cmd.command)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-all border border-slate-700"
                        >
                            <cmd.icon className="w-3 h-3" />
                            {cmd.label}
                        </button>
                    ))}
                </div>

                {/* Command Input */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={command}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter RCON command... (↑↓ for history)"
                        disabled={selectedServer?.status !== 'running'}
                        className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                        onClick={handleSendCommand}
                        disabled={!command.trim() || selectedServer?.status !== 'running'}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-all font-medium"
                    >
                        <Send className="w-4 h-4" />
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
