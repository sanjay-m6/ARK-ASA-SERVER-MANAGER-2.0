import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Terminal as TerminalIcon,
  Send,
  Zap,
  Save,
  Skull,
  Megaphone,
  Trash2,
  MessageSquare,
  AlertCircle,
  Users,
  Ban,
  XCircle,
  Layers,
  Search,
  Play,
  Database,
  ShieldCheck,
  Eye,
  EyeOff,
  Check,
  Pause,
  History,
  RefreshCw
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { connectAseRcon, sendAseRcon } from '../utils/aseCommands';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface LogEntry {
  type: 'cmd' | 'response' | 'error';
  text: string;
  time: string;
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
  { label: 'Save World', cmd: 'saveworld', icon: Save, color: 'text-emerald-400 border-emerald-500/25 bg-emerald-950/20' },
  { label: 'Dino Wipe', cmd: 'destroywilddinos', icon: Skull, color: 'text-rose-400 border-rose-500/25 bg-rose-950/20' },
  { label: 'Broadcast', cmd: 'broadcast ', icon: Megaphone, color: 'text-amber-400 border-amber-500/25 bg-amber-950/20' },
  { label: 'Server Chat', cmd: 'serverchat ', icon: MessageSquare, color: 'text-blue-400 border-blue-500/25 bg-blue-950/20' },
  { label: 'List Players', cmd: 'listplayers', icon: TerminalIcon, color: 'text-slate-400 border-slate-700/50 bg-slate-900/50' },
];

const AUTOCOMPLETE_COMMANDS = [
  { command: 'saveworld', desc: 'Saves the current world state.' },
  { command: 'listplayers', desc: 'Lists connected survivor accounts.' },
  { command: 'broadcast', desc: 'Sends an on-screen broadcast message.' },
  { command: 'destroywilddinos', desc: 'Kills all wild dinos immediately.' },
  { command: 'kickplayer', desc: 'Kicks survivor from server.' },
  { command: 'banplayer', desc: 'Bans survivor account.' },
  { command: 'unbanplayer', desc: 'Unbans survivor account.' },
  { command: 'getchat', desc: 'Gets recent in-game chat lines.' },
  { command: 'settimeofday', desc: 'Changes current game time.' },
  { command: 'doexit', desc: 'Closes the server instantly.' },
  { command: 'serverchat', desc: 'Sends global system chat text.' },
  { command: 'showmotd', desc: 'Displays MOTD manually.' }
];

export default function ASERconConsole() {
  const { servers } = useAseServerStore();
  const [selectedServerId, setSelectedServerId] = useState<number | null>(servers[0]?.id || null);
  
  // Tab control: terminal, log_stream, cluster, save_manager
  const [activeTab, setActiveTab] = useState<'terminal' | 'log_stream' | 'cluster' | 'save_manager'>('terminal');

  const [command, setCommand] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);
  const logFeedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Player Management State
  const [players, setPlayers] = useState<{name: string, steamId: string}[]>([]);
  const [showPlayers, setShowPlayers] = useState(true);
  const playersInterval = useRef<any>(null);

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

  useEffect(() => { 
    if (logRef.current && activeTab === 'terminal') {
      logRef.current.scrollTop = logRef.current.scrollHeight; 
    }
  }, [log, activeTab]);

  useEffect(() => {
    if (logFeedRef.current && autoScrollLogs && activeTab === 'log_stream') {
      logFeedRef.current.scrollTop = logFeedRef.current.scrollHeight;
    }
  }, [logStream, autoScrollLogs, activeTab]);

  // Sync cluster target selection defaults
  useEffect(() => {
    if (servers.length > 0 && clusterSelectedServers.length === 0) {
      setClusterSelectedServers(servers.map(s => s.id));
    }
  }, [servers, clusterSelectedServers.length]);

  const mappedServers = useMemo(() => servers.map(s => ({
    id: s.id,
    name: s.name,
    mapName: s.mapName,
    status: s.status
  })), [servers]);

  const selectedServerObj = useMemo(() => servers.find(s => s.id === selectedServerId), [servers, selectedServerId]);

  useEffect(() => {
    if (isConnected && showPlayers && selectedServerId) {
      refreshPlayers();
      playersInterval.current = setInterval(refreshPlayers, 15000);
    } else if (playersInterval.current) {
      clearInterval(playersInterval.current);
    }
    return () => { if (playersInterval.current) clearInterval(playersInterval.current); };
  }, [isConnected, showPlayers, selectedServerId]);

  // Start/Stop log streaming for ASE server via Tauri when streaming active
  useEffect(() => {
    if (isStreamingLogs && selectedServerId) {
      invoke('start_log_stream', { serverId: selectedServerId })
        .then(() => console.log(`[ASE RCON] Log stream started for server #${selectedServerId}`))
        .catch(err => console.error('Error starting backend log stream:', err));
        
      return () => {
        invoke('stop_log_stream', { serverId: selectedServerId })
          .then(() => console.log(`[ASE RCON] Log stream stopped for server #${selectedServerId}`))
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
              return next.slice(-1000); // Buffer limit
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

  const parsePlayers = (response: string) => {
    if (response.toLowerCase().includes('no players')) {
      setPlayers([]);
      return;
    }
    const lines = response.split('\n');
    const parsed = [];
    for (const line of lines) {
      const match = line.match(/\d+\.\s+(.+),\s+(\d+)/);
      if (match) {
        parsed.push({ name: match[1].trim(), steamId: match[2].trim() });
      }
    }
    if (parsed.length > 0 || lines.length > 1) {
      setPlayers(parsed);
    }
  };

  const refreshPlayers = async () => {
    if (!selectedServerId) return;
    try {
      const resp = await sendAseRcon(selectedServerId, 'listplayers');
      if (resp) parsePlayers(resp);
    } catch (e) {
      // Silently fail auto-refresh
    }
  };

  const addLog = (entry: LogEntry) => setLog(prev => [...prev, entry]);
  const now = () => new Date().toLocaleTimeString();

  const handleConnect = async () => {
    if (!selectedServerId) return;
    setIsConnecting(true);
    try { 
      await connectAseRcon(selectedServerId); 
      setIsConnected(true); 
      addLog({ type: 'response', text: 'Connected to RCON. Authenticated successfully.', time: now() }); 
      toast.success('RCON connected'); 
      refreshPlayers();
    } catch (e) { 
      addLog({ type: 'error', text: `Connection failed: ${e}`, time: now() }); 
      toast.error(`${e}`); 
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsStreamingLogs(false);
    setLogStream([]);
    addLog({ type: 'error', text: 'Disconnected from RCON.', time: now() });
  };

  const handleSend = async (cmdString?: string) => {
    const cmd = cmdString || command.trim();
    if (!selectedServerId || !cmd) return;
    
    if (!cmdString) {
      setCommand(''); 
      setHistory(prev => [cmd, ...prev]); 
      setHistIdx(-1);
    }
    addLog({ type: 'cmd', text: cmd, time: now() });
    
    try { 
      const resp = await sendAseRcon(selectedServerId, cmd); 
      addLog({ type: 'response', text: resp || '(no response)', time: now() });
      if (cmd.toLowerCase() === 'listplayers' && resp) {
        parsePlayers(resp);
      }
    } catch (e) { 
      addLog({ type: 'error', text: `${e}`, time: now() }); 
      setIsConnected(false);
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
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const idx = Math.min(histIdx + 1, history.length - 1); 
        setHistIdx(idx); 
        setCommand(history[idx]); 
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx > 0) {
        const idx = histIdx - 1;
        setHistIdx(idx);
        setCommand(history[idx]);
      } else if (histIdx === 0) {
        setHistIdx(-1);
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
      toast.success('Cluster commands execution complete');
    } catch (error) {
      console.error('Cluster execution failed:', error);
      toast.error(`Cluster execution failed: ${error}`);
    } finally {
      setClusterIsExecuting(false);
    }
  };

  // Trigger manual save with verification
  const triggerManualSave = async () => {
    if (!selectedServerId || !isConnected) {
      toast.error('Must be connected to run saves.');
      return;
    }

    setSaveProgressState('sending');
    setSaveValidationResult(null);

    try {
      // Step 1: Send saveworld command
      await sendAseRcon(selectedServerId, 'saveworld');
      
      // Step 2: Waiting for server disk sync (3 seconds delay to let engine flush stream)
      setSaveProgressState('syncing');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 3: Verifying filesystem integrity
      setSaveProgressState('verifying');
      const validationInfo = await invoke<SaveValidationInfo>('rcon_validate_save', { serverId: selectedServerId });
      
      setSaveValidationResult(validationInfo);
      
      if (validationInfo.exists && validationInfo.integrity_ok) {
        setSaveProgressState('success');
        toast.success('World save successfully verified!');
        
        setSaveValidationHistory(prev => [
          {
            serverId: selectedServerId,
            serverName: selectedServerObj?.name || `Server #${selectedServerId}`,
            timestamp: new Date(),
            info: validationInfo
          },
          ...prev
        ]);
      } else {
        setSaveProgressState('error');
        toast.error(validationInfo.error_message || 'Save file verification failed.');
      }
    } catch (error) {
      console.error('Manual save failed:', error);
      setSaveProgressState('error');
      toast.error(`Manual save failed: ${error}`);
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

  return (
    <motion.div className="space-y-6 select-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      
      {/* Header section with layout adjustments */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/30 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl">
              <TerminalIcon className="w-6 h-6 text-amber-400" />
            </div>
            ASE RCON Console
          </h1>
          <p className="text-sm text-slate-400 mt-1">Live remote administration and server telemetry</p>
        </div>
        
        <div className="flex items-center gap-3">
          {servers.length > 0 && (
            <ServerSelect
              value={selectedServerId}
              onChange={val => {
                setSelectedServerId(val);
                setIsConnected(false);
                setLog([]);
                setIsStreamingLogs(false);
                setLogStream([]);
              }}
              servers={mappedServers}
              accentColor="amber"
            />
          )}
          
          <button 
            onClick={isConnected ? handleDisconnect : handleConnect} 
            disabled={(isConnecting && !isConnected) || !selectedServerId} 
            className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 focus:outline-none flex items-center gap-2 h-[42px] cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
              isConnected 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 shadow-lg shadow-emerald-500/5' 
                : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-slate-950 shadow-lg shadow-amber-500/20'
            }`}
          >
            {isConnecting ? (
              <><Zap className="w-4 h-4 animate-pulse" /> Connecting...</>
            ) : isConnected ? (
              <><Zap className="w-4 h-4" /> Connected</>
            ) : (
              <><TerminalIcon className="w-4 h-4" /> Connect</>
            )}
          </button>
        </div>
      </div>

      {/* Navigation tabs matching existing theme */}
      <div className="flex border-b border-white/5 bg-slate-950/50 p-1.5 rounded-xl gap-1 max-w-fit">
        <button
          onClick={() => setActiveTab('terminal')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
            activeTab === 'terminal' 
              ? "bg-slate-800/80 text-amber-400 shadow-sm border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <TerminalIcon className="w-4 h-4" />
          <span>Interactive Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('log_stream')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 relative",
            activeTab === 'log_stream' 
              ? "bg-slate-800/80 text-amber-400 shadow-sm border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Eye className="w-4 h-4" />
          <span>Live Log Feed</span>
          {isStreamingLogs && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('cluster')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
            activeTab === 'cluster' 
              ? "bg-slate-800/80 text-amber-400 shadow-sm border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Layers className="w-4 h-4" />
          <span>Cluster Deck</span>
        </button>

        <button
          onClick={() => setActiveTab('save_manager')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
            activeTab === 'save_manager' 
              ? "bg-slate-800/80 text-amber-400 shadow-sm border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Save className="w-4 h-4" />
          <span>Verified Saves</span>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Main Content Pane */}
        <div className="flex-1 glass-panel rounded-2xl p-5 border border-white/5 shadow-xl relative overflow-visible flex flex-col min-h-[500px]">
          
          {/* Glow effect at top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>

          {/* TAB 1: TERMINAL */}
          {activeTab === 'terminal' && (
            <div className="flex-1 flex flex-col h-full">
              {/* Quick Actions Bar */}
              <div className="flex gap-2 flex-wrap mb-4 pb-4 border-b border-white/5">
                {QUICK_COMMANDS.map(q => { 
                  const Icon = q.icon; 
                  return (
                    <button 
                      key={q.label} 
                      onClick={() => handleSend(q.cmd)} 
                      disabled={!isConnected}
                      className={cn(
                        "px-4 py-2 border rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                        q.color
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {q.label}
                    </button>
                  ); 
                })}
                <button 
                  onClick={() => setShowPlayers(!showPlayers)} 
                  disabled={!isConnected}
                  className={cn(
                    "px-4 py-2 ml-auto border rounded-xl text-xs font-semibold flex items-center gap-2 transition-all focus:outline-none",
                    showPlayers ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-slate-900 border-white/5 text-slate-300 hover:text-white"
                  )}
                >
                  <Users className="w-4 h-4" />
                  Players ({players.length})
                </button>
                <button 
                  onClick={() => setLog([])} 
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/10 rounded-xl text-xs font-semibold text-rose-400 flex items-center gap-2 transition-all focus:outline-none active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
              </div>

              {/* Console output shell scroll block */}
              <div ref={logRef} className="flex-1 overflow-y-auto font-mono text-[13px] space-y-2 mb-4 max-h-[320px] bg-slate-950 p-4 rounded-xl border border-white/5 shadow-inner">
                <AnimatePresence initial={false}>
                  {log.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center h-full text-slate-500 py-12"
                    >
                      <TerminalIcon className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-xs">Connect to RCON and begin transmitting commands.</p>
                      {!isConnected && <p className="text-[10px] mt-2 opacity-60">Status: Disconnected</p>}
                    </motion.div>
                  ) : (
                    log.map((entry, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                        className={`py-2 px-3 rounded-lg flex items-start gap-3 border text-xs font-sans ${
                          entry.type === 'cmd' 
                            ? 'text-amber-300 bg-amber-500/5 border-amber-500/10' 
                            : entry.type === 'error' 
                              ? 'text-rose-400 bg-rose-500/10 border-rose-500/10' 
                              : 'text-slate-300 hover:bg-white/[0.02] bg-slate-900/10 border-white/5'
                        }`}
                      >
                        <span className="text-slate-600 shrink-0 select-none text-[10px] font-mono">[{entry.time}]</span>
                        <div className="flex-1 break-words whitespace-pre-wrap font-sans leading-relaxed">
                          {entry.type === 'cmd' && <span className="text-amber-500/50 mr-2 select-none font-mono">❯</span>}
                          {entry.type === 'error' && <AlertCircle className="w-4 h-4 inline mr-2 align-text-bottom text-rose-500" />}
                          {entry.text}
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Autocomplete Input Prompt */}
              <div className="relative">
                <div className="flex gap-3 items-center bg-slate-950 rounded-xl px-4 py-3 border border-white/5 focus-within:border-amber-500/50 transition-all duration-300 shadow-md">
                  <span className="text-amber-500 font-mono font-bold select-none text-sm shrink-0">❯</span>
                  <input 
                    ref={inputRef}
                    type="text" 
                    value={command} 
                    onChange={e => setCommand(e.target.value)} 
                    onKeyDown={handleKeyDown} 
                    placeholder={isConnected ? "Enter RCON command..." : "Connect to server first..."}
                    disabled={!isConnected}
                    className="w-full bg-transparent text-sm text-white placeholder-slate-600 font-mono focus:outline-none disabled:cursor-not-allowed" 
                  />
                  <button 
                    onClick={() => handleSend()} 
                    disabled={!isConnected || !command.trim()} 
                    className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500 hover:text-slate-900 transition-all active:scale-95 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>

                {/* Autocomplete Suggestion Dropdown */}
                {autocompleteVisible && suggestions.length > 0 && (
                    <div className="absolute left-0 bottom-full mb-2 w-full bg-slate-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="bg-slate-900/50 px-4 py-2 border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                            RCON Command Autocomplete (Use ↑ ↓ Tab / Enter)
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
                                        "w-full text-left px-4 py-3 flex items-center justify-between text-xs border-b border-white/[0.02] transition-colors",
                                        idx === autocompleteIndex 
                                            ? "bg-amber-500/10 text-amber-400 border-l-2 border-l-amber-400" 
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

          {/* TAB 2: LIVE LOG FEED */}
          {activeTab === 'log_stream' && (
            <div className="flex-1 flex flex-col h-full">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/45 border border-white/5 p-4 rounded-xl mb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsStreamingLogs(!isStreamingLogs)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95",
                      isStreamingLogs
                        ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20 hover:bg-emerald-900/20"
                        : "bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-850 hover:text-slate-300"
                    )}
                  >
                    {isStreamingLogs ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Streaming Live Logs</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>Enable Streaming</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                    className={cn(
                      "p-2 rounded-xl border text-xs transition-colors",
                      autoScrollLogs
                        ? "bg-amber-950/20 text-amber-400 border-amber-500/20 hover:bg-amber-900/20"
                        : "bg-slate-950 text-slate-500 border-white/5 hover:text-slate-400"
                    )}
                    title={autoScrollLogs ? "Auto-scroll enabled" : "Auto-scroll paused"}
                  >
                    {autoScrollLogs ? <Check className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => setLogStream([])}
                    className="p-2 bg-slate-950 border border-white/5 hover:border-white/10 rounded-xl text-slate-500 hover:text-red-400 transition-colors"
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
                    placeholder="Search logs content..."
                    className="w-full bg-slate-950 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 text-white"
                  />
                </div>
              </div>

              <div
                ref={logFeedRef}
                className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-xs overflow-y-auto border border-white/5 max-h-[320px] shadow-inner text-slate-400 leading-relaxed"
              >
                {filteredLogs.length === 0 ? (
                  <div className="text-slate-600 italic text-center py-12">
                    {isStreamingLogs 
                      ? "Waiting for logs flow... (or search returned zero results)" 
                      : "Streaming is disabled. Enable to monitor logs directly from the backend stream."}
                  </div>
                ) : (
                  filteredLogs.map((entry, idx) => (
                    <div key={idx} className="mb-2 hover:bg-white/[0.01] p-1 rounded transition-colors flex items-start gap-3">
                      <span className="text-slate-650 text-[10px] shrink-0 mt-0.5 select-none">[{entry.timestamp.toLocaleTimeString()}]</span>
                      <span className="whitespace-pre-wrap break-all">{entry.line}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CLUSTER DECK */}
          {activeTab === 'cluster' && (
            <div className="flex-1 flex flex-col h-full space-y-5">
              <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl">
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Target Cluster Servers</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4 font-sans">Select which active servers this command will execute on simultaneously:</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {servers.map(server => (
                    <label
                      key={server.id}
                      className={cn(
                        "p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all hover:bg-slate-800/40",
                        clusterSelectedServers.includes(server.id)
                          ? "bg-amber-950/15 border-amber-500/20 text-amber-300"
                          : "bg-slate-900/50 border-white/5 text-slate-400"
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
                        className="w-4 h-4 rounded border-slate-800 accent-amber-500 bg-slate-950 focus:ring-0 cursor-pointer"
                      />
                      <div className="truncate font-sans">
                        <p className="text-xs font-semibold text-white truncate">{server.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">Port: {server.rconPort}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Command Prompt */}
              <div className="flex items-center gap-3 bg-slate-950 rounded-xl px-4 py-3.5 border border-white/5 focus-within:border-amber-500/50 transition-all duration-300 shadow-md">
                <TerminalIcon className="w-5 h-5 text-amber-400" />
                <input
                  type="text"
                  value={clusterCommand}
                  onChange={(e) => setClusterCommand(e.target.value)}
                  placeholder="Enter command to broadcast or execute on all selected cluster servers..."
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none font-mono placeholder:text-slate-650"
                  disabled={clusterIsExecuting}
                />
                <button
                  onClick={executeClusterCommand}
                  disabled={clusterIsExecuting || !clusterCommand.trim() || clusterSelectedServers.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400 active:scale-95"
                >
                  {clusterIsExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>Execute</span>
                </button>
              </div>

              {/* Outputs deck */}
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {Object.keys(clusterProgress).length === 0 ? (
                  <div className="text-slate-600 italic text-xs py-8 text-center bg-slate-950/20 rounded-xl border border-white/5">
                    No cluster executions triggered yet.
                  </div>
                ) : (
                  Object.entries(clusterProgress).map(([idStr, val]) => {
                    const sId = Number(idStr);
                    const server = servers.find(s => s.id === sId);
                    return (
                      <div
                        key={sId}
                        className="bg-slate-950 rounded-xl p-4 border border-white/5 flex items-start gap-4 hover:border-white/10 transition-colors"
                      >
                        <div className="w-40 truncate font-sans">
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
                          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider font-sans">Response</p>
                          <div className="mt-1 font-mono text-[11px] text-slate-300 whitespace-pre-wrap bg-slate-900/30 p-2.5 rounded-lg border border-white/5 truncate max-h-[80px] overflow-y-auto">
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
              <div className="bg-slate-950/40 border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-md relative overflow-hidden">
                <div className="space-y-2 max-w-lg font-sans">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-amber-400" />
                    <span>Verified Save World Engine</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Triggers the <code className="text-amber-400 font-semibold font-mono bg-amber-950/20 px-1 py-0.5 rounded">saveworld</code> command via RCON and verifies that the output save file is successfully written to disk, checking size and timestamp metrics in real time.
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-center gap-2 font-sans">
                  <button
                    onClick={triggerManualSave}
                    disabled={saveProgressState !== 'idle' && saveProgressState !== 'success' && saveProgressState !== 'error'}
                    className={cn(
                      "flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm shadow-xl transition-all duration-300 transform active:scale-95",
                      saveProgressState === 'idle' || saveProgressState === 'success' || saveProgressState === 'error'
                        ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/10"
                        : "bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed"
                    )}
                  >
                    {['sending', 'syncing', 'verifying'].includes(saveProgressState) ? (
                      <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    <span>Trigger Verified Save</span>
                  </button>

                  {/* Progressive indicator labels */}
                  {saveProgressState === 'sending' && (
                    <span className="text-[10px] text-amber-450 font-semibold animate-pulse">1. Sending saveworld command...</span>
                  )}
                  {saveProgressState === 'syncing' && (
                    <span className="text-[10px] text-amber-500 font-semibold animate-pulse">2. Waiting for server disk sync (3s)...</span>
                  )}
                  {saveProgressState === 'verifying' && (
                    <span className="text-[10px] text-amber-400 font-semibold animate-pulse">3. Verifying save integrity...</span>
                  )}
                  {saveProgressState === 'success' && (
                    <span className="text-[10px] text-emerald-450 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Save verified successfully!</span>
                    </span>
                  )}
                  {saveProgressState === 'error' && (
                    <span className="text-[10px] text-rose-450 font-bold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Verification failed</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Save result details */}
              {saveValidationResult && (
                <div className="bg-slate-950 rounded-2xl p-5 border border-white/5 shadow-inner grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Save File Name</p>
                    <p className="text-xs font-semibold text-white truncate font-mono mt-1" title={saveValidationResult.file_name}>
                      {saveValidationResult.file_name}
                    </p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">File Size</p>
                    <p className="text-xs font-semibold text-amber-400 font-mono mt-1">
                      {formatBytes(saveValidationResult.file_size_bytes)}
                    </p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Last Modified</p>
                    <p className="text-xs font-semibold text-white truncate font-mono mt-1">
                      {saveValidationResult.last_modified}
                    </p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Integrity Stamp</p>
                    <div className="mt-1">
                      {saveValidationResult.integrity_ok ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>PASSED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>FAILED</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Save History */}
              <div className="space-y-3 font-sans">
                <h4 className="text-xs font-bold text-slate-400 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  <span>Verified Save History Logs</span>
                </h4>

                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {saveValidationHistory.length === 0 ? (
                    <p className="text-[11px] text-slate-600 italic py-2">No save validation logs recorded in this session.</p>
                  ) : (
                    saveValidationHistory.map((h, i) => (
                      <div
                        key={i}
                        className="bg-slate-950/40 border border-white/[0.02] rounded-xl p-3 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-white">{h.serverName}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]" title={h.info.file_name}>{h.info.file_name}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-amber-400 font-mono">{formatBytes(h.info.file_size_bytes)}</span>
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

        {/* TAB SIDE PANEL: PLAYER MANAGEMENT */}
        {showPlayers && activeTab === 'terminal' && (
          <motion.div 
            initial={{ opacity: 0, width: 0, x: 20 }} 
            animate={{ opacity: 1, width: 'auto', x: 0 }}
            className="w-full lg:w-80 glass-panel rounded-2xl p-4 flex flex-col h-[500px] border border-white/5 shadow-xl shrink-0"
          >
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <Users className="w-5 h-5 text-amber-400" />
                <span>Active Survivors</span>
              </h3>
              <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">
                {players.length} Online
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2.5 max-h-[400px]">
              {players.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs text-center py-12">
                  <Users className="w-8 h-8 mb-3 opacity-20" />
                  <p>No players currently connected to the server.</p>
                </div>
              ) : (
                players.map((p, idx) => (
                  <div key={idx} className="bg-slate-950 border border-white/5 p-3 rounded-xl flex flex-col gap-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate" title={p.name}>{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate" title={p.steamId}>{p.steamId}</div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { setCommand(`kickplayer ${p.steamId}`); setTimeout(() => handleSend(`kickplayer ${p.steamId}`), 0); }}
                        className="flex-1 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors border border-orange-500/15"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Kick
                      </button>
                      <button 
                        onClick={() => { setCommand(`banplayer ${p.steamId}`); setTimeout(() => handleSend(`banplayer ${p.steamId}`), 0); }}
                        className="flex-1 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors border border-rose-500/15"
                      >
                        <Ban className="w-3.5 h-3.5" /> Ban
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
