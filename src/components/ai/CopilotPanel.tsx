import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Trash2, Loader2, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../utils/helpers';
import { useCopilotStore } from '../../stores/copilotStore';
import {
    type AiMessage,
    sendAiMessage,
    generateMessageId,
    TOOL_REGISTRY,
    executeToolCall,
} from '../../utils/aiAgent';
import { getPageConfig, buildCopilotSystemPrompt } from './contexts/pageContexts';
import { buildLiveContext } from './contexts/useCopilotContext';
import { CopilotMessage, CopilotStreamBubble } from './CopilotMessage';
import CopilotSuggestions from './CopilotSuggestions';

export default function CopilotPanel() {
    const navigate = useNavigate();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [input, setInput] = useState('');

    const {
        isOpen,
        close,
        messages,
        isStreaming,
        streamingContent,
        currentRoute,
        addMessage,
        clearMessages,
        setStreaming,
        setStreamingContent,
        loadHistory,
    } = useCopilotStore();

    const pageConfig = getPageConfig(currentRoute);

    // Load history on mount
    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Send message
    const handleSend = useCallback(async (overrideText?: string) => {
        const trimmed = (overrideText || input).trim();
        if (!trimmed || isStreaming) return;

        const userMsg: AiMessage = {
            id: generateMessageId(),
            role: 'user',
            content: trimmed,
            timestamp: Date.now(),
        };
        addMessage(userMsg);
        if (!overrideText) setInput('');

        const liveContext = buildLiveContext(currentRoute);
        const systemPrompt = buildCopilotSystemPrompt(pageConfig, liveContext);

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...useCopilotStore.getState().messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .slice(-10) // Keep last 10 messages for context window efficiency
                .map(m => ({ role: m.role, content: m.content })),
        ];

        setStreaming(true);
        setStreamingContent('');

        try {
            const model = localStorage.getItem('ai_model') || 'meta/llama-3.3-70b-instruct';
            const response = await sendAiMessage(apiMessages, model);

            // Handle tool calls
            if (response.tool_calls && response.tool_calls.length > 0) {
                const tc = response.tool_calls[0];
                const tool = TOOL_REGISTRY[tc.name];

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
                    addMessage({
                        id: generateMessageId(),
                        role: 'assistant',
                        content: `⚠️ **${tool.label}** requires confirmation. Please use the full AI Assistant for actions that need approval.\n\n👉 [Open AI Assistant](/tools/ai)`,
                        timestamp: Date.now(),
                    });
                } else {
                    // Auto-execute safe tools
                    const result = await executeToolCall(tc);
                    const followUpMessages = [
                        ...apiMessages,
                        { role: 'assistant', content: `I'll execute ${tool?.label || tc.name} now.` },
                        { role: 'user', content: `Tool "${tc.name}" returned:\n\`\`\`json\n${result.result}\n\`\`\`\n\nProvide a brief summary (2-3 sentences max).` },
                    ];

                    try {
                        const followUp = await sendAiMessage(followUpMessages, model);
                        addMessage({
                            id: generateMessageId(),
                            role: 'assistant',
                            content: followUp.content || (result.success ? '✅ Done.' : '❌ Failed.'),
                            timestamp: Date.now(),
                        });
                    } catch {
                        addMessage({
                            id: generateMessageId(),
                            role: 'assistant',
                            content: result.success ? `✅ **${tool?.label}** completed.` : `❌ **${tool?.label}** failed.`,
                            timestamp: Date.now(),
                        });
                    }
                }
            } else {
                addMessage({
                    id: generateMessageId(),
                    role: 'assistant',
                    content: response.content || 'No response.',
                    timestamp: Date.now(),
                });
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            addMessage({
                id: generateMessageId(),
                role: 'assistant',
                content: `⚠️ ${errorMsg}`,
                timestamp: Date.now(),
            });
        } finally {
            setStreaming(false);
            setStreamingContent('');
        }
    }, [input, isStreaming, currentRoute, pageConfig, addMessage, setStreaming, setStreamingContent]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        handleSend(suggestion);
    };

    if (!isOpen) return null;

    return (
        <div className="copilot-panel fixed top-28 right-20 z-[89] w-[340px] h-[520px] flex flex-col rounded-2xl bg-[#141b2d] border border-slate-700/60 shadow-2xl shadow-black/60 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">{pageConfig.icon}</span>
                    <div className="min-w-0">
                        <h3 className="text-[13px] font-bold text-white truncate">{pageConfig.name}</h3>
                        <p className="text-[9px] text-slate-500 truncate">Infinity AI • Context-aware</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => navigate('/tools/ai')}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
                        title="Open full AI Assistant"
                        aria-label="Open full AI Assistant"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={clearMessages}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Clear chat"
                        aria-label="Clear chat"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={close}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
                        title="Close"
                        aria-label="Close copilot"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Suggestions */}
            {messages.length === 0 && (
                <CopilotSuggestions
                    suggestions={pageConfig.suggestions}
                    onSelect={handleSuggestionClick}
                    disabled={isStreaming}
                />
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-hide">
                {messages.length === 0 && !isStreaming && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <span className="text-3xl mb-3">{pageConfig.icon}</span>
                        <p className="text-[12px] text-slate-400 max-w-[200px]">
                            Ask me anything about this page or use a suggestion above.
                        </p>
                    </div>
                )}

                {messages.map((msg) => (
                    <CopilotMessage key={msg.id} message={msg} />
                ))}

                {isStreaming && <CopilotStreamBubble content={streamingContent} />}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/5 p-2.5">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Ask ${pageConfig.name}...`}
                        rows={1}
                        className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-[13px] text-white placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-500/30 transition-all"
                        style={{ minHeight: '36px', maxHeight: '72px' }}
                        disabled={isStreaming}
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isStreaming}
                        className={cn(
                            "p-2 rounded-lg transition-all flex-shrink-0",
                            input.trim() && !isStreaming
                                ? "bg-cyan-500/90 text-white hover:bg-cyan-400/90"
                                : "bg-slate-800/50 text-slate-600 cursor-not-allowed"
                        )}
                        aria-label="Send message"
                    >
                        {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
                <p className="text-[9px] text-slate-600 mt-1.5 text-center">
                    Enter to send • Shift+Enter for newline
                </p>
            </div>
        </div>
    );
}
