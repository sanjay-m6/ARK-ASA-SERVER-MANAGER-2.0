import { useState, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/helpers';

interface LaunchArgsEditorProps {
    value: string;
    onChange: (value: string) => void;
    accentColor?: 'red' | 'amber' | 'orange' | 'cyan';
    placeholder?: string;
}

/**
 * Tag/chip-based launch arguments editor (Steam-style).
 *
 * Stores args as a space-separated string for backend compatibility,
 * but renders each argument as an individually removable chip.
 */
export default function LaunchArgsEditor({
    value,
    onChange,
    accentColor = 'red',
    placeholder = '-NoBattlEye',
}: LaunchArgsEditorProps) {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const args = value
        .split(/\s+/)
        .filter(Boolean);

    const colorMap = {
        red: {
            ring: 'ring-red-500/40',
            border: 'border-red-500/30',
            chip: 'bg-red-500/10 border-red-500/20 text-red-300',
            chipHover: 'hover:bg-red-500/20 hover:border-red-500/30',
            close: 'hover:bg-red-500/30 text-red-400',
            addBtn: 'text-red-400 hover:bg-red-500/10',
            glow: 'shadow-red-500/5',
        },
        amber: {
            ring: 'ring-amber-500/40',
            border: 'border-amber-500/30',
            chip: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
            chipHover: 'hover:bg-amber-500/20 hover:border-amber-500/30',
            close: 'hover:bg-amber-500/30 text-amber-400',
            addBtn: 'text-amber-400 hover:bg-amber-500/10',
            glow: 'shadow-amber-500/5',
        },
        orange: {
            ring: 'ring-orange-500/40',
            border: 'border-orange-500/30',
            chip: 'bg-orange-500/10 border-orange-500/20 text-orange-300',
            chipHover: 'hover:bg-orange-500/20 hover:border-orange-500/30',
            close: 'hover:bg-orange-500/30 text-orange-400',
            addBtn: 'text-orange-400 hover:bg-orange-500/10',
            glow: 'shadow-orange-500/5',
        },
        cyan: {
            ring: 'ring-cyan-500/40',
            border: 'border-cyan-500/30',
            chip: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',
            chipHover: 'hover:bg-cyan-500/20 hover:border-cyan-500/30',
            close: 'hover:bg-cyan-500/30 text-cyan-400',
            addBtn: 'text-cyan-400 hover:bg-cyan-500/10',
            glow: 'shadow-cyan-500/5',
        },
    };

    const colors = colorMap[accentColor] || colorMap.red;


    const handleRemoveArg = (indexToRemove: number) => {
        const newArgs = args.filter((_, idx) => idx !== indexToRemove);
        onChange(newArgs.join(' '));
    };

    const handleClear = () => {
        onChange('');
        inputRef.current?.focus();
    };

    return (
        <div className="space-y-3">
            {/* Active Chips List */}
            {args.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl">
                    {args.map((arg, idx) => (
                        <div
                            key={`${arg}-${idx}`}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all',
                                colors.chip,
                                colors.chipHover
                            )}
                        >
                            <span>{arg}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveArg(idx)}
                                className={cn('p-0.5 rounded transition-colors', colors.close)}
                                title={`Remove ${arg}`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div
                className={cn(
                    'relative flex items-center bg-[var(--surface)] border rounded-lg transition-all duration-200 overflow-hidden',
                    isFocused
                        ? `${colors.border} ring-1 ${colors.ring} ${colors.glow} shadow-lg`
                        : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                )}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder={placeholder}
                    spellCheck={false}
                    className="flex-1 w-full bg-transparent text-[var(--text-primary)] text-sm font-mono px-4 py-3 outline-none placeholder:text-[var(--text-muted)]"
                    aria-label="Launch arguments"
                />
                
                {value && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className={cn(
                            'absolute right-2 p-1.5 rounded-md transition-colors opacity-70 hover:opacity-100',
                            colors.close
                        )}
                        title="Clear all arguments"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="flex items-center justify-between">
                <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                    Steam-style command line parameters (space separated)
                </p>
                {args.length > 0 && (
                    <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        {args.length} arg{args.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {args.some(a => !a.startsWith('-') && !a.includes('=')) && (
                <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Some arguments don't start with a dash (-). This may be intentional for travel URL parameters.
                </div>
            )}
        </div>
    );
}
