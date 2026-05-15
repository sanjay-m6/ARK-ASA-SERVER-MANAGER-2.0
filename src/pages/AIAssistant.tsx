import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, Trash2, Loader2, CheckCircle, XCircle, AlertTriangle, Sparkles, ChevronDown, Wrench, Zap, Server, Shield, Rocket, Radio, FileText, Database, Users, Calendar, Search, Save, Navigation, ChevronRight, Brain, Plus, MessageSquare, Pin, PanelLeftClose, PanelLeftOpen, Clock, MemoryStick, Edit3, X } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../utils/helpers';
import { useAiStore } from '../stores/aiStore';
import {
    type AiMessage,
    type AiToolCall,
    AI_MODELS,
    TOOL_REGISTRY,
    MAX_TOOL_TURNS,
    buildSystemPrompt,
    sendAiMessage,
    executeToolCall,
    generateMessageId,
} from '../utils/aiAgent';
import { getAllMacros, type AiMacro } from '../utils/aiMacros';
import { type ChatSession, formatSessionTime } from '../utils/aiChatSessions';
import { loadMemory } from '../utils/aiMemory';

// ── Tool Execution Step Config ─────────────────────────────────────────

interface ExecutionStep {
    label: string;
    icon: React.ReactNode;
    status: 'pending' | 'active' | 'done' | 'error';
}

const TOOL_STEPS: Record<string, string[]> = {
    install_server: ['Validating parameters', 'Creating directory', 'Registering server', 'Configuring ports', 'Finalizing setup'],
    start_server: ['Pre-flight checks', 'Launching process', 'Verifying startup'],
    stop_server: ['Sending shutdown signal', 'Saving world data', 'Terminating process'],
    restart_server: ['Stopping server', 'Waiting for cleanup', 'Restarting process'],
    update_server: ['Checking SteamCMD', 'Downloading update', 'Applying patches', 'Verifying files'],
    create_backup: ['Locating save files', 'Compressing data', 'Writing backup'],
    rcon_command: ['Connecting RCON', 'Sending command', 'Awaiting response'],
    broadcast_message: ['Connecting RCON', 'Broadcasting message'],
    read_ini_config: ['Locating file', 'Reading contents'],
    save_ini_config: ['Validating content', 'Merging config', 'Writing file'],
    load_server_config: ['Reading database', 'Parsing INI files', 'Merging values'],
    backup_ini_config: ['Locating config', 'Creating backup copy'],
    list_backups: ['Querying database', 'Sorting results'],
    restore_backup: ['Validating backup', 'Extracting files', 'Applying restore'],
    delete_backup: ['Locating backup', 'Removing files', 'Cleaning database'],
    cleanup_old_backups: ['Listing backups', 'Identifying old', 'Removing files'],
    list_players: ['Connecting RCON', 'Fetching player list'],
    kick_player: ['Connecting RCON', 'Sending kick command'],
    ban_player: ['Connecting RCON', 'Sending ban command'],
    create_scheduled_task: ['Validating schedule', 'Creating task entry'],
    delete_scheduled_task: ['Finding task', 'Removing entry'],
    navigate_to_page: ['Navigating'],
    search_mods: ['Searching catalog', 'Fetching results'],
    get_installed_mods: ['Reading mod list'],
    save_world: ['Connecting RCON', 'Sending SaveWorld', 'Confirming save'],
    analyze_crash_log: ['Scanning logs', 'Analyzing patterns', 'Building report'],
    get_server_status: ['Querying servers'],
    get_system_info: ['Reading system metrics'],
    get_server_logs: ['Fetching log entries'],
    get_scheduled_tasks: ['Loading schedule'],
};

const TOOL_ICONS: Record<string, React.ReactNode> = {
    install_server: <Rocket className="w-5 h-5" />,
    start_server: <Zap className="w-5 h-5" />,
    stop_server: <Shield className="w-5 h-5" />,
    restart_server: <Radio className="w-5 h-5" />,
    update_server: <Server className="w-5 h-5" />,
    create_backup: <Database className="w-5 h-5" />,
    read_ini_config: <FileText className="w-5 h-5" />,
    save_ini_config: <Save className="w-5 h-5" />,
    load_server_config: <FileText className="w-5 h-5" />,
    backup_ini_config: <Database className="w-5 h-5" />,
    list_backups: <Database className="w-5 h-5" />,
    restore_backup: <Database className="w-5 h-5" />,
    list_players: <Users className="w-5 h-5" />,
    kick_player: <Users className="w-5 h-5" />,
    ban_player: <Shield className="w-5 h-5" />,
    create_scheduled_task: <Calendar className="w-5 h-5" />,
    delete_scheduled_task: <Calendar className="w-5 h-5" />,
    navigate_to_page: <Navigation className="w-5 h-5" />,
    search_mods: <Search className="w-5 h-5" />,
    get_installed_mods: <Search className="w-5 h-5" />,
    save_world: <Save className="w-5 h-5" />,
    analyze_crash_log: <AlertTriangle className="w-5 h-5" />,
};

// ── Live Execution Progress Card ───────────────────────────────────────

interface ExecutingToolState {
    name: string;
    label: string;
    steps: ExecutionStep[];
    currentStep: number;
    startTime: number;
    done: boolean;
    success?: boolean;
}

function ToolProgressCard({ state }: { state: ExecutingToolState }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (state.done) return;
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
        }, 100);
        return () => clearInterval(interval);
    }, [state.done, state.startTime]);

    const icon = TOOL_ICONS[state.name] || <Wrench className="w-5 h-5" />;
    const progress = state.done ? 100 : Math.min(95, (state.currentStep / state.steps.length) * 100);

    return (
        <div className="mx-4 my-3 ai-tool-card-enter">
            <div className={cn(
                "rounded-2xl overflow-hidden border transition-all duration-500",
                state.done
                    ? state.success
                        ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-emerald-500/10 to-cyan-500/5"
                        : "border-red-500/30 bg-gradient-to-br from-red-500/5 via-red-500/10 to-orange-500/5"
                    : "border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-indigo-500/5"
            )}>
                {/* Header */}
                <div className="px-5 py-4 flex items-center gap-3">
                    <div className={cn(
                        "relative p-2.5 rounded-xl transition-all duration-500",
                        state.done
                            ? state.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                            : "bg-cyan-500/20 text-cyan-400"
                    )}>
                        {!state.done && <div className="absolute inset-0 rounded-xl bg-cyan-400/20 ai-tool-pulse" />}
                        <div className="relative z-10">{state.done ? (state.success ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />) : icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{state.label}</h4>
                            {!state.done && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 ai-tool-dot-pulse" />
                                    <span className="text-[10px] font-bold text-cyan-400">LIVE</span>
                                </span>
                            )}
                            {state.done && state.success && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400">COMPLETE</span>
                            )}
                            {state.done && !state.success && (
                                <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400">FAILED</span>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{elapsed}s elapsed</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="px-5 pb-2">
                    <div className="w-full h-1 rounded-full bg-slate-700/50 overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-700 ease-out",
                                state.done
                                    ? state.success ? "bg-emerald-500" : "bg-red-500"
                                    : "bg-gradient-to-r from-cyan-500 to-blue-500 ai-progress-shimmer"
                            )}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Steps */}
                <div className="px-5 pb-4 space-y-1.5">
                    {state.steps.map((step, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex items-center gap-2.5 py-1 transition-all duration-300",
                                step.status === 'active' && "ai-step-enter",
                                step.status === 'pending' && "opacity-30"
                            )}
                        >
                            {step.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                            {step.status === 'active' && <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin flex-shrink-0" />}
                            {step.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                            {step.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0" />}
                            <span className={cn(
                                "text-xs transition-colors duration-300",
                                step.status === 'done' && "text-emerald-400/80",
                                step.status === 'active' && "text-white font-medium",
                                step.status === 'error' && "text-red-400",
                                step.status === 'pending' && "text-slate-600"
                            )}>
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Tool Confirmation Banner ───────────────────────────────────────────

function ToolConfirmation({
    toolCall,
    onConfirm,
    onDeny,
}: {
    toolCall: AiToolCall;
    onConfirm: () => void;
    onDeny: () => void;
}) {
    const tool = TOOL_REGISTRY[toolCall.name];
    let parsedArgs: Record<string, unknown> = {};
    try { parsedArgs = JSON.parse(toolCall.arguments || '{}'); } catch { /* empty */ }
    const icon = TOOL_ICONS[toolCall.name] || <Wrench className="w-5 h-5" />;

    return (
        <div className="mx-4 my-3 ai-tool-card-enter">
            <div className="rounded-2xl overflow-hidden border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-yellow-500/5">
                {/* Header with pulsing icon */}
                <div className="px-5 py-4 flex items-center gap-3">
                    <div className="relative p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                        <div className="absolute inset-0 rounded-xl bg-amber-400/15 ai-tool-pulse" />
                        <div className="relative z-10">{icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{tool?.label || toolCall.name}</h4>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                                <span className="text-[10px] font-bold text-amber-400">CONFIRM</span>
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">This action requires your approval to execute</p>
                    </div>
                </div>

                {/* Parameters */}
                {Object.keys(parsedArgs).length > 0 && (
                    <div className="px-5 pb-3">
                        <div className="rounded-lg bg-black/20 border border-white/5 p-3 space-y-1">
                            {Object.entries(parsedArgs).map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500 font-mono">{k}</span>
                                    <span className="text-amber-300 font-medium">{String(v)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="px-5 pb-4 flex gap-2">
                    <button
                        onClick={onConfirm}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20 transition-all group"
                    >
                        <Zap className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                        Approve & Execute
                    </button>
                    <button
                        onClick={onDeny}
                        className="px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-600/20 transition-all"
                    >
                        Deny
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Tool Result Display ────────────────────────────────────────────────

function ToolResultBadge({ success, name }: { success: boolean; name: string }) {
    const tool = TOOL_REGISTRY[name];
    return (
        <div className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold border ai-result-badge-enter",
            success
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>
            {success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            <Wrench className="w-3 h-3" />
            <span>{tool?.label || name}</span>
            {success && <span className="text-emerald-500/50">•</span>}
            {success && <span className="text-emerald-300/60 font-normal">executed</span>}
        </div>
    );
}

// ── Markdown Components ────────────────────────────────────────────────

const MarkdownComponents: import('react-markdown').Components = {
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="marker:text-cyan-500/50">{children}</li>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">{children}</a>,
    strong: ({ children }) => <strong className="font-bold text-cyan-300">{children}</strong>,
    code: (props: any) => {
        const { className, children } = props;
        const match = /language-(\w+)/.exec(className || '');
        if (!match) {
            return <code className="bg-black/30 text-cyan-200 px-1.5 py-0.5 rounded text-[13px] font-mono border border-white/5">{children}</code>;
        }
        return (
            <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0d1117]">
                <div className="bg-white/5 px-4 py-1.5 border-b border-white/10 text-xs text-slate-400 font-mono flex items-center">
                    {match[1]}
                </div>
                <div className="overflow-x-auto p-4 text-[13px] font-mono text-slate-300">
                    <pre><code>{children}</code></pre>
                </div>
            </div>
        );
    },
    table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table className="w-full text-left text-sm whitespace-nowrap">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-white/5 text-slate-300 font-semibold">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-white/5">{children}</tbody>,
    tr: ({ children }) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
    th: ({ children }) => <th className="px-4 py-3 border-b border-white/10">{children}</th>,
    td: ({ children }) => <td className="px-4 py-3">{children}</td>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-cyan-500/50 pl-4 py-1 my-3 text-slate-400 italic bg-cyan-500/5 rounded-r-lg">{children}</blockquote>,
    h1: ({ children }) => <h1 className="text-xl font-bold text-white mb-3 mt-4">{children}</h1>,
    h2: ({ children }) => <h2 className="text-lg font-bold text-white mb-2 mt-4">{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-bold text-white mb-2 mt-3">{children}</h3>,
};

// ── Chat Message Bubble ────────────────────────────────────────────────

function MessageBubble({ message }: { message: AiMessage }) {
    const isUser = message.role === 'user';
    const isTool = message.role === 'tool';

    if (isTool) {
        let parsed: { success?: boolean; toolName?: string } = {};
        try { parsed = JSON.parse(message.content); } catch { /* empty */ }
        return (
            <div className="flex justify-start px-6 py-1">
                <ToolResultBadge success={parsed.success !== false} name={parsed.toolName || 'unknown'} />
            </div>
        );
    }

    return (
        <div className={cn("flex px-6 py-2", isUser ? "justify-end" : "justify-start")}>
            <div className={cn(
                "max-w-[75%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed",
                isUser
                    ? "bg-gradient-to-br from-cyan-600/30 to-blue-600/30 border border-cyan-500/20 text-white"
                    : "glass-panel border-white/5 text-slate-200"
            )}>
                {!isUser && (
                    <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Infinity AI</span>
                    </div>
                )}
                {isUser ? (
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                ) : (
                    <div className="break-words max-w-full overflow-hidden">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {message.content}
                        </ReactMarkdown>
                    </div>
                )}
                <div className={cn(
                    "text-[10px] mt-2 font-mono",
                    isUser ? "text-cyan-400/40 text-right" : "text-slate-500"
                )}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                </div>
            </div>
        </div>
    );
}

// ── Thinking Indicator (Reasoning Phase) ───────────────────────────────

const THINKING_PHRASES = [
    'Analyzing request...',
    'Reasoning through options...',
    'Processing context...',
    'Evaluating approach...',
    'Formulating response...',
    'Cross-referencing data...',
    'Building analysis...',
    'Synthesizing information...',
];

function ThinkingBubble() {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [dots, setDots] = useState(1);

    useEffect(() => {
        const phraseTimer = setInterval(() => {
            setPhraseIndex(i => (i + 1) % THINKING_PHRASES.length);
        }, 2400);
        const dotTimer = setInterval(() => {
            setDots(d => (d % 3) + 1);
        }, 500);
        return () => { clearInterval(phraseTimer); clearInterval(dotTimer); };
    }, []);

    return (
        <div className="flex justify-start px-6 py-2 ai-tool-card-enter">
            <div className="max-w-[75%] rounded-2xl px-5 py-4 text-sm glass-panel border-white/5">
                {/* Header */}
                <div className="flex items-center gap-1.5 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Infinity AI</span>
                </div>

                {/* Thinking animation */}
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Brain className="w-5 h-5 text-cyan-400 ai-thinking-brain" />
                        <div className="absolute -inset-1 bg-cyan-400/20 rounded-full ai-tool-pulse" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-300 font-medium ai-thinking-text">
                                {THINKING_PHRASES[phraseIndex]}
                            </span>
                            <span className="text-cyan-400 font-mono text-xs w-4">
                                {'.'.repeat(dots)}
                            </span>
                        </div>
                        {/* Neural network dots */}
                        <div className="flex items-center gap-1.5 mt-2">
                            {[0, 1, 2, 3, 4].map(i => (
                                <div
                                    key={i}
                                    className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 ai-neural-dot"
                                    style={{ animationDelay: `${i * 150}ms` }}
                                />
                            ))}
                            <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/30 to-transparent ai-progress-shimmer" style={{ backgroundSize: '200% 100%' }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Typewriter Bubble (Word-by-word reveal) ──────────────────────────────

function TypewriterBubble({ content, isComplete }: { content: string; isComplete: boolean }) {
    return (
        <div className="flex justify-start px-6 py-2 ai-tool-card-enter">
            <div className="max-w-[75%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed glass-panel border-white/5 text-slate-200">
                <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className={cn("w-3.5 h-3.5 text-cyan-400", !isComplete && "animate-pulse")} />
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Infinity AI</span>
                    {!isComplete && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/15">
                            <span className="w-1 h-1 rounded-full bg-cyan-400 ai-tool-dot-pulse" />
                            <span className="text-[9px] font-bold text-cyan-400">TYPING</span>
                        </span>
                    )}
                </div>
                <div className="break-words max-w-full overflow-hidden">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {content}
                    </ReactMarkdown>
                    {/* Blinking cursor */}
                    {!isComplete && (
                        <span className="inline-block w-0.5 h-4 bg-cyan-400 ml-0.5 align-middle ai-typewriter-cursor" />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function AIAssistant() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [input, setInput] = useState('');
    const [modelOpen, setModelOpen] = useState(false);
    const [executingTool, setExecutingTool] = useState<ExecutingToolState | null>(null);
    const [agentTurnCount, setAgentTurnCount] = useState(0);
    const [showMacros, setShowMacros] = useState(false);
    const macros = getAllMacros();
    
    // Typewriter state
    const [isThinking, setIsThinking] = useState(false);
    const [typewriterText, setTypewriterText] = useState('');
    const [typewriterFullText, setTypewriterFullText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sidebar + session state
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const memory = loadMemory();
    const memoryCount = memory.facts.length + Object.keys(memory.preferences).length;

    const {
        messages,
        isStreaming,
        streamingContent,
        pendingToolCall,
        model,
        sessions,
        activeSessionId,
        sidebarOpen,
        addMessage,
        clearMessages,
        setStreaming,
        setStreamingContent,
        appendStreamingContent,
        setPendingToolCall,
        setModel,
        loadHistory,
        createNewChat,
        switchSession,
        deleteChat,
        renameChat,
        pinChat,
        toggleSidebar,

    } = useAiStore();

    // Simulate step-by-step progress for tool execution
    const animateToolExecution = useCallback((toolName: string, toolLabel: string): Promise<void> => {
        const stepLabels = TOOL_STEPS[toolName] || ['Processing', 'Executing', 'Completing'];
        const steps: ExecutionStep[] = stepLabels.map(label => ({
            label,
            icon: null,
            status: 'pending' as const,
        }));

        const state: ExecutingToolState = {
            name: toolName,
            label: toolLabel,
            steps,
            currentStep: 0,
            startTime: Date.now(),
            done: false,
        };

        setExecutingTool({ ...state });

        return new Promise(resolve => {
            let step = 0;
            const advance = () => {
                if (step < steps.length) {
                    const updated = { ...state };
                    updated.steps = steps.map((s, i) => ({
                        ...s,
                        status: i < step ? 'done' : i === step ? 'active' : 'pending',
                    }));
                    updated.currentStep = step;
                    setExecutingTool({ ...updated });
                    step++;
                    // Variable timing for realistic feel
                    const delay = 400 + Math.random() * 600;
                    setTimeout(advance, delay);
                } else {
                    resolve();
                }
            };
            // Start first step after a brief delay
            setTimeout(advance, 200);
        });
    }, []);

    // Load history on mount
    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent, pendingToolCall, typewriterText, isThinking]);

    // Typewriter word-by-word reveal effect
    useEffect(() => {
        if (!typewriterFullText || !isTyping) return;

        // Split into tokens: words + whitespace/punctuation groups for smooth reveal
        const tokens = typewriterFullText.match(/\S+\s*/g) || [];
        let currentIndex = 0;
        let revealed = '';

        const tick = () => {
            if (currentIndex < tokens.length) {
                revealed += tokens[currentIndex];
                setTypewriterText(revealed);
                currentIndex++;

                // Variable speed: faster for short words/punct, slower for long words
                const word = tokens[currentIndex - 1] || '';
                const isCodeOrTable = word.includes('|') || word.includes('`') || word.includes('#');
                const delay = isCodeOrTable ? 8 : Math.min(50, Math.max(15, 20 + word.length * 2));
                typewriterRef.current = setTimeout(tick, delay);
            } else {
                // Done typing — commit to messages
                setIsTyping(false);
                setTypewriterText('');
                setTypewriterFullText('');
                addMessage({
                    id: generateMessageId(),
                    role: 'assistant',
                    content: typewriterFullText,
                    timestamp: Date.now(),
                });
            }
        };

        typewriterRef.current = setTimeout(tick, 80);

        return () => {
            if (typewriterRef.current) clearTimeout(typewriterRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typewriterFullText, isTyping]);

    // Helper: start typewriter effect with text
    const startTypewriter = useCallback((text: string) => {
        setIsThinking(false);
        setTypewriterText('');
        setTypewriterFullText(text);
        setIsTyping(true);
    }, []);

    // Listen for stream chunks
    useEffect(() => {
        const unlisten = listen<{ content: string; done: boolean }>('ai-stream-chunk', (event) => {
            if (event.payload.done) {
                const finalContent = useAiStore.getState().streamingContent;
                if (finalContent) {
                    addMessage({
                        id: generateMessageId(),
                        role: 'assistant',
                        content: finalContent,
                        timestamp: Date.now(),
                    });
                }
                setStreaming(false);
                setStreamingContent('');
            } else {
                appendStreamingContent(event.payload.content);
            }
        });

        return () => { unlisten.then(fn => fn()); };
    }, [addMessage, setStreaming, setStreamingContent, appendStreamingContent]);

    // Send message handler
    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isStreaming) return;

        const userMsg: AiMessage = {
            id: generateMessageId(),
            role: 'user',
            content: trimmed,
            timestamp: Date.now(),
        };
        addMessage(userMsg);
        setInput('');

        // Build messages for API (without tool result messages, keep it simple)
        const apiMessages = [
            { role: 'system', content: buildSystemPrompt() },
            ...useAiStore.getState().messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content })),
        ];

        setStreaming(true);
        setStreamingContent('');
        setIsThinking(true);

        try {
            // Try non-streaming first (for tool calls)
            const response = await sendAiMessage(apiMessages, model);

            // Handle tool calls
            if (response.tool_calls && response.tool_calls.length > 0) {
                const tc = response.tool_calls[0];
                const tool = TOOL_REGISTRY[tc.name];

                // Add AI's explanation if present (instant for tool calls)
                if (response.content) {
                    setIsThinking(false);
                    addMessage({
                        id: generateMessageId(),
                        role: 'assistant',
                        content: response.content,
                        toolCalls: response.tool_calls,
                        timestamp: Date.now(),
                    });
                }

                if (tool?.requiresConfirmation) {
                    setPendingToolCall({ ...tc, messageId: generateMessageId() });
                    setStreaming(false);
                    setStreamingContent('');
                    setIsThinking(false);
                } else {
                    // Auto-execute safe tools
                    setStreaming(false);
                    setStreamingContent('');
                    setIsThinking(false);
                    await executeAndReport(tc, apiMessages);
                }
            } else {
                // Regular text response → typewriter effect
                setStreaming(false);
                setStreamingContent('');
                startTypewriter(response.content || 'No response from AI.');
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setIsThinking(false);
            addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: `⚠️ **Error**: ${errorMsg}`,
                timestamp: Date.now(),
            });
            setStreaming(false);
            setStreamingContent('');
        }
    }, [input, isStreaming, model, addMessage, setStreaming, setStreamingContent, setPendingToolCall]);

    // Execute tool and send result back to AI — with agentic multi-turn loop
    const executeAndReport = async (tc: AiToolCall, apiMessages: { role: string; content: string }[], turnNumber = 1) => {
        setStreaming(true);
        setIsThinking(false);
        setAgentTurnCount(turnNumber);
        const toolLabel = TOOL_REGISTRY[tc.name]?.label || tc.name;

        // Handle navigation tool specially
        if (tc.name === 'navigate_to_page') {
            try {
                const args = JSON.parse(tc.arguments || '{}');
                navigate(args.path || '/dashboard');
                addMessage({
                    id: generateMessageId(),
                    role: 'tool',
                    content: JSON.stringify({ success: true, toolName: tc.name }),
                    toolCallId: tc.id,
                    timestamp: Date.now(),
                });
                addMessage({
                    id: generateMessageId(),
                    role: 'assistant',
                    content: `✅ Navigated to **${args.path}**`,
                    timestamp: Date.now(),
                });
            } catch { /* ignore */ }
            setStreaming(false);
            setStreamingContent('');
            setAgentTurnCount(0);
            return;
        }

        // Start the animated progress card and actual execution in parallel
        const [result] = await Promise.all([
            executeToolCall(tc),
            animateToolExecution(tc.name, toolLabel),
        ]);

        // Mark progress card as complete
        setExecutingTool(prev => prev ? {
            ...prev,
            done: true,
            success: result.success,
            steps: prev.steps.map(s => ({ ...s, status: result.success ? 'done' as const : (s.status === 'active' ? 'error' as const : s.status) })),
        } : null);

        // Hold the completion state briefly so user sees it
        await new Promise(r => setTimeout(r, 800));
        setExecutingTool(null);

        // Add tool result as a message
        addMessage({
            id: generateMessageId(),
            role: 'tool',
            content: JSON.stringify({ success: result.success, toolName: tc.name }),
            toolCallId: tc.id,
            timestamp: Date.now(),
        });

        // Send result back to AI — it may decide to call another tool (agentic loop)
        const followUpMessages = [
            ...apiMessages,
            { role: 'assistant', content: `I'll execute ${toolLabel} now.` },
            { role: 'user', content: `Tool "${tc.name}" returned:\n\`\`\`json\n${result.result}\n\`\`\`\n\nIf the user's original request needs more steps, call the next tool. Otherwise summarize the result.` },
        ];

        try {
            const followUp = await sendAiMessage(followUpMessages, model);

            // Agentic loop — if AI wants another tool and we haven't exceeded the limit
            if (followUp.tool_calls && followUp.tool_calls.length > 0 && turnNumber < MAX_TOOL_TURNS) {
                const nextTc = followUp.tool_calls[0];
                const nextTool = TOOL_REGISTRY[nextTc.name];

                // Add interim explanation if present
                if (followUp.content) {
                    addMessage({
                        id: generateMessageId(),
                        role: 'assistant',
                        content: followUp.content,
                        timestamp: Date.now(),
                    });
                }

                if (nextTool?.requiresConfirmation) {
                    // Pause the loop for confirmation
                    setPendingToolCall({ ...nextTc, messageId: generateMessageId() });
                    setStreaming(false);
                    setStreamingContent('');
                    setAgentTurnCount(0);
                } else {
                    // Continue the agentic loop
                    await executeAndReport(nextTc, followUpMessages, turnNumber + 1);
                }
                return;
            }

            // No more tools — typewriter the final summary
            setStreaming(false);
            setStreamingContent('');
            setAgentTurnCount(0);
            startTypewriter(followUp.content || (result.success ? '✅ Action completed successfully.' : '❌ Action failed.'));
            return;
        } catch {
            addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: result.success
                    ? `✅ **${toolLabel}** completed successfully.`
                    : `❌ **${toolLabel}** failed: ${result.result}`,
                timestamp: Date.now(),
            });
        }

        setStreaming(false);
        setStreamingContent('');
        setAgentTurnCount(0);
    };

    // Confirm pending tool call
    const handleConfirmTool = async () => {
        if (!pendingToolCall) return;
        const tc: AiToolCall = { id: pendingToolCall.id, name: pendingToolCall.name, arguments: pendingToolCall.arguments };
        setPendingToolCall(null);

        const apiMessages = [
            { role: 'system', content: buildSystemPrompt() },
            ...messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content })),
        ];

        await executeAndReport(tc, apiMessages);
    };

    // Deny pending tool call
    const handleDenyTool = () => {
        if (!pendingToolCall) return;
        addMessage({
            id: generateMessageId(),
            role: 'assistant',
            content: `🚫 Action **${TOOL_REGISTRY[pendingToolCall.name]?.label || pendingToolCall.name}** was denied by user.`,
            timestamp: Date.now(),
        });
        setPendingToolCall(null);
    };

    // Handle Enter key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Handle session rename submit
    const handleRenameSubmit = (id: string) => {
        if (renameValue.trim()) {
            renameChat(id, renameValue.trim());
        }
        setRenamingId(null);
        setRenameValue('');
    };

    return (
        <div className="flex h-[calc(100vh-140px)] gap-0">

            {/* ═══ History Sidebar ═══ */}
            <div className={cn(
                "flex-shrink-0 flex flex-col rounded-2xl glass-panel border-white/5 overflow-hidden transition-all duration-300 ease-out",
                sidebarOpen ? "w-72 mr-4 opacity-100" : "w-0 mr-0 opacity-0 overflow-hidden"
            )}>
                {sidebarOpen && (
                    <>
                        {/* Sidebar Header */}
                        <div className="p-4 border-b border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chat History</span>
                                <button
                                    onClick={toggleSidebar}
                                    className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700/50 transition-all"
                                    title="Close sidebar"
                                >
                                    <PanelLeftClose className="w-4 h-4" />
                                </button>
                            </div>
                            <button
                                onClick={createNewChat}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border border-cyan-500/20 text-cyan-400 hover:from-cyan-500/25 hover:to-blue-500/25 hover:text-white transition-all text-xs font-bold"
                            >
                                <Plus className="w-4 h-4" />
                                New Chat
                            </button>
                        </div>

                        {/* Memory Badge */}
                        {memoryCount > 0 && (
                            <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/15">
                                <MemoryStick className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-[10px] font-bold text-indigo-400">{memoryCount} memories</span>
                            </div>
                        )}

                        {/* Session List */}
                        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-hide">
                            {sessions.length === 0 && (
                                <div className="text-center py-8 text-slate-600 text-xs">No chats yet</div>
                            )}
                            {sessions.map((session: ChatSession) => (
                                <div
                                    key={session.id}
                                    className={cn(
                                        "group mx-2 rounded-xl transition-all duration-200 cursor-pointer",
                                        session.id === activeSessionId
                                            ? "bg-cyan-500/10 border border-cyan-500/15"
                                            : "hover:bg-slate-800/50 border border-transparent"
                                    )}
                                >
                                    <div
                                        className="flex items-start gap-2.5 px-3 py-2.5"
                                        onClick={() => switchSession(session.id)}
                                    >
                                        <MessageSquare className={cn(
                                            "w-4 h-4 flex-shrink-0 mt-0.5",
                                            session.id === activeSessionId ? "text-cyan-400" : "text-slate-600"
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            {renamingId === session.id ? (
                                                <input
                                                    autoFocus
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onBlur={() => handleRenameSubmit(session.id)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRenameSubmit(session.id);
                                                        if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                                                    }}
                                                    className="w-full bg-slate-800 border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            ) : (
                                                <p className={cn(
                                                    "text-xs font-medium truncate",
                                                    session.id === activeSessionId ? "text-white" : "text-slate-300"
                                                )}>
                                                    {session.pinned && <Pin className="w-2.5 h-2.5 inline mr-1 text-amber-400" />}
                                                    {session.title}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <Clock className="w-2.5 h-2.5 text-slate-600" />
                                                <span className="text-[10px] text-slate-600">
                                                    {formatSessionTime(session.updatedAt)}
                                                </span>
                                                {session.messageCount > 0 && (
                                                    <span className="text-[10px] text-slate-600">
                                                        · {session.messageCount} msgs
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions (visible on hover) */}
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setRenamingId(session.id); setRenameValue(session.title); }}
                                                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-700/50 transition-all"
                                                title="Rename"
                                            >
                                                <Edit3 className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); pinChat(session.id); }}
                                                className={cn("p-1 rounded transition-all", session.pinned ? "text-amber-400" : "text-slate-500 hover:text-amber-400 hover:bg-slate-700/50")}
                                                title={session.pinned ? 'Unpin' : 'Pin'}
                                            >
                                                <Pin className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteChat(session.id); }}
                                                className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                title="Delete"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ═══ Main Chat Column ═══ */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* Header */}
                <div className="flex items-center justify-between px-2 pb-4">
                    <div className="flex items-center gap-3">
                        {/* Sidebar Toggle */}
                        <button
                            onClick={toggleSidebar}
                            className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                            title={sidebarOpen ? 'Close history' : 'Open history'}
                        >
                            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                        </button>

                        <div className="relative">
                            <div className="absolute inset-0 bg-cyan-500/30 blur-xl rounded-full opacity-60"></div>
                            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20">
                                <Bot className="w-6 h-6 text-cyan-400" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">{t('aiAssistant.title', 'Infinity AI')}</h1>
                            <p className="text-xs text-slate-400">{t('aiAssistant.subtitle', 'Autonomous server management assistant')}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* New Chat Button */}
                        <button
                            onClick={createNewChat}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500/15 to-blue-500/15 border border-cyan-500/20 text-cyan-400 hover:from-cyan-500/25 hover:to-blue-500/25 hover:text-white transition-all text-xs font-bold"
                            title="New Chat"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">New Chat</span>
                        </button>

                        {/* Model Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setModelOpen(!modelOpen)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                            >
                                <span className="text-xs font-mono">{AI_MODELS.find(m => m.id === model)?.name || 'Model'}</span>
                                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", modelOpen && "rotate-180")} />
                            </button>
                            {modelOpen && (
                                <div className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/60 z-50 overflow-hidden">
                                    {AI_MODELS.map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => { setModel(m.id); setModelOpen(false); }}
                                            className={cn(
                                                "w-full text-left px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0",
                                                model === m.id && "bg-cyan-500/10"
                                            )}
                                        >
                                            <div className="text-sm font-medium text-white">{m.name}</div>
                                            <div className="text-[11px] text-slate-500">{m.description}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Clear Chat */}
                        <button
                            onClick={clearMessages}
                            className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
                            title="Clear chat"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 rounded-2xl glass-panel border-white/5 overflow-hidden flex flex-col">

                {/* Messages */}
                <div className="flex-1 overflow-y-auto py-4 space-y-1 scrollbar-hide">
                    {messages.length === 0 && !isStreaming && (
                        <div className="flex flex-col items-center justify-center h-full text-center px-8">
                            <div className="p-5 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-500/10 mb-6">
                                <Bot className="w-12 h-12 text-cyan-400/60" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Welcome to Infinity AI</h3>
                            <p className="text-sm text-slate-400 max-w-md mb-8">
                                Your autonomous ARK server management assistant. Ask me to check server status, start or stop servers, create backups, run RCON commands, and more.
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl w-full">
                                {[
                                    'Show all server status',
                                    'What is the system health?',
                                    'Create a backup for server 1',
                                    'Show scheduled tasks',
                                    'Check server logs for crashes',
                                    'Broadcast a message to all players',
                                    'Optimize my GameUserSettings.ini',
                                    'Explain breeding multipliers',
                                    'Check for server updates'
                                ].map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                                        className="text-left px-4 py-3 rounded-xl bg-slate-800/30 border border-slate-700/30 text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 hover:border-slate-600/50 transition-all line-clamp-2"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                    ))}

                    {isStreaming && !executingTool && !isTyping && <ThinkingBubble />}

                    {/* Typewriter text reveal */}
                    {isTyping && typewriterText && (
                        <TypewriterBubble content={typewriterText} isComplete={false} />
                    )}

                    {executingTool && (
                        <div className="relative">
                            {agentTurnCount > 1 && (
                                <div className="flex items-center gap-2 px-6 py-1">
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                                        <ChevronRight className="w-3 h-3 text-indigo-400" />
                                        <span className="text-[10px] font-bold text-indigo-400">STEP {agentTurnCount}/{MAX_TOOL_TURNS}</span>
                                    </span>
                                </div>
                            )}
                            <ToolProgressCard state={executingTool} />
                        </div>
                    )}

                    {pendingToolCall && (
                        <ToolConfirmation
                            toolCall={pendingToolCall}
                            onConfirm={handleConfirmTool}
                            onDeny={handleDenyTool}
                        />
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Macro Bar + Input */}
                <div className="border-t border-white/5 p-4">
                    {/* Macro Quick Actions */}
                    <div className="mb-3">
                        <button
                            onClick={() => setShowMacros(!showMacros)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-cyan-400 transition-colors mb-2"
                        >
                            <Zap className="w-3 h-3" />
                            Quick Actions
                            <ChevronDown className={cn("w-3 h-3 transition-transform", showMacros && "rotate-180")} />
                        </button>
                        {showMacros && (
                            <div className="flex flex-wrap gap-2 ai-tool-card-enter">
                                {macros.map((macro: AiMacro) => (
                                    <button
                                        key={macro.id}
                                        onClick={() => { setInput(macro.prompt); setShowMacros(false); inputRef.current?.focus(); }}
                                        disabled={isStreaming}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/30 text-xs text-slate-400 hover:text-white hover:bg-slate-800/70 hover:border-cyan-500/20 transition-all disabled:opacity-40"
                                        title={macro.description}
                                    >
                                        <span>{macro.icon}</span>
                                        <span>{macro.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-end gap-3">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t('aiAssistant.placeholder', 'Ask Infinity AI...')}
                            rows={1}
                            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                            style={{ minHeight: '44px', maxHeight: '120px' }}
                            disabled={isStreaming}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isStreaming}
                            className={cn(
                                "p-3 rounded-xl transition-all flex-shrink-0",
                                input.trim() && !isStreaming
                                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40"
                                    : "bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/30"
                            )}
                        >
                            {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2 text-center">
                        Press Enter to send · Shift+Enter for new line · {agentTurnCount > 0 ? `Agent loop: step ${agentTurnCount}/${MAX_TOOL_TURNS}` : 'Powered by NVIDIA AI'}
                    </p>
                </div>
            </div>
        </div>
        </div>
    );
}
