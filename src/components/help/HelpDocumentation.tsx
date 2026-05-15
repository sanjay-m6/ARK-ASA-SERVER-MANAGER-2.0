import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../utils/helpers';
import { Book, ChevronRight, Hash } from 'lucide-react';

interface HelpDocumentationProps {
    content: string;
    className?: string;
    title?: string;
}

export default function HelpDocumentation({ content, className, title }: HelpDocumentationProps) {
    return (
        <div className={cn("flex flex-col h-full bg-dark-900/50 rounded-2xl border border-white/5 overflow-hidden backdrop-blur-xl", className)}>
            {/* Header */}
            <div className="px-8 py-6 border-b border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        <Book className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 tracking-widest uppercase mb-1">
                            <span>Documentation</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-sky-400">Knowledge Base</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">{title || 'Guide'}</h2>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className="max-w-4xl mx-auto prose prose-invert prose-sky prose-headings:font-display prose-headings:font-bold prose-h1:text-4xl prose-h2:text-2xl prose-h2:border-b prose-h2:border-white/5 prose-h2:pb-2 prose-h3:text-xl prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-300 prose-code:text-sky-300 prose-code:bg-sky-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-slate-900/80 prose-pre:border prose-pre:border-white/5 prose-pre:rounded-xl prose-table:border prose-table:border-white/5 prose-th:bg-white/5 prose-th:p-4 prose-td:p-4 prose-td:border-t prose-td:border-white/5">
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h2: ({node, ...props}) => (
                                <h2 id={props.children?.toString().toLowerCase().replace(/\s+/g, '-')} {...props} className="group flex items-center gap-2">
                                    {props.children}
                                    <Hash className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
                                </h2>
                            ),
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                </div>
            </div>

            {/* Footer / Status */}
            <div className="px-8 py-4 border-t border-white/5 bg-white/[0.01] flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <span>© ARK Manager Documentation System v2.0</span>
                <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                    Local Cache Synchronized
                </span>
            </div>
        </div>
    );
}
