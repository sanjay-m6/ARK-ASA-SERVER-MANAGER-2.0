import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../utils/helpers';
import { 
    BookOpen, 
    ChevronRight, 
    Hash, 
    Copy, 
    Check, 
    Info, 
    AlertTriangle, 
    Sparkles, 
    Clock, 
    FileText,
    ExternalLink
} from 'lucide-react';

interface HelpDocumentationProps {
    content: string;
    className?: string;
    title?: string;
    category?: string;
}

export default function HelpDocumentation({ content, className, title, category }: HelpDocumentationProps) {
    const [copiedContent, setCopiedContent] = useState(false);

    // Estimate read time (~200 wpm)
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const readTimeMins = Math.max(1, Math.ceil(wordCount / 200));

    const handleCopyAll = () => {
        navigator.clipboard.writeText(content);
        setCopiedContent(true);
        setTimeout(() => setCopiedContent(false), 2000);
    };

    return (
        <div className={cn("flex flex-col h-full bg-slate-900/60 rounded-2xl border border-white/[0.08] overflow-hidden backdrop-blur-xl shadow-2xl", className)}>
            {/* Top Article Header Bar */}
            <div className="px-8 py-6 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.03] via-slate-900/40 to-transparent flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-lg shadow-sky-500/5">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-1">
                            <span>Documentation</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-sky-400 font-semibold">{category || 'Knowledge Base'}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">{title || 'Guide'}</h2>
                    </div>
                </div>

                {/* Article Info & Quick Actions */}
                <div className="flex items-center gap-3 self-start md:self-auto text-xs text-slate-400">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/30 border border-white/[0.06]">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <span>{readTimeMins} min read</span>
                    </div>

                    <button
                        onClick={handleCopyAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white transition-all cursor-pointer"
                        title="Copy article markdown"
                    >
                        {copiedContent ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedContent ? 'Copied' : 'Copy'}</span>
                    </button>
                </div>
            </div>

            {/* Markdown Body Viewer */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 theme-scrollbar">
                <div className="max-w-4xl mx-auto">
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({ node, ...props }) => (
                                <div className="border-b border-white/10 pb-4 mb-6 mt-2">
                                    <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3" {...props}>
                                        {props.children}
                                    </h1>
                                </div>
                            ),
                            h2: ({ node, ...props }) => {
                                const id = String(props.children || '').toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                                return (
                                    <h2 id={id} {...props} className="group flex items-center gap-2.5 text-xl font-bold text-slate-100 mt-8 mb-4 border-l-4 border-sky-500 pl-3">
                                        <span>{props.children}</span>
                                        <Hash className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
                                    </h2>
                                );
                            },
                            h3: ({ node, ...props }) => (
                                <h3 className="text-base font-bold text-sky-300 mt-6 mb-3 flex items-center gap-2" {...props}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                    {props.children}
                                </h3>
                            ),
                            p: ({ node, ...props }) => (
                                <p className="text-slate-300 text-sm leading-relaxed mb-4 font-normal" {...props} />
                            ),
                            strong: ({ node, ...props }) => (
                                <strong className="text-white font-bold" {...props} />
                            ),
                            ul: ({ node, ...props }) => (
                                <ul className="space-y-2 mb-6 ml-1" {...props} />
                            ),
                            ol: ({ node, ...props }) => (
                                <ol className="space-y-2 mb-6 ml-1 list-decimal list-inside text-slate-300 text-sm" {...props} />
                            ),
                            li: ({ node, ...props }) => (
                                <li className="flex items-start gap-2.5 text-sm text-slate-300 leading-relaxed" {...props}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 mt-2 flex-shrink-0" />
                                    <span className="flex-1">{props.children}</span>
                                </li>
                            ),
                            blockquote: ({ node, ...props }) => {
                                const childrenText = String(props.children || '');
                                const isWarning = childrenText.toLowerCase().includes('warning') || childrenText.toLowerCase().includes('caution');
                                const isTip = childrenText.toLowerCase().includes('tip') || childrenText.toLowerCase().includes('note');
                                
                                return (
                                    <div className={cn(
                                        "my-5 p-4 rounded-xl border flex items-start gap-3.5 backdrop-blur-md text-sm leading-relaxed",
                                        isWarning 
                                            ? "bg-amber-500/10 border-amber-500/25 text-amber-200" 
                                            : isTip
                                            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-200"
                                            : "bg-sky-500/10 border-sky-500/25 text-sky-200"
                                    )}>
                                        {isWarning ? (
                                            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                        ) : isTip ? (
                                            <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                        ) : (
                                            <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1">{props.children}</div>
                                    </div>
                                );
                            },
                            code: ({ node, className, children, ...props }) => {
                                const match = /language-(\w+)/.exec(className || '');
                                const isInline = !match && !String(children).includes('\n');
                                
                                if (isInline) {
                                    return (
                                        <code className="text-sky-300 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                                            {children}
                                        </code>
                                    );
                                }

                                const codeString = String(children).replace(/\n$/, '');
                                return <CodeBlock code={codeString} lang={match ? match[1] : 'text'} />;
                            },
                            table: ({ node, ...props }) => (
                                <div className="my-6 overflow-x-auto rounded-xl border border-white/10 bg-black/40 shadow-xl">
                                    <table className="w-full text-left border-collapse text-xs" {...props} />
                                </div>
                            ),
                            th: ({ node, ...props }) => (
                                <th className="px-4 py-3 bg-white/[0.04] text-sky-400 font-bold uppercase tracking-wider border-b border-white/10" {...props} />
                            ),
                            td: ({ node, ...props }) => (
                                <td className="px-4 py-3 text-slate-300 border-b border-white/[0.04] leading-relaxed" {...props} />
                            ),
                            a: ({ node, ...props }) => (
                                <a className="text-sky-400 hover:text-sky-300 underline underline-offset-4 inline-flex items-center gap-1 transition-colors" target="_blank" rel="noopener noreferrer" {...props}>
                                    <span>{props.children}</span>
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            )
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                </div>
            </div>

            {/* Footer Bar */}
            <div className="px-8 py-3.5 border-t border-white/[0.06] bg-black/20 flex flex-wrap justify-between items-center text-[10px] text-slate-500 font-mono gap-2">
                <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-600" />
                    <span>ARK Server Manager Documentation</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Local Offline Docs • Synchronized</span>
                </div>
            </div>
        </div>
    );
}

// Inner Code Block component with Copy button & language tag
function CodeBlock({ code, lang }: { code: string; lang: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="my-5 rounded-xl border border-white/10 bg-[#090d16] overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] text-[11px] font-mono text-slate-400">
                <span className="font-bold text-sky-400 uppercase tracking-widest">{lang}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all text-[10px] font-medium cursor-pointer"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-slate-200 select-text">
                <code>{code}</code>
            </pre>
        </div>
    );
}
