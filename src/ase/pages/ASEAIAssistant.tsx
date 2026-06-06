import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, Trash2, Loader2, CheckCircle, XCircle, AlertTriangle, Sparkles, Wrench, Zap, Server, Shield, Rocket, Radio, FileText, Database, Users, Calendar, Search, Save, Navigation, Brain, Plus, MessageSquare, Pin, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../utils/helpers';
import { useAiStore } from '../../stores/aiStore';
import {
    type AiToolCall,
    AI_MODELS,
    TOOL_REGISTRY,
    MAX_TOOL_TURNS,
    buildSystemPrompt,
    sendAiMessage,
    executeToolCall,
    generateMessageId,
} from '../../utils/aiAgent';
import { getAllMacros, type AiMacro } from '../../utils/aiMacros';
import { loadMemory } from '../../utils/aiMemory';

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
                        ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-emerald-500/10 to-amber-500/5"
                        : "border-red-500/30 bg-gradient-to-br from-red-500/5 via-red-500/10 to-orange-500/5"
                    : "border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-amber-600/5 to-yellow-600/5"
            )}>
                {/* Header */}
                <div className="px-5 py-4 flex items-center gap-3">
                    <div className={cn(
                        "relative p-2.5 rounded-xl transition-all duration-500",
                        state.done
                            ? state.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                            : "bg-amber-500/20 text-amber-400"
                    )}>
                        {!state.done && <div className="absolute inset-0 rounded-xl bg-amber-400/20 ai-tool-pulse" />}
                        <div className="relative z-10">{state.done ? (state.success ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />) : icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{state.label}</h4>
                            {!state.done && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                    <span className="text-[10px] font-bold text-amber-400">LIVE</span>
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
                                    : "bg-gradient-to-r from-amber-500 to-yellow-500"
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
                                step.status === 'active' && "animate-pulse",
                                step.status === 'pending' && "opacity-30"
                            )}
                        >
                            {step.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                            {step.status === 'active' && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />}
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
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-slate-200">{children}</p>,
    h1: ({ children }) => React.createElement('h1', { className: "text-lg font-bold text-white mb-2 mt-4 first:mt-0" }, children),
    h2: ({ children }) => <h2 className="text-base font-bold text-white mb-2 mt-3 first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold text-white mb-1 mt-2 first:mt-0">{children}</h3>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-slate-300">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-slate-300">{children}</ol>,
    li: ({ children }) => <li className="text-sm">{children}</li>,
    code: ({ className, children }) => {
        const match = /language-(\w+)/.exec(className || '');
        const isInline = !match;
        return isInline ? (
            <code className="px-1.5 py-0.5 rounded bg-black/40 text-amber-400 font-mono text-xs border border-white/5">
                {children}
            </code>
        ) : (
            <div className="relative my-3 rounded-xl overflow-hidden border border-white/10 bg-slate-950 font-mono text-xs shadow-2xl">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-white/5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>{match[1]}</span>
                </div>
                <pre className="p-4 overflow-x-auto text-slate-300 whitespace-pre-wrap">
                    <code>{children}</code>
                </pre>
            </div>
        );
    },
};

// ── Main Page Component ────────────────────────────────────────────────

export default function ASEAIAssistant() {
    const navigate = useNavigate();

    // Store state
    const {
        sessions,
        activeSessionId,
        messages,
        isStreaming,
        model,
        sidebarOpen,
        createNewChat,
        deleteChat,
        switchSession,
        addMessage,
        setStreaming,
        toggleSidebar,
    } = useAiStore();

    // Local states
    const [inputValue, setInputValue] = useState('');
    const [streamContent, setStreamContent] = useState('');
    const [executingTool, setExecutingTool] = useState<ExecutingToolState | null>(null);
    const [pendingToolConfirm, setPendingToolConfirm] = useState<AiToolCall | null>(null);
    const [memoryStats, setMemoryStats] = useState({ facts: 0, entities: 0 });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll messages
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamContent, executingTool, pendingToolConfirm, scrollToBottom]);

    // Load Memory metadata
    useEffect(() => {
        try {
            const mem = loadMemory();
            setMemoryStats({
                facts: mem.facts.length,
                entities: Object.keys(mem.preferences).length
            });
        } catch (err) {
            console.error("Memory load failed", err);
        }
    }, []);

    // Create a session if none exists
    useEffect(() => {
        if (sessions.length === 0) {
            createNewChat();
        } else if (!activeSessionId) {
            switchSession(sessions[0].id);
        }
    }, [sessions, activeSessionId, createNewChat, switchSession]);

    // Listen for stream chunks from backend Tauri
    useEffect(() => {
        const unsubPromise = listen<{ content: string; done: boolean }>('ai-stream-chunk', (event) => {
            const chunk = event.payload;
            if (chunk.done) {
                setStreamContent(prev => {
                    if (prev.trim()) {
                        addMessage({
                            id: generateMessageId(),
                            role: 'assistant',
                            content: prev,
                            timestamp: Date.now()
                        });
                    }
                    return '';
                });
                setStreaming(false);
            } else {
                setStreamContent(prev => prev + chunk.content);
            }
        });

        return () => {
            unsubPromise.then(unsub => unsub());
        };
    }, [addMessage, setStreaming]);

    // Handle Prompt Macros / Presets
    const handleMacroClick = (macro: AiMacro) => {
        setInputValue(macro.prompt);
        textareaRef.current?.focus();
    };

    // Main send logic
    const handleSend = async (textToSend?: string) => {
        const text = (textToSend || inputValue).trim();
        if (!text || isStreaming) return;

        setInputValue('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Add user message
        addMessage({
            id: generateMessageId(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
        });

        setStreaming(true);

        try {
            // Build system & chat history list
            const history = messages.map(m => ({ role: m.role, content: m.content }));
            history.push({ role: 'user', content: text });

            // Set custom ASE oriented prompt instructions
            const aseInstructions = "\n[CONTEXT] Keep in mind we are assisting with ARK: Survival Evolved (ASE) specifically. Provide paths containing ShooterGame/Binaries/Win64, ShooterGame/Saved/SavedArks, and uMod/Oxide directories where appropriate.";
            const systemContent = buildSystemPrompt() + aseInstructions;

            const fullMessages = [
                { role: 'system', content: systemContent },
                ...history
            ];

            const response = await sendAiMessage(fullMessages, model);

            // Handle normal assistant response
            if (response.content) {
                addMessage({
                    id: generateMessageId(),
                    role: 'assistant',
                    content: response.content,
                    timestamp: Date.now()
                });
            }

            // Handle tool calls sequential pipeline
            if (response.tool_calls && response.tool_calls.length > 0) {
                await processToolCalls(response.tool_calls);
            } else {
                setStreaming(false);
            }

        } catch (error: any) {
            console.error("AI send failed", error);
            addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: `⚠️ Error communicating with AI: ${error.message || error}`,
                timestamp: Date.now()
            });
            setStreaming(false);
        }
    };

    // Tool Execution Pipeline
    const processToolCalls = async (calls: AiToolCall[]) => {
        let turn = 0;
        let activeCalls = [...calls];

        while (activeCalls.length > 0 && turn < MAX_TOOL_TURNS) {
            const currentCall = activeCalls[0];
            const toolDef = TOOL_REGISTRY[currentCall.name];

            if (toolDef?.requiresConfirmation) {
                // Halt and wait for user confirmation
                setPendingToolConfirm(currentCall);
                setStreaming(false);
                break;
            } else {
                const result = await executeSingleTool(currentCall);
                // Recursively send tool feedback back to AI for next step
                const history = messages.map(m => ({ role: m.role, content: m.content }));
                history.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                });

                setStreaming(true);
                const nextResponse = await sendAiMessage([
                    { role: 'system', content: buildSystemPrompt() },
                    ...history
                ], model);

                if (nextResponse.content) {
                    addMessage({
                        id: generateMessageId(),
                        role: 'assistant',
                        content: nextResponse.content,
                        timestamp: Date.now()
                    });
                }

                activeCalls = nextResponse.tool_calls;
            }
            turn++;
        }

        if (turn >= MAX_TOOL_TURNS) {
            addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: "⚠️ Tool execution safety limit reached (5 turns).",
                timestamp: Date.now()
            });
            setStreaming(false);
        }
    };

    const executeSingleTool = async (call: AiToolCall) => {
        const toolDef = TOOL_REGISTRY[call.name];
        const steps = TOOL_STEPS[call.name] || ['Executing operation'];

        const toolState: ExecutingToolState = {
            name: call.name,
            label: toolDef?.label || call.name,
            steps: steps.map(s => ({ label: s, icon: null, status: 'pending' })),
            currentStep: 0,
            startTime: Date.now(),
            done: false,
        };

        setExecutingTool(toolState);

        const onStepChange = (stepIndex: number, status: 'active' | 'done' | 'error') => {
            setExecutingTool(prev => {
                if (!prev) return null;
                const newSteps = [...prev.steps];
                if (newSteps[stepIndex]) {
                    newSteps[stepIndex].status = status;
                }
                return {
                    ...prev,
                    steps: newSteps,
                    currentStep: stepIndex,
                };
            });
        };

        try {
            let parsedArgs = {};
            try { parsedArgs = JSON.parse(call.arguments || '{}'); } catch { /* empty */ }

            // Dynamic route interceptor inside Tauri React context
            if (call.name === 'navigate_to_page') {
                const path = (parsedArgs as any).path;
                onStepChange(0, 'active');
                setTimeout(() => {
                    navigate(path);
                    onStepChange(0, 'done');
                    setExecutingTool(prev => prev ? { ...prev, done: true, success: true } : null);
                }, 1000);
                return { success: true, navigated: path };
            }

            onStepChange(0, 'active');
            const result = await executeToolCall(call);
            onStepChange(0, 'done');
            setExecutingTool(prev => prev ? { ...prev, done: true, success: result.success } : null);

            addMessage({
                id: generateMessageId(),
                role: 'tool',
                content: JSON.stringify({ success: result.success, toolName: call.name }),
                toolCallId: call.id,
                timestamp: Date.now(),
            });

            return result;

        } catch (error: any) {
            setExecutingTool(prev => prev ? { ...prev, done: true, success: false } : null);

            addMessage({
                id: generateMessageId(),
                role: 'tool',
                content: JSON.stringify({ success: false, toolName: call.name }),
                toolCallId: call.id,
                timestamp: Date.now(),
            });

            throw error;
        }
    };

    // User confirmed a pending action
    const handleConfirmTool = async () => {
        if (!pendingToolConfirm) return;
        const call = pendingToolConfirm;
        setPendingToolConfirm(null);
        setStreaming(true);

        try {
            const result = await executeSingleTool(call);
            const history = messages.map(m => ({ role: m.role, content: m.content }));
            history.push({
                role: 'tool',
                content: JSON.stringify(result)
            });

            const nextResponse = await sendAiMessage([
                { role: 'system', content: buildSystemPrompt() },
                ...history
            ], model);

            if (nextResponse.content) {
                addMessage({
                    id: generateMessageId(),
                    role: 'assistant',
                    content: nextResponse.content,
                    timestamp: Date.now()
                });
            }

            if (nextResponse.tool_calls.length > 0) {
                await processToolCalls(nextResponse.tool_calls);
            } else {
                setStreaming(false);
            }

        } catch (err: any) {
            setStreaming(false);
        }
    };

    // User denied
    const handleDenyTool = () => {
        if (!pendingToolConfirm) return;
        const call = pendingToolConfirm;
        setPendingToolConfirm(null);

        addMessage({
            id: generateMessageId(),
            role: 'assistant',
            content: `❌ Denied execution of: **${TOOL_REGISTRY[call.name]?.label || call.name}**`,
            timestamp: Date.now()
        });
    };

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-slate-950 text-slate-100 font-sans">
            {/* Sidebar (Sessions & memory stats) */}
            <div className={cn(
                "h-full border-r border-amber-500/10 bg-slate-900/60 backdrop-blur-xl flex flex-col transition-all duration-300",
                sidebarOpen ? "w-64" : "w-0 overflow-hidden"
            )}>
                <div className="p-4 border-b border-amber-500/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-amber-400" />
                        <span className="font-bold text-xs uppercase tracking-wider text-amber-200">AI SESSIONS</span>
                    </div>
                    <button
                        onClick={() => createNewChat()}
                        className="p-1.5 rounded-lg hover:bg-white/5 border border-white/5 hover:border-amber-500/20 text-slate-300 hover:text-amber-400 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {/* Session list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            onClick={() => switchSession(s.id)}
                            className={cn(
                                "group flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all",
                                s.id === activeSessionId
                                    ? "bg-amber-500/10 border-amber-500/20 text-white font-medium shadow-md"
                                    : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                            )}
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <Bot className={cn("w-4 h-4 flex-shrink-0", s.id === activeSessionId ? "text-amber-400" : "text-slate-500")} />
                                <div className="truncate text-xs">{s.title}</div>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteChat(s.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Cognitive memory stats */}
                <div className="p-4 border-t border-amber-500/10 bg-slate-950/40">
                    <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-amber-400 animate-pulse" />
                        <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Cognitive Core</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                            <p className="text-xs text-slate-500">Facts</p>
                            <p className="text-sm font-bold text-amber-400 mt-0.5">{memoryStats.facts}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                            <p className="text-xs text-slate-500">Entities</p>
                            <p className="text-sm font-bold text-amber-400 mt-0.5">{memoryStats.entities}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Chat Box */}
            <div className="flex-1 flex flex-col h-full bg-gradient-to-b from-slate-950 via-slate-900/40 to-slate-950 relative">
                {/* Header panel */}
                <div className="h-16 border-b border-amber-500/10 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleSidebar}
                            className="p-2 rounded-lg hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white transition-all mr-1"
                        >
                            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                        </button>
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-sm font-bold text-white uppercase tracking-wider">ARK Survival Evolved AI Assistant</h1>
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-400">ASE EDITION</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">Real-time uMod/Oxide plugin analysis, tribe log scans, database indexing, and custom shell executors</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-medium">Model:</span>
                        <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/10 text-xs text-amber-300 font-bold flex items-center gap-1.5 shadow-inner">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
                            <span>{AI_MODELS[0].name}</span>
                        </div>
                    </div>
                </div>

                {/* Messages feed */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-2xl mx-auto space-y-8 animate-fade-in">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-full bg-amber-500/10 blur-xl animate-pulse" />
                                <div className="relative p-6 rounded-3xl bg-slate-900 border border-amber-500/20 text-amber-400 shadow-2xl">
                                    <Bot className="w-12 h-12 animate-bounce" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">Initialize ASE Server Operations</h3>
                                <p className="text-sm text-slate-400 max-w-md mx-auto">
                                    I have deep indexing capabilities into classic ARK server dynamics, uMod plugins, and multi-thread configurations. What can I do for you today?
                                </p>
                            </div>

                            {/* Preset macros */}
                            <div className="grid grid-cols-2 gap-3 w-full">
                                {getAllMacros().slice(0, 4).map(macro => (
                                    <button
                                        key={macro.id}
                                        onClick={() => handleMacroClick(macro)}
                                        className="group p-4 rounded-2xl bg-slate-900/60 border border-white/5 hover:border-amber-500/20 hover:bg-amber-500/5 text-left transition-all space-y-1.5 shadow-lg"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                                            <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">{macro.name}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 group-hover:text-slate-400 line-clamp-2 leading-relaxed">{macro.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((message) => {
                        const isUser = message.role === 'user';
                        const isTool = message.role === 'tool';

                        if (isTool) {
                            let parsed: { success?: boolean; toolName?: string } = {};
                            try { parsed = JSON.parse(message.content); } catch { /* empty */ }
                            return (
                                <div key={message.id} className="flex gap-4 max-w-4xl mr-auto pl-13">
                                    <ToolResultBadge success={parsed.success !== false} name={parsed.toolName || 'unknown'} />
                                </div>
                            );
                        }

                        return (
                            <div
                                key={message.id}
                                className={cn(
                                    "flex gap-4 max-w-4xl",
                                    isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                                )}
                            >
                                {/* Avatar */}
                                <div className={cn(
                                    "w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center border shadow-md",
                                    isUser
                                        ? "bg-slate-800 border-slate-700 text-slate-300"
                                        : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                )}>
                                    {isUser ? <Users className="w-4 h-4" /> : <Bot className="w-5 h-5" />}
                                </div>

                                {/* Message bubble */}
                                <div className="space-y-2">
                                    <div className={cn(
                                        "px-5 py-4 rounded-2xl border shadow-xl leading-relaxed text-sm",
                                        isUser
                                            ? "bg-slate-900 border-slate-800 text-slate-100 rounded-tr-none"
                                            : "bg-slate-900/40 border-white/5 text-slate-200 rounded-tl-none backdrop-blur-sm"
                                    )}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                            {message.content}
                                        </ReactMarkdown>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-mono block px-2">
                                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {/* Pending tools progress */}
                    {executingTool && (
                        <div className="flex gap-4 max-w-4xl mr-auto">
                            <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <ToolProgressCard state={executingTool} />
                            </div>
                        </div>
                    )}

                    {/* Pending tool confirmation dialog */}
                    {pendingToolConfirm && (
                        <div className="flex gap-4 max-w-4xl mr-auto">
                            <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <ToolConfirmation
                                    toolCall={pendingToolConfirm}
                                    onConfirm={handleConfirmTool}
                                    onDeny={handleDenyTool}
                                />
                            </div>
                        </div>
                    )}

                    {/* Streaming Assistant chunk */}
                    {streamContent && (
                        <div className="flex gap-4 max-w-4xl mr-auto">
                            <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                <Bot className="w-5 h-5" />
                            </div>
                            <div className="space-y-2">
                                <div className="px-5 py-4 rounded-2xl rounded-tl-none bg-slate-900/40 border border-white/5 text-slate-200 text-sm shadow-xl leading-relaxed backdrop-blur-sm">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                        {streamContent}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Thinking/loading state indicator */}
                    {isStreaming && !streamContent && !executingTool && !pendingToolConfirm && (
                        <div className="flex gap-4 mr-auto">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                <Bot className="w-5 h-5 animate-pulse" />
                            </div>
                            <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl rounded-tl-none bg-slate-900/40 border border-white/5 text-slate-400 text-xs">
                                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                                <span>AI is processing command pipeline...</span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input form */}
                <div className="p-4 border-t border-amber-500/10 bg-slate-950/80 backdrop-blur-md">
                    <div className="max-w-4xl mx-auto flex items-end gap-3 relative">
                        <div className="flex-1 relative rounded-2xl border border-white/5 focus-within:border-amber-500/30 bg-slate-900 transition-all p-1.5 shadow-2xl">
                            <textarea
                                ref={textareaRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleTextareaKeyDown}
                                rows={1}
                                placeholder="Query tribe dynamics, install server configs, optimize memory settings..."
                                className="w-full pl-3 pr-12 py-2.5 text-sm bg-transparent border-none text-slate-100 placeholder-slate-500 focus:ring-0 focus:outline-none resize-none font-sans scrollbar-none max-h-48"
                                style={{ height: 'auto' }}
                                disabled={isStreaming}
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={!inputValue.trim() || isStreaming}
                                className={cn(
                                    "absolute right-3 bottom-3 p-2 rounded-xl border transition-all",
                                    inputValue.trim() && !isStreaming
                                        ? "bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400 active:scale-95"
                                        : "bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed"
                                )}
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="max-w-4xl mx-auto mt-2 flex items-center justify-between text-[10px] text-slate-500 px-2 font-mono">
                        <span className="flex items-center gap-1.5">
                            <Pin className="w-3 h-3 text-amber-400 animate-pulse" />
                            <span>System prompts mapped to current selected ASE instance</span>
                        </span>
                        <span>Press Enter to send, Shift + Enter for newline</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
