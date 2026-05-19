import { useState, useRef, useEffect } from 'react';
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
    const containerRef = useRef<HTMLDivElement>(null);

    const currentServer = displayServers.find(s => s.id === value);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center justify-between gap-3 px-5 py-2.5 bg-[#0A0F1C]/80 border border-white/5 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white focus:outline-none focus:ring-2 backdrop-blur-xl h-[42px] transition-all duration-300 min-w-[170px] cursor-pointer shadow-lg shadow-black/10 select-none",
                    activeTheme.border
                )}
            >
                <span className="truncate">{currentServer ? currentServer.name : 'Select Server'}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-300 flex-shrink-0", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-56 bg-slate-950 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 p-1.5">
                    {displayServers.map(server => {
                        const isSelected = server.id === value;
                        return (
                            <button
                                type="button"
                                key={server.id}
                                onClick={() => {
                                    onChange(server.id);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between cursor-pointer select-none",
                                    isSelected 
                                        ? activeTheme.active
                                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                )}
                            >
                                <span className="truncate mr-2">{server.name}</span>
                                {isSelected && <Check className={cn("w-3.5 h-3.5 flex-shrink-0", activeTheme.check)} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
