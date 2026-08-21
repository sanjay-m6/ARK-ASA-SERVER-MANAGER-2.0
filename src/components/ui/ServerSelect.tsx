import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { cn } from '../../utils/helpers';

interface ServerSelectProps {
    value: number | null;
    onChange: (id: number) => void;
    servers?: Array<{ id: number; name: string }>;
    accentColor?: 'amber' | 'blue' | 'purple' | 'sky' | 'emerald' | 'cyan';
    className?: string;
}

export default function ServerSelect({
    value,
    onChange,
    servers: customServers,
    accentColor = 'amber',
    className
}: ServerSelectProps) {
    const { servers: storeServers } = useServerStore();
    const displayServers = customServers || storeServers;
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<{ top: number; left: number; width: number; direction: 'up' | 'down' }>({
        top: 0,
        left: 0,
        width: 0,
        direction: 'down'
    });

    const currentServer = displayServers.find(s => s.id === value);

    const updateCoords = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            // Est. height of dropdown: padding + items * height
            const dropdownHeight = Math.min(300, (displayServers.length * 40) + 12);
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;

            let direction: 'up' | 'down' = 'down';
            if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                direction = 'up';
            }

            setCoords({
                top: direction === 'down' ? rect.bottom + window.scrollY : rect.top + window.scrollY - dropdownHeight - 8,
                left: rect.left + window.scrollX,
                width: rect.width,
                direction
            });
        }
    };

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                containerRef.current && 
                !containerRef.current.contains(event.target as Node) &&
                listRef.current &&
                !listRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Calculate coordinates when open
    useEffect(() => {
        if (isOpen) {
            updateCoords();
            window.addEventListener('resize', updateCoords);
            window.addEventListener('scroll', updateCoords, true);
        }
        return () => {
            window.removeEventListener('resize', updateCoords);
            window.removeEventListener('scroll', updateCoords, true);
        };
    }, [isOpen, displayServers.length]);

    // Track highlighted index & keyboard navigation
    useEffect(() => {
        if (isOpen) {
            const selectedIdx = displayServers.findIndex(s => s.id === value);
            setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
        }
    }, [isOpen, value, displayServers]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current && highlightedIndex >= 0) {
            const activeElement = listRef.current.children[highlightedIndex] as HTMLElement;
            if (activeElement) {
                activeElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev + 1) % displayServers.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev - 1 + displayServers.length) % displayServers.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (displayServers[highlightedIndex]) {
                onChange(displayServers[highlightedIndex].id);
                setIsOpen(false);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
        }
    };

    // Color theme mapping
    const themeStyles = {
        amber: {
            border: 'hover:border-amber-500/30 focus:ring-amber-500/40',
            active: 'bg-amber-500/20 text-amber-300 border-amber-500/20',
            check: 'text-amber-400'
        },
        blue: {
            border: 'hover:border-blue-500/30 focus:ring-blue-500/40',
            active: 'bg-blue-500/20 text-blue-300 border-blue-500/20',
            check: 'text-blue-400'
        },
        purple: {
            border: 'hover:border-purple-500/30 focus:ring-purple-500/40',
            active: 'bg-purple-500/20 text-purple-300 border-purple-500/20',
            check: 'text-purple-400'
        },
        sky: {
            border: 'hover:border-sky-500/30 focus:ring-sky-500/40',
            active: 'bg-sky-500/20 text-sky-300 border-sky-500/20',
            check: 'text-sky-400'
        },
        emerald: {
            border: 'hover:border-emerald-500/30 focus:ring-emerald-500/40',
            active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20',
            check: 'text-emerald-400'
        },
        cyan: {
            border: 'hover:border-cyan-500/30 focus:ring-cyan-500/40',
            active: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/20',
            check: 'text-cyan-400'
        }
    };

    const activeTheme = themeStyles[accentColor] || themeStyles.amber;

    if (displayServers.length === 0) return null;

    return (
        <div ref={containerRef} className={cn("relative flex-shrink-0", className)}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                className={cn(
                    "flex items-center justify-between gap-3 px-5 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] focus:outline-none focus:ring-2 backdrop-blur-xl h-[42px] transition-all duration-300 min-w-[170px] cursor-pointer shadow-lg select-none",
                    activeTheme.border
                )}
            >
                <span className="truncate">{currentServer ? currentServer.name : 'Select Server'}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-300 flex-shrink-0", isOpen && "rotate-180")} />
            </button>

            {isOpen && createPortal(
                <div 
                    ref={listRef}
                    style={{
                        position: 'absolute',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        zIndex: 9999,
                    }}
                    className={cn(
                        "bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl backdrop-blur-2xl p-1.5 overflow-y-auto max-h-[300px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent select-none transition-all duration-200 animate-in fade-in",
                        coords.direction === 'up' ? "slide-in-from-bottom-2" : "slide-in-from-top-2"
                    )}
                >
                    {displayServers.map((server, idx) => {
                        const isSelected = server.id === value;
                        const isHighlighted = idx === highlightedIndex;
                        return (
                            <button
                                type="button"
                                key={server.id}
                                onClick={() => {
                                    onChange(server.id);
                                    setIsOpen(false);
                                }}
                                onMouseEnter={() => setHighlightedIndex(idx)}
                                className={cn(
                                    "w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between cursor-pointer select-none",
                                    isSelected 
                                        ? activeTheme.active
                                        : isHighlighted
                                            ? "text-[var(--text-primary)] bg-[var(--surface-active)]"
                                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                                )}
                            >
                                <span className="truncate mr-2">{server.name}</span>
                                {isSelected && <Check className={cn("w-3.5 h-3.5 flex-shrink-0", activeTheme.check)} />}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
