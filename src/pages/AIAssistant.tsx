import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Send, Trash2, Loader2, CheckCircle, XCircle, AlertTriangle, Sparkles, ChevronDown, Wrench } from 'lucide-react';
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
    buildSystemPrompt,
    sendAiMessage,
    executeToolCall,
    generateMessageId,
} from '../utils/aiAgent';

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

    return (
        <div className="mx-4 my-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-amber-300">Action Requires Confirmation</h4>
                    <p className="text-xs text-slate-400 mt-1">
                        <span className="text-amber-400 font-semibold">{tool?.label || toolCall.name}</span>
                        {Object.keys(parsedArgs).length > 0 && (
                            <span className="ml-1">— {Object.entries(parsedArgs).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>
                        )}
                    </p>
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={onConfirm}
                            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-all"
                        >
                            Approve & Execute
                        </button>
                        <button
                            onClick={onDeny}
                            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600/30 transition-all"
                        >
                            Deny
                        </button>
                    </div>
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
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border",
            success
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>
            {success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            <Wrench className="w-3 h-3" />
            {tool?.label || name}
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

// ── Streaming Indicator ────────────────────────────────────────────────

function StreamingBubble({ content }: { content: string }) {
    return (
        <div className="flex justify-start px-6 py-2">
            <div className="max-w-[75%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed glass-panel border-white/5 text-slate-200">
                <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Infinity AI</span>
                </div>
                {content ? (
                    <div className="break-words max-w-full overflow-hidden">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {content}
                        </ReactMarkdown>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Thinking...</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function AIAssistant() {
    const { t } = useTranslation();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [input, setInput] = useState('');
    const [modelOpen, setModelOpen] = useState(false);

    const {
        messages,
        isStreaming,
        streamingContent,
        pendingToolCall,
        model,
        addMessage,
        clearMessages,
        setStreaming,
        setStreamingContent,
        appendStreamingContent,
        setPendingToolCall,
        setModel,
        loadHistory,

    } = useAiStore();

    // Load history on mount
    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent, pendingToolCall]);

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

        try {
            // Try non-streaming first (for tool calls)
            const response = await sendAiMessage(apiMessages, model);

            // Handle tool calls
            if (response.tool_calls && response.tool_calls.length > 0) {
                const tc = response.tool_calls[0];
                const tool = TOOL_REGISTRY[tc.name];

                // Add AI's explanation if present
                if (response.content) {
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
                } else {
                    // Auto-execute safe tools
                    setStreaming(false);
                    setStreamingContent('');
                    await executeAndReport(tc, apiMessages);
                }
            } else {
                // Regular text response
                addMessage({
                    id: generateMessageId(),
                    role: 'assistant',
                    content: response.content || 'No response from AI.',
                    timestamp: Date.now(),
                });
                setStreaming(false);
                setStreamingContent('');
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
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

    // Execute tool and send result back to AI for follow-up
    const executeAndReport = async (tc: AiToolCall, apiMessages: { role: string; content: string }[]) => {
        setStreaming(true);

        const result = await executeToolCall(tc);

        // Add tool result as a message
        addMessage({
            id: generateMessageId(),
            role: 'tool',
            content: JSON.stringify({ success: result.success, toolName: tc.name }),
            toolCallId: tc.id,
            timestamp: Date.now(),
        });

        // Send result back to AI for a follow-up explanation
        const followUpMessages = [
            ...apiMessages,
            { role: 'assistant', content: `I'll execute ${TOOL_REGISTRY[tc.name]?.label || tc.name} now.` },
            { role: 'user', content: `Tool "${tc.name}" returned:\n\`\`\`json\n${result.result}\n\`\`\`\n\nProvide a brief, friendly summary of the result.` },
        ];

        try {
            const followUp = await sendAiMessage(followUpMessages, model);
            addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: followUp.content || (result.success ? '✅ Action completed successfully.' : '❌ Action failed.'),
                timestamp: Date.now(),
            });
        } catch {
            addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: result.success
                    ? `✅ **${TOOL_REGISTRY[tc.name]?.label}** completed successfully.`
                    : `❌ **${TOOL_REGISTRY[tc.name]?.label}** failed: ${result.result}`,
                timestamp: Date.now(),
            });
        }

        setStreaming(false);
        setStreamingContent('');
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

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-2 pb-6">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-cyan-500/30 blur-xl rounded-full opacity-60"></div>
                        <div className="relative p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20">
                            <Bot className="w-7 h-7 text-cyan-400" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">{t('aiAssistant.title', 'Infinity AI')}</h1>
                        <p className="text-sm text-slate-400">{t('aiAssistant.subtitle', 'Autonomous server management assistant')}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Model Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setModelOpen(!modelOpen)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
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
                        className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
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

                    {isStreaming && <StreamingBubble content={streamingContent} />}

                    {pendingToolCall && (
                        <ToolConfirmation
                            toolCall={pendingToolCall}
                            onConfirm={handleConfirmTool}
                            onDeny={handleDenyTool}
                        />
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Bar */}
                <div className="border-t border-white/5 p-4">
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
                        Press Enter to send · Shift+Enter for new line · Powered by NVIDIA AI
                    </p>
                </div>
            </div>
        </div>
    );
}
