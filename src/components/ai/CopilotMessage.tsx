import { Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AiMessage } from '../../utils/aiAgent';
import { cn } from '../../utils/helpers';

// Compact markdown components for the copilot panel
const CompactMarkdown: import('react-markdown').Components = {
    p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed text-[13px]">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-[13px]">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-[13px]">{children}</ol>,
    li: ({ children }) => <li className="marker:text-cyan-500/50">{children}</li>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">{children}</a>,
    strong: ({ children }) => <strong className="font-bold text-cyan-300">{children}</strong>,
    code: (props: any) => {
        const { className, children } = props;
        const match = /language-(\w+)/.exec(className || '');
        if (!match) {
            return <code className="bg-black/30 text-cyan-200 px-1 py-0.5 rounded text-[12px] font-mono border border-white/5">{children}</code>;
        }
        return (
            <div className="my-2 overflow-hidden rounded-lg border border-white/10 bg-[#0d1117]">
                <div className="bg-white/5 px-3 py-1 border-b border-white/10 text-[10px] text-slate-400 font-mono">{match[1]}</div>
                <div className="overflow-x-auto p-3 text-[12px] font-mono text-slate-300">
                    <pre><code>{children}</code></pre>
                </div>
            </div>
        );
    },
    h1: ({ children }) => <h1 className="text-sm font-bold text-white mb-1.5 mt-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-[13px] font-bold text-white mb-1 mt-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-[13px] font-bold text-white mb-1 mt-1.5">{children}</h3>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-cyan-500/50 pl-3 py-0.5 my-2 text-slate-400 italic text-[12px]">{children}</blockquote>,
};

export function CopilotMessage({ message }: { message: AiMessage }) {
    const isUser = message.role === 'user';

    if (message.role === 'tool') return null;

    return (
        <div className={cn("flex px-3 py-1", isUser ? "justify-end" : "justify-start")}>
            <div className={cn(
                "max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                isUser
                    ? "bg-cyan-600/20 border border-cyan-500/15 text-white"
                    : "bg-white/[0.03] border border-white/5 text-slate-200"
            )}>
                {!isUser && (
                    <div className="flex items-center gap-1 mb-1">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider">AI</span>
                    </div>
                )}
                {isUser ? (
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                ) : (
                    <div className="break-words max-w-full overflow-hidden">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={CompactMarkdown}>
                            {message.content}
                        </ReactMarkdown>
                    </div>
                )}
                <div className={cn(
                    "text-[9px] mt-1 font-mono",
                    isUser ? "text-cyan-400/30 text-right" : "text-slate-600"
                )}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                </div>
            </div>
        </div>
    );
}

export function CopilotStreamBubble({ content }: { content: string }) {
    return (
        <div className="flex justify-start px-3 py-1">
            <div className="max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-relaxed bg-white/[0.03] border border-white/5 text-slate-200">
                <div className="flex items-center gap-1 mb-1">
                    <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
                    <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider">AI</span>
                </div>
                {content ? (
                    <div className="break-words max-w-full overflow-hidden">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={CompactMarkdown}>
                            {content}
                        </ReactMarkdown>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-slate-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-[11px]">Thinking...</span>
                    </div>
                )}
            </div>
        </div>
    );
}
