import { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/helpers';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    readOnly?: boolean;
}

export const CodeEditor = ({ value, onChange, className, readOnly = false }: CodeEditorProps) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const [lineCount, setLineCount] = useState(1);

    useEffect(() => {
        const lines = value.split('\n').length;
        setLineCount(lines);
    }, [value]);

    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    return (
        <div className={cn("flex h-full font-mono text-sm bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg overflow-hidden relative group", className)}>
            {/* Line Numbers */}
            <div
                ref={lineNumbersRef}
                className="flex-shrink-0 bg-[var(--surface)] text-[var(--text-muted)] text-right pr-3 pl-2 py-4 select-none border-r border-[var(--border)] overflow-hidden"
                style={{ width: '3.5rem', fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
            >
                {Array.from({ length: Math.max(1, lineCount) }).map((_, i) => (
                    <div key={i} className="leading-6 h-6">{i + 1}</div>
                ))}
            </div>

            {/* Text Area */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => !readOnly && onChange(e.target.value)}
                onScroll={handleScroll}
                readOnly={readOnly}
                className={cn(
                    "flex-1 bg-transparent p-4 text-[var(--text-primary)] outline-none resize-none leading-6 whitespace-pre",
                    "font-[Consolas,Monaco,'Courier_New',monospace] selection:bg-purple-500/30"
                )}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
            />
        </div>
    );
};
