import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Send,
    Search,
    Download,
    Pause,
    Play,
    Trash2,
    Terminal,
    Users,
    Save,
    Radio,
    AlertTriangle,
    Info,
    Bug,
    RefreshCw,
    Copy,
    Check,
    WrapText,
    Server,
    Sun,
    Activity,
    X,
    Layers,
    Clock,
    ChevronDown,
    ChevronUp,
    ShieldAlert
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { useServerStore } from '../stores/serverStore';
import { getAllServers, getServerLogs } from '../utils/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';

interface LogEntry {
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'debug' | 'cfcore' | 'rcon';
    source?: string;
    message: string;
    raw: string;
}

interface ServerLogEvent {
    server_id: number;
    line: string;
    is_stderr: boolean;
}

interface RconResponse {
    command: string;
    response: string;
    success: boolean;
    timestamp: string;
}

const QUICK_COMMANDS = [
    { label: 'Save World', command: 'SaveWorld', icon: Save, color: 'hover:border-emerald-500/50 hover:bg-emerald-500/10 text-emerald-400' },
    { label: 'List Players', command: 'ListPlayers', icon: Users, color: 'hover:border-blue-500/50 hover:bg-blue-500/10 text-blue-400' },
    { label: 'Broadcast', command: 'Broadcast Server announcement here...', icon: Radio, color: 'hover:border-purple-500/50 hover:bg-purple-500/10 text-purple-400' },
    { label: 'Destroy Wild Dinos', command: 'DestroyWildDinos', icon: RefreshCw, color: 'hover:border-amber-500/50 hover:bg-amber-500/10 text-amber-400' },
    { label: 'Set Day (12:00)', command: 'SetTimeOfDay 12:00', icon: Sun, color: 'hover:border-yellow-500/50 hover:bg-yellow-500/10 text-yellow-400' },
    { label: 'Do Exit (Save & Stop)', command: 'DoExit', icon: ShieldAlert, color: 'hover:border-rose-500/50 hover:bg-rose-500/10 text-rose-400' },
];

function parseLogLevel(line: string): 'info' | 'warning' | 'error' | 'debug' | 'cfcore' | 'rcon' {
    const lowerLine = line.toLowerCase();
    if (lowerLine.startsWith('[rcon]') || lowerLine.includes('rcon:')) {
        return 'rcon';
    }
    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception') || lowerLine.includes('fatal') || lowerLine.includes('crash')) {
        return 'error';
    }
    if (lowerLine.includes('warning') || lowerLine.includes('warn') || lowerLine.includes('not found') || lowerLine.includes('missing')) {
        return 'warning';
    }
    if (lowerLine.includes('cfcore') || lowerLine.includes('curseforge') || lowerLine.includes('mod')) {
        return 'cfcore';
    }
    if (lowerLine.includes('debug') || lowerLine.includes('verbose') || lowerLine.includes('trace')) {
        return 'debug';
    }
    return 'info';
}

function parseSource(line: string): string | undefined {
    const match = line.match(/\[([A-Za-z0-9_.-]+)\]/g);
    if (match && match.length > 0) {
        for (const token of match) {
            const inner = token.replace(/[[\]]/g, '');
            if (!['INFO', 'WARN', 'WARNING', 'ERROR', 'DEBUG', 'CFCORE'].includes(inner.toUpperCase()) && isNaN(Number(inner))) {
                return inner;
            }
        }
    }
    return undefined;
}

function parseTimestamp(line: string): string {
    const match = line.match(/\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):\d{3}\]/);
    if (match) {
        const [, , month, day, hour, min, sec] = match;
        return `${month}/${day} ${hour}:${min}:${sec}`;
    }
    const timeMatch = line.match(/\[(\d{2}\/\d{2},\s*\d{2}:\d{2}:\d{2})\]/);
    if (timeMatch) {
        return timeMatch[1];
    }
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export default function LogsConsole() {
    const { t } = useTranslation();
    const { servers, setServers, activeServer } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [command, setCommand] = useState('');
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['info', 'warning', 'error', 'cfcore', 'debug', 'rcon']));
    const [autoScroll, setAutoScroll] = useState(true);
    const [wordWrap, setWordWrap] = useState(true);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);
    const [isRconExpanded, setIsRconExpanded] = useState(true);
    const [latestRcon, setLatestRcon] = useState<RconResponse | null>(null);
    const [isExecutingRcon, setIsExecutingRcon] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Load servers
    useEffect(() => {
        getAllServers().then(setServers).catch(console.error);
    }, [setServers]);

    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
            setLogs([]);
        }
    }, [activeServer]);

    const serversRef = useRef(servers);
    useEffect(() => { serversRef.current = servers; }, [servers]);

    const selectedServer = useMemo(() => {
        return servers.find(s => s.id === selectedServerId) || activeServer || null;
    }, [servers, selectedServerId, activeServer]);

    // Subscribe to log events
    useEffect(() => {
        let unlisten: UnlistenFn | null = null;
        let cancelled = false;

        const setupListener = async () => {
            unlisten = await listen<ServerLogEvent>('server_log', (event) => {
                if (event.payload.server_id === selectedServerId) {
                    const line = event.payload.line;
                    const entry: LogEntry = {
                        timestamp: parseTimestamp(line),
                        level: parseLogLevel(line),
                        source: parseSource(line),
                        message: line.replace(/\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]\[\s*\d+\]/, '').trim(),
                        raw: line,
                    };
                    setLogs(prev => [...prev, entry].slice(-2500));
                }
            });
        };

        if (selectedServerId) {
            setLogs([]);
            setupListener();
            const server = serversRef.current.find(s => s.id === selectedServerId);
            if (server) {
                getServerLogs(selectedServerId, server.installPath)
                    .then(history => {
                        if (cancelled) return;
                        const entries: LogEntry[] = history.map((h: any) => {
                            const line = h.line;
                            return {
                                timestamp: parseTimestamp(line),
                                level: parseLogLevel(line),
                                source: parseSource(line),
                                message: line.replace(/\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]\[\s*\d+\]/, '').trim(),
                                raw: line,
                            };
                        });
                        setLogs(prev => {
                            const existingRaws = new Set(prev.map(p => p.raw));
                            const uniqueHistory = entries.filter(e => !existingRaws.has(e.raw));
                            return [...uniqueHistory, ...prev].slice(-2500);
                        });
                    })
                    .catch(console.error);
            }
        }

        return () => { cancelled = true; unlisten?.(); };
    }, [selectedServerId]);

    // Auto-scroll effect
    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // Filter logs
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (!activeFilters.has(log.level)) return false;
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                return log.raw.toLowerCase().includes(query) || log.message.toLowerCase().includes(query);
            }
            return true;
        });
    }, [logs, activeFilters, searchQuery]);

    // Log stats
    const logStats = useMemo(() => ({
        total: logs.length,
        info: logs.filter(l => l.level === 'info').length,
        warning: logs.filter(l => l.level === 'warning').length,
        error: logs.filter(l => l.level === 'error').length,
        cfcore: logs.filter(l => l.level === 'cfcore').length,
        rcon: logs.filter(l => l.level === 'rcon').length,
    }), [logs]);

    const toggleFilter = (level: string) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            if (next.has(level)) {
                // Keep at least one filter active
                if (next.size > 1) next.delete(level);
            } else {
                next.add(level);
            }
            return next;
        });
    };

    const handleCopyLine = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1500);
        toast.success(t('logs.lineCopied', 'Copied line to clipboard'), { id: 'copy-line' });
    };

    const handleCopyAll = () => {
        if (filteredLogs.length === 0) return;
        const fullContent = filteredLogs.map(l => l.raw).join('\n');
        navigator.clipboard.writeText(fullContent);
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
        toast.success(t('logs.allCopied', 'Copied {{count}} log entries to clipboard', { count: filteredLogs.length }), { id: 'copy-all' });
    };

    const handleSendCommand = async (cmdToSend?: string) => {
        const finalCmd = (cmdToSend || command).trim();
        if (!finalCmd || !selectedServerId) return;

        setIsExecutingRcon(true);
        const execTime = new Date().toLocaleTimeString();

        try {
            const response = await invoke<{ success: boolean; message: string }>('rcon_send_command', {
                serverId: selectedServerId,
                command: finalCmd,
            });

            setCommandHistory(prev => [finalCmd, ...prev.filter(c => c !== finalCmd)].slice(0, 50));
            setHistoryIndex(-1);

            const rconResult: RconResponse = {
                command: finalCmd,
                response: response.message || (response.success ? 'Command executed successfully' : 'Execution failed with no output'),
                success: response.success,
                timestamp: execTime,
            };
            setLatestRcon(rconResult);

            // Add response into live stream
            setLogs(prev => [
                ...prev,
                {
                    timestamp: execTime,
                    level: 'rcon',
                    source: 'RCON',
                    message: `> ${finalCmd}`,
                    raw: `[RCON] > ${finalCmd}`,
                },
                {
                    timestamp: execTime,
                    level: response.success ? 'info' : 'error',
                    source: 'RCON',
                    message: response.message || (response.success ? 'Success' : 'Failed'),
                    raw: `[RCON Response] ${response.message}`,
                }
            ]);

            if (!cmdToSend) setCommand('');
            if (response.success) {
                toast.success(t('logs.commandSuccess', 'RCON: {{cmd}} executed', { cmd: finalCmd }));
            } else {
                toast.error(t('logs.commandFailed', 'RCON Error: {{msg}}', { msg: response.message }));
            }
        } catch (error) {
            const errorMsg = String(error);
            setLatestRcon({
                command: finalCmd,
                response: errorMsg,
                success: false,
                timestamp: execTime,
            });
            toast.error(t('logs.rconError', 'RCON Connection Error: {{error}}', { error: errorMsg }));
        } finally {
            setIsExecutingRcon(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
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
        if (logs.length === 0) {
            toast.error(t('logs.noLogsToExport', 'No logs available to export'));
            return;
        }
        const content = logs.map(l => l.raw).join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const serverName = selectedServer?.name ? selectedServer.name.replace(/[^a-z0-9_-]/gi, '_') : 'server';
        a.download = `${serverName}_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('logs.exportSuccess', 'Server log file downloaded successfully'));
    };

    const isServerOnline = selectedServer?.status === 'running' || selectedServer?.status === 'online';

    return (
        <div className="space-y-4 h-full flex flex-col max-w-[1600px] mx-auto pb-2">
            {/* Header & Server Status Card */}
            <div className="glass-panel p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-white/5 bg-slate-900/60 backdrop-blur-md shadow-xl">
                <div className="flex items-center gap-3.5">
                    <div className="relative">
                        <div className="p-3 bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 shadow-inner">
                            <Terminal className="w-6 h-6 animate-pulse" />
                        </div>
                        {isServerOnline && (
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900"></span>
                            </span>
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                                {t('logs.title', 'Logs & RCON Console')}
                            </h1>
                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Activity className="w-3 h-3" />
                                {autoScroll ? t('logs.liveStreaming', 'LIVE STREAM') : t('logs.streamPaused', 'PAUSED')}
                            </div>
                        </div>
                        <p className="text-slate-400 text-xs sm:text-sm mt-0.5 flex items-center gap-2">
                            <span>{t('logs.realTimeLogs', 'Real-time Unreal Engine 5 log output and direct RCON terminal')}</span>
                        </p>
                    </div>
                </div>

                {/* Server Selector & Metrics */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end flex-wrap">
                    {servers.length > 1 && (
                        <div className="relative min-w-[200px]">
                            <select
                                value={selectedServerId || ''}
                                onChange={(e) => setSelectedServerId(Number(e.target.value))}
                                className="w-full pl-3 pr-8 py-2 bg-slate-800/90 border border-slate-700/80 rounded-xl text-xs sm:text-sm font-medium text-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer shadow-sm"
                            >
                                {servers.map(s => (
                                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                                        {s.name} ({s.config?.mapName || 'Map'} - Port {s.ports?.gamePort || '7777'})
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    )}

                    {selectedServer && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-xs text-slate-300">
                            <Server className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="font-semibold text-white truncate max-w-[140px]">{selectedServer.name}</span>
                            <span className="text-slate-500">•</span>
                            <span className={cn(
                                "font-medium capitalize",
                                isServerOnline ? "text-emerald-400" : "text-slate-400"
                            )}>
                                {selectedServer.status || 'Offline'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Smart Toolbar */}
            {/* Smart Toolbar */}
            <div className="glass-panel p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 border border-white/5 bg-slate-900/60 shadow-lg">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('logs.searchLogs', 'Search logs...')}
                        className="w-full pl-9 pr-8 py-2 bg-slate-950/80 border border-slate-700/70 rounded-xl text-white text-xs sm:text-sm font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all shadow-inner"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={() => toggleFilter('info')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shrink-0 cursor-pointer select-none',
                            activeFilters.has('info')
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-sm shadow-blue-500/10'
                                : 'bg-slate-950/40 text-slate-500 border-slate-800/80 hover:text-slate-300 hover:border-slate-700'
                        )}
                    >
                        <Info className="w-3.5 h-3.5 text-blue-400" />
                        <span>INFO</span>
                        <span className="px-1.5 py-0.5 bg-blue-500/20 rounded-md text-[10px] font-mono leading-none">{logStats.info}</span>
                    </button>

                    <button
                        onClick={() => toggleFilter('warning')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shrink-0 cursor-pointer select-none',
                            activeFilters.has('warning')
                                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 shadow-sm shadow-yellow-500/10'
                                : 'bg-slate-950/40 text-slate-500 border-slate-800/80 hover:text-slate-300 hover:border-slate-700'
                        )}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                        <span>WARN</span>
                        <span className="px-1.5 py-0.5 bg-yellow-500/20 rounded-md text-[10px] font-mono leading-none">{logStats.warning}</span>
                    </button>

                    <button
                        onClick={() => toggleFilter('error')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shrink-0 cursor-pointer select-none',
                            activeFilters.has('error')
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-sm shadow-rose-500/10'
                                : 'bg-slate-950/40 text-slate-500 border-slate-800/80 hover:text-slate-300 hover:border-slate-700'
                        )}
                    >
                        <Bug className="w-3.5 h-3.5 text-rose-400" />
                        <span>ERROR</span>
                        <span className="px-1.5 py-0.5 bg-rose-500/20 rounded-md text-[10px] font-mono leading-none">{logStats.error}</span>
                    </button>

                    <button
                        onClick={() => toggleFilter('cfcore')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shrink-0 cursor-pointer select-none',
                            activeFilters.has('cfcore')
                                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                                : 'bg-slate-950/40 text-slate-500 border-slate-800/80 hover:text-slate-300 hover:border-slate-700'
                        )}
                    >
                        <Layers className="w-3.5 h-3.5 text-cyan-400" />
                        <span>MODS</span>
                        <span className="px-1.5 py-0.5 bg-cyan-500/20 rounded-md text-[10px] font-mono leading-none">{logStats.cfcore}</span>
                    </button>

                    <button
                        onClick={() => toggleFilter('rcon')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shrink-0 cursor-pointer select-none',
                            activeFilters.has('rcon')
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                                : 'bg-slate-950/40 text-slate-500 border-slate-800/80 hover:text-slate-300 hover:border-slate-700'
                        )}
                    >
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        <span>RCON</span>
                        <span className="px-1.5 py-0.5 bg-emerald-500/20 rounded-md text-[10px] font-mono leading-none">{logStats.rcon}</span>
                    </button>
                </div>

                {/* Console Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={() => setWordWrap(!wordWrap)}
                        className={cn(
                            'px-3 py-1.5 rounded-xl transition-all border text-xs font-medium flex items-center gap-1.5 cursor-pointer select-none',
                            wordWrap
                                ? 'bg-slate-800 text-white border-slate-600 shadow-sm'
                                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                        )}
                        title={wordWrap ? t('logs.disableWordWrap', 'Disable Word Wrap') : t('logs.enableWordWrap', 'Enable Word Wrap')}
                    >
                        <WrapText className="w-3.5 h-3.5 text-slate-300" />
                        <span>{wordWrap ? 'Wrap' : 'No Wrap'}</span>
                    </button>

                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={cn(
                            'px-3 py-1.5 rounded-xl transition-all border text-xs font-medium flex items-center gap-1.5 cursor-pointer select-none',
                            autoScroll
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm shadow-amber-500/10'
                        )}
                        title={autoScroll ? t('logs.pauseAutoScroll', 'Pause auto-scroll') : t('logs.resumeAutoScroll', 'Resume auto-scroll')}
                    >
                        {autoScroll ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{autoScroll ? 'Auto-Scroll' : 'Paused'}</span>
                    </button>

                    <button
                        onClick={handleCopyAll}
                        className="px-3 py-1.5 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 rounded-xl transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer select-none shadow-sm"
                        title={t('logs.copyAllLogs', 'Copy all logs to clipboard')}
                    >
                        {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{copiedAll ? 'Copied!' : 'Copy'}</span>
                    </button>

                    <button
                        onClick={() => {
                            setLogs([]);
                            toast.success(t('logs.cleared', 'Console cleared'));
                        }}
                        className="p-2 bg-slate-950/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 rounded-xl transition-all text-xs cursor-pointer select-none shadow-sm"
                        title={t('logs.clearLogs', 'Clear logs')}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                        onClick={exportLogs}
                        className="px-3 py-1.5 bg-slate-950/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/40 rounded-xl transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer select-none shadow-sm"
                        title={t('logs.exportLogs', 'Download log file')}
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t('logs.export', 'Export')}</span>
                    </button>
                </div>
            </div>

            {/* High-Performance Log Stream Terminal */}
            <div className="flex-1 flex flex-col min-h-[380px] bg-slate-950/95 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl relative font-mono">
                {/* Terminal Window Header Bar */}
                <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 select-none">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                        </div>
                        <span className="ml-2 font-semibold text-slate-300">ShooterGame.log</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-[11px] text-slate-500 font-sans">
                            {filteredLogs.length} / {logs.length} {t('logs.entries', 'entries')}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                        {searchQuery && (
                            <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {filteredLogs.length} matches
                            </span>
                        )}
                        <span className="text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date().toLocaleTimeString()}
                        </span>
                    </div>
                </div>

                {/* Log Lines Container */}
                <div
                    ref={logContainerRef}
                    className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-0.5 text-xs sm:text-[13px] leading-relaxed selection:bg-emerald-500/30 selection:text-white"
                >
                    {filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-16 text-center text-slate-500 select-none">
                            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 mb-4 shadow-xl">
                                <Terminal className="w-10 h-10 text-slate-600 animate-pulse" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-300">
                                {searchQuery ? t('logs.noSearchResults', 'No logs matching current query') : t('logs.waitingForLogs', 'Awaiting Server Output')}
                            </h3>
                            <p className="text-xs text-slate-500 max-w-md mt-1.5 font-sans">
                                {searchQuery
                                    ? t('logs.clearQueryHint', 'Try adjusting your search keywords or active log level filters.')
                                    : t('logs.startServerHint', 'Logs will stream here automatically once the server begins startup and writes to ShooterGame.log.')}
                            </p>
                        </div>
                    ) : (
                        filteredLogs.map((log, index) => {
                            const isSearchMatch = searchQuery && log.raw.toLowerCase().includes(searchQuery.toLowerCase());

                            return (
                                <div
                                    key={index}
                                    className={cn(
                                        'group flex items-start gap-2 py-0.5 px-2 rounded hover:bg-slate-900/80 transition-colors relative',
                                        wordWrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto',
                                        log.level === 'error' && 'bg-rose-500/5 text-rose-300',
                                        log.level === 'warning' && 'bg-amber-500/5 text-amber-200',
                                        log.level === 'cfcore' && 'bg-cyan-500/5 text-cyan-200',
                                        log.level === 'rcon' && 'bg-emerald-500/5 text-emerald-300',
                                        isSearchMatch && 'ring-1 ring-amber-500/30 bg-amber-500/10'
                                    )}
                                >
                                    {/* Line Number */}
                                    <span className="text-slate-700 select-none text-[10px] w-7 shrink-0 text-right font-mono opacity-60 group-hover:opacity-100">
                                        {index + 1}
                                    </span>

                                    {/* Timestamp */}
                                    <span className="text-slate-500 text-[11px] shrink-0 select-none font-mono">
                                        [{log.timestamp}]
                                    </span>

                                    {/* Log Level Badge */}
                                    <span className={cn(
                                        'font-bold text-[10px] px-1.5 py-0.2 rounded shrink-0 uppercase select-none',
                                        log.level === 'info' && 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
                                        log.level === 'warning' && 'bg-amber-500/15 text-amber-400 border border-yellow-500/20',
                                        log.level === 'error' && 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-extrabold',
                                        log.level === 'cfcore' && 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20',
                                        log.level === 'debug' && 'bg-slate-800 text-slate-400 border border-slate-700',
                                        log.level === 'rcon' && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    )}>
                                        {log.level}
                                    </span>

                                    {/* Optional Source Tag */}
                                    {log.source && (
                                        <span className="text-purple-400/90 bg-purple-500/10 px-1 py-0.2 rounded text-[10px] border border-purple-500/20 shrink-0 select-none">
                                            [{log.source}]
                                        </span>
                                    )}

                                    {/* Message Body */}
                                    <span className={cn(
                                        "flex-1 font-mono tracking-tight",
                                        log.level === 'info' && 'text-slate-200',
                                        log.level === 'warning' && 'text-amber-100',
                                        log.level === 'error' && 'text-rose-200 font-medium',
                                        log.level === 'cfcore' && 'text-cyan-100',
                                        log.level === 'debug' && 'text-slate-400',
                                        log.level === 'rcon' && 'text-emerald-200'
                                    )}>
                                        {log.message}
                                    </span>

                                    {/* Line Copy Action on Hover */}
                                    <button
                                        onClick={() => handleCopyLine(log.raw, index)}
                                        className="opacity-0 group-hover:opacity-100 p-1 bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-opacity shrink-0 select-none"
                                        title={t('logs.copyThisLine', 'Copy line')}
                                    >
                                        {copiedIndex === index ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* RCON Console & Command Suite */}
            <div className="glass-panel rounded-2xl border border-white/5 bg-slate-900/70 shadow-xl overflow-hidden">
                {/* RCON Header */}
                <div
                    onClick={() => setIsRconExpanded(!isRconExpanded)}
                    className="p-3 sm:px-4 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between cursor-pointer select-none hover:bg-slate-800/50 transition-colors"
                >
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                            <Terminal className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-sm text-white">{t('logs.rconSuite', 'RCON Admin Terminal')}</span>
                        {selectedServer && (
                            <span className="text-xs text-slate-400 flex items-center gap-1.5 ml-2">
                                <span className={cn("w-2 h-2 rounded-full", isServerOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-600")} />
                                <span>{selectedServer.name} (Port {selectedServer.ports?.rconPort || '27020'})</span>
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {isExecutingRcon && (
                            <span className="text-xs text-emerald-400 flex items-center gap-1 animate-pulse">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                Executing...
                            </span>
                        )}
                        <button className="p-1 text-slate-400 hover:text-white">
                            {isRconExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {isRconExpanded && (
                    <div className="p-3 sm:p-4 space-y-3">
                        {/* Quick Command Chips */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-400 mr-1 select-none flex items-center gap-1">
                                <Radio className="w-3 h-3 text-cyan-400" />
                                Quick Actions:
                            </span>
                            {QUICK_COMMANDS.map((cmd) => (
                                <button
                                    key={cmd.command}
                                    onClick={() => {
                                        if (cmd.command.includes('...')) {
                                            setCommand('Broadcast ');
                                        } else {
                                            handleSendCommand(cmd.command);
                                        }
                                    }}
                                    disabled={!isServerOnline || isExecutingRcon}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-all border border-slate-700/70 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                                        cmd.color
                                    )}
                                >
                                    <cmd.icon className="w-3.5 h-3.5" />
                                    <span>{cmd.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Latest Response Card (if present) */}
                        {latestRcon && (
                            <div className={cn(
                                "p-2.5 rounded-xl border text-xs font-mono flex items-start gap-2.5 animate-in fade-in duration-200",
                                latestRcon.success
                                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                                    : "bg-rose-950/30 border-rose-500/30 text-rose-300"
                            )}>
                                <span className="font-bold shrink-0">[{latestRcon.timestamp}] &gt; {latestRcon.command}:</span>
                                <span className="flex-1 select-text">{latestRcon.response}</span>
                                <button onClick={() => setLatestRcon(null)} className="text-slate-400 hover:text-white shrink-0">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {/* Command Input Dock */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-emerald-400 font-bold select-none text-sm">
                                    &gt;_
                                </span>
                                <input
                                    type="text"
                                    value={command}
                                    onChange={(e) => setCommand(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={isServerOnline ? t('logs.enterCommandPlaceholder', 'Enter RCON command... (Press ↑ / ↓ for history, Enter to send)') : t('logs.serverOfflinePlaceholder', 'Server must be running to send RCON commands')}
                                    disabled={!isServerOnline || isExecutingRcon}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/90 border border-slate-700/80 rounded-xl text-white font-mono text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed shadow-inner"
                                />
                            </div>

                            <button
                                onClick={() => handleSendCommand()}
                                disabled={!command.trim() || !isServerOnline || isExecutingRcon}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl transition-all font-semibold text-xs sm:text-sm shadow-md shadow-emerald-950/50 shrink-0"
                            >
                                <Send className="w-4 h-4" />
                                <span>{t('logs.send', 'Send')}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
