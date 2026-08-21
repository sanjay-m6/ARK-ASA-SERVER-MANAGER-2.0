import React, { useState, useEffect, useMemo } from 'react';
import { 
  Laptop, Gamepad2, Smartphone, Monitor, ShieldCheck, Terminal, 
  Check, Info, Copy, CheckCheck, Sparkles, Layers, Globe
} from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { updateServerSettings } from '../../utils/tauri';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';

export interface PlatformSelection {
    pc: boolean;
    ps5: boolean;
    xbox: boolean;
    msStore: boolean;
}

export function parsePlatformSelection(customArgs: string | undefined): PlatformSelection {
    if (!customArgs || !customArgs.trim()) {
        // Default in ASA: Full Crossplay enabled
        return { pc: true, ps5: true, xbox: true, msStore: true };
    }

    const args = customArgs.trim().split(/\s+/);
    const platformArg = args.find(a => a.toLowerCase().startsWith('-serverplatform='));

    if (platformArg) {
        const val = platformArg.substring('-serverplatform='.length).toUpperCase();
        if (val === 'ALL') {
            return { pc: true, ps5: true, xbox: true, msStore: true };
        }
        const parts = val.split('+');
        return {
            pc: parts.includes('PC') || parts.includes('ALL'),
            ps5: parts.includes('PS5') || parts.includes('ALL'),
            xbox: parts.includes('XSX') || parts.includes('XBOX') || parts.includes('ALL'),
            msStore: parts.includes('WINGDK') || parts.includes('MSSTORE') || parts.includes('MICROSOFTSTORE') || parts.includes('ALL')
        };
    }

    const hasCrossplay = args.some(a => a.toLowerCase() === '-crossplay');
    const hasPcOnly = args.some(a => a.toLowerCase() === '-useserverpconly');

    if (hasPcOnly) {
        return { pc: true, ps5: false, xbox: false, msStore: false };
    }
    if (hasCrossplay) {
        return { pc: true, ps5: true, xbox: true, msStore: true };
    }

    return { pc: true, ps5: true, xbox: true, msStore: true };
}

export function buildPlatformCustomArgs(currentArgs: string | undefined, selection: PlatformSelection): string {
    const raw = currentArgs || '';
    let args = raw.trim().split(/\s+/).filter(a =>
        a &&
        !a.toLowerCase().startsWith('-serverplatform=') &&
        a.toLowerCase() !== '-useserverpconly' &&
        a.toLowerCase() !== '-crossplay'
    );

    const activePlatforms: string[] = [];
    if (selection.pc) activePlatforms.push('PC');
    if (selection.ps5) activePlatforms.push('PS5');
    if (selection.xbox) activePlatforms.push('XSX');
    if (selection.msStore) activePlatforms.push('WinGDK');

    if (activePlatforms.length === 4) {
        // Official ASA standard for open crossplay across all platforms
        args.push('-ServerPlatform=ALL');
        args.push('-crossplay');
    } else if (activePlatforms.length === 1 && activePlatforms[0] === 'PC') {
        // Official ASA standard for PC Only Mode
        args.push('-ServerPlatform=PC');
        args.push('-UseServerPCOnly');
    } else if (activePlatforms.length > 0) {
        args.push(`-ServerPlatform=${activePlatforms.join('+')}`);
    }

    return args.join(' ').trim();
}

interface PlatformSelectorProps {
    serverId?: number | null;
    customArgs?: string;
    onChange?: (newCustomArgs: string) => void;
    compact?: boolean;
}

export const PlatformSelector: React.FC<PlatformSelectorProps> = ({
    serverId,
    customArgs: externalCustomArgs,
    onChange,
    compact = false
}) => {
    const { servers, activeServer, refreshServers } = useServerStore();
    const targetServerId = serverId ?? activeServer?.id;
    const server = servers.find(s => s.id === targetServerId);
    const [copied, setCopied] = useState(false);

    const effectiveCustomArgs = externalCustomArgs !== undefined 
        ? externalCustomArgs 
        : (server?.config?.customArgs || server?.config?.custom_args || '');

    const [selection, setSelection] = useState<PlatformSelection>(() =>
        parsePlatformSelection(effectiveCustomArgs)
    );

    useEffect(() => {
        setSelection(parsePlatformSelection(effectiveCustomArgs));
    }, [effectiveCustomArgs]);

    const activeCount = useMemo(() => Object.values(selection).filter(Boolean).length, [selection]);

    const generatedFlag = useMemo(() => {
        const activePlatforms: string[] = [];
        if (selection.pc) activePlatforms.push('PC');
        if (selection.ps5) activePlatforms.push('PS5');
        if (selection.xbox) activePlatforms.push('XSX');
        if (selection.msStore) activePlatforms.push('WinGDK');

        if (activePlatforms.length === 4) return '-ServerPlatform=ALL -crossplay';
        if (activePlatforms.length === 1 && activePlatforms[0] === 'PC') return '-ServerPlatform=PC -UseServerPCOnly';
        if (activePlatforms.length === 0) return 'None (All Blocked)';
        return `-ServerPlatform=${activePlatforms.join('+')}`;
    }, [selection]);

    const handleCopyFlag = () => {
        navigator.clipboard.writeText(generatedFlag);
        setCopied(true);
        toast.success('Launch flag copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleToggle = async (key: keyof PlatformSelection) => {
        const newSelection = { ...selection, [key]: !selection[key] };
        
        if (!newSelection.pc && !newSelection.ps5 && !newSelection.xbox && !newSelection.msStore) {
            toast.error('At least one platform must remain enabled.');
            return;
        }

        setSelection(newSelection);
        const newCustomArgs = buildPlatformCustomArgs(effectiveCustomArgs, newSelection);

        if (onChange) {
            onChange(newCustomArgs);
        }

        if (targetServerId && externalCustomArgs === undefined) {
            try {
                await updateServerSettings({
                    serverId: targetServerId,
                    customArgs: newCustomArgs
                });
                await refreshServers();
                toast.success('Platform settings updated!');
            } catch (err) {
                console.error(err);
                toast.error('Failed to update platform settings');
            }
        }
    };

    const applyPreset = (preset: 'fullCrossplay' | 'pcOnly' | 'consolesOnly' | 'allPcClients') => {
        let newSel: PlatformSelection;
        switch (preset) {
            case 'fullCrossplay':
                newSel = { pc: true, ps5: true, xbox: true, msStore: true };
                break;
            case 'pcOnly':
                newSel = { pc: true, ps5: false, xbox: false, msStore: false };
                break;
            case 'consolesOnly':
                newSel = { pc: false, ps5: true, xbox: true, msStore: false };
                break;
            case 'allPcClients':
                newSel = { pc: true, ps5: false, xbox: false, msStore: true };
                break;
        }
        setSelection(newSel);
        const newCustomArgs = buildPlatformCustomArgs(effectiveCustomArgs, newSel);
        if (onChange) onChange(newCustomArgs);
        if (targetServerId && externalCustomArgs === undefined) {
            updateServerSettings({ serverId: targetServerId, customArgs: newCustomArgs }).then(refreshServers);
            toast.success('Preset applied!');
        }
    };

    const isFullCrossplay = selection.pc && selection.ps5 && selection.xbox && selection.msStore;
    const isPcOnly = selection.pc && !selection.ps5 && !selection.xbox && !selection.msStore;
    const isConsolesOnly = !selection.pc && selection.ps5 && selection.xbox && !selection.msStore;
    const isAllPcClients = selection.pc && !selection.ps5 && !selection.xbox && selection.msStore;

    const platformCards = [
        {
            id: 'pc' as const,
            name: 'PC (Steam & Epic)',
            tag: 'Steam + Epic Games',
            flagCode: 'PC',
            desc: 'Windows Steam & Epic Games Store players',
            icon: Laptop,
            activeTheme: {
                bg: 'bg-cyan-950/30 hover:bg-cyan-950/40',
                border: 'border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30',
                iconBox: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-sm',
                badge: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
                toggle: 'bg-cyan-500 shadow-cyan-500/40',
                dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
            }
        },
        {
            id: 'ps5' as const,
            name: 'PlayStation 5',
            tag: 'PS5 Console',
            flagCode: 'PS5',
            desc: 'PlayStation 5 cross-network console survivors',
            icon: Gamepad2,
            activeTheme: {
                bg: 'bg-blue-950/30 hover:bg-blue-950/40',
                border: 'border-blue-500/50 shadow-[0_0_25px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/30',
                iconBox: 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-sm',
                badge: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
                toggle: 'bg-blue-500 shadow-blue-500/40',
                dot: 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]'
            }
        },
        {
            id: 'xbox' as const,
            name: 'Xbox Series X/S',
            tag: 'Xbox XSX | XSS',
            flagCode: 'XSX',
            desc: 'Xbox Series X and Series S console players',
            icon: Smartphone,
            activeTheme: {
                bg: 'bg-emerald-950/30 hover:bg-emerald-950/40',
                border: 'border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30',
                iconBox: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm',
                badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
                toggle: 'bg-emerald-500 shadow-emerald-500/40',
                dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
            }
        },
        {
            id: 'msStore' as const,
            name: 'Microsoft Store',
            tag: 'WinGDK / Xbox App',
            flagCode: 'WinGDK',
            desc: 'PC Xbox App & Windows GDK store clients',
            icon: Monitor,
            activeTheme: {
                bg: 'bg-sky-950/30 hover:bg-sky-950/40',
                border: 'border-sky-500/50 shadow-[0_0_25px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/30',
                iconBox: 'bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-sm',
                badge: 'bg-sky-500/15 border-sky-500/30 text-sky-300',
                toggle: 'bg-sky-500 shadow-sky-500/40',
                dot: 'bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.8)]'
            }
        }
    ];

    if (compact) {
        return (
            <div className="glass-panel rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-violet-400" /> Platform Compatibility
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30 font-semibold">
                        {activeCount}/4 Enabled
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {platformCards.map(p => {
                        const Icon = p.icon;
                        const isChecked = selection[p.id];
                        return (
                            <button
                                type="button"
                                key={p.id}
                                onClick={() => handleToggle(p.id)}
                                className={cn(
                                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all duration-200 text-left cursor-pointer",
                                    isChecked
                                        ? "bg-violet-600/20 border-violet-500/50 text-[var(--text-primary)] shadow-sm"
                                        : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                                )}
                            >
                                <div className={cn(
                                    "w-4 h-4 rounded-md flex items-center justify-center border transition-all",
                                    isChecked ? "bg-violet-600 border-violet-400 text-white" : "border-[var(--border)] bg-[var(--surface)]"
                                )}>
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
                                <span className="truncate">{p.name.split(' ')[0]}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="relative glass-panel rounded-3xl p-6 shadow-2xl space-y-6 overflow-hidden">
            {/* Ambient Background Glow Spots */}
            <div className="absolute -top-24 -right-24 w-80 h-80 bg-violet-600/15 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-cyan-600/10 blur-3xl rounded-full pointer-events-none" />

            {/* Header Section */}
            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5 border-b border-[var(--border)] pb-5">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 border border-violet-400/30 flex items-center justify-center shadow-lg shadow-violet-600/30 shrink-0">
                        <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                                Platform Access Control
                            </h3>
                            <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1.5",
                                isFullCrossplay
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                    : isPcOnly
                                    ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                                    : "bg-violet-500/15 border-violet-500/30 text-violet-400"
                            )}>
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    isFullCrossplay ? "bg-emerald-400" : isPcOnly ? "bg-cyan-400" : "bg-violet-400"
                                )} />
                                {isFullCrossplay ? 'Full Crossplay' : isPcOnly ? 'PC Exclusive' : isConsolesOnly ? 'Consoles Only' : `Custom (${activeCount}/4)`}
                            </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed max-w-2xl">
                            Control multi-platform player connectivity with native Unreal Engine <code className="text-violet-400 font-mono bg-[var(--surface-hover)] px-1.5 py-0.5 rounded border border-[var(--border)]">-ServerPlatform</code> arguments.
                        </p>
                    </div>
                </div>

                {/* 1-Click Fast Presets */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1 mr-1">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" /> Presets:
                    </span>

                    <button
                        type="button"
                        onClick={() => applyPreset('fullCrossplay')}
                        className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 flex items-center gap-1.5 cursor-pointer",
                            isFullCrossplay
                                ? "bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-600/30"
                                : "bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        <Globe className="w-3.5 h-3.5" /> Full Crossplay
                    </button>

                    <button
                        type="button"
                        onClick={() => applyPreset('pcOnly')}
                        className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 flex items-center gap-1.5 cursor-pointer",
                            isPcOnly
                                ? "bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-600/30"
                                : "bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        <Laptop className="w-3.5 h-3.5" /> PC Only
                    </button>

                    <button
                        type="button"
                        onClick={() => applyPreset('consolesOnly')}
                        className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 flex items-center gap-1.5 cursor-pointer",
                            isConsolesOnly
                                ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30"
                                : "bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        <Gamepad2 className="w-3.5 h-3.5" /> Consoles Only
                    </button>

                    <button
                        type="button"
                        onClick={() => applyPreset('allPcClients')}
                        className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 flex items-center gap-1.5 cursor-pointer",
                            isAllPcClients
                                ? "bg-sky-600 border-sky-400 text-white shadow-lg shadow-sky-600/30"
                                : "bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        <Layers className="w-3.5 h-3.5" /> All PC Stores
                    </button>
                </div>
            </div>

            {/* Platform Selection Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {platformCards.map(p => {
                    const Icon = p.icon;
                    const isChecked = selection[p.id];

                    return (
                        <div
                            key={p.id}
                            onClick={() => handleToggle(p.id)}
                            className={cn(
                                "group relative p-5 rounded-2xl border transition-all duration-200 cursor-pointer select-none flex flex-col justify-between min-h-[195px] hover:scale-[1.01] active:scale-[0.99]",
                                isChecked
                                    ? "bg-sky-500/10 border-sky-500/40 shadow-[0_0_20px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/20"
                                    : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] shadow-md"
                            )}
                        >
                            {/* Top row: Brand Icon & Deterministic iOS-style Pill Switch */}
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-all",
                                    isChecked
                                        ? "bg-sky-500/20 border-sky-500/40 text-sky-400 shadow-sm"
                                        : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                                )}>
                                    <Icon className="w-5 h-5" />
                                </div>

                                {/* Deterministic iOS-style Pill Switch */}
                                <div className={cn(
                                    "w-11 h-6 rounded-full p-0.5 transition-all duration-200 ease-in-out relative border shrink-0",
                                    isChecked
                                        ? "bg-sky-500 border-sky-400 shadow-sm"
                                        : "bg-[var(--surface-hover)] border-[var(--border)]"
                                )}>
                                    <div className={cn(
                                        "w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center transition-all duration-200 ease-out",
                                        isChecked ? "translate-x-5" : "translate-x-0"
                                    )}>
                                        {isChecked ? (
                                            <Check className="w-3 h-3 text-slate-900 stroke-[3]" />
                                        ) : (
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Middle row: Platform Name, Tag, Description */}
                            <div className="space-y-1.5 mb-3.5 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-sm font-bold tracking-tight text-[var(--text-primary)] truncate">
                                        {p.name}
                                    </h4>
                                </div>
                                <span className={cn(
                                    "inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border",
                                    isChecked ? "bg-sky-500/15 border-sky-500/30 text-sky-400" : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]"
                                )}>
                                    {p.tag}
                                </span>
                                <p className="text-xs text-[var(--text-secondary)] leading-snug pt-0.5 line-clamp-2">
                                    {p.desc}
                                </p>
                            </div>

                            {/* Bottom row: Status & Engine Tag */}
                            <div className="pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-xs font-mono">
                                <div className="flex items-center gap-2">
                                    <span className={cn("w-2 h-2 rounded-full", isChecked ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-slate-400")} />
                                    <span className={isChecked ? "text-emerald-500 font-bold" : "text-[var(--text-muted)] font-medium"}>
                                        {isChecked ? 'Allowed' : 'Blocked'}
                                    </span>
                                </div>
                                <span className={cn(
                                    "px-2 py-0.5 rounded border text-[10px] font-bold",
                                    isChecked
                                        ? "bg-sky-500/20 border-sky-500/30 text-sky-400 shadow-sm"
                                        : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]"
                                )}>
                                    {p.flagCode}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Generated Command Preview Box */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                        <Terminal className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                            Active Generated Engine Flag
                        </span>
                        <code className="text-xs font-mono font-bold text-emerald-500 truncate block">
                            {generatedFlag}
                        </code>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <button
                        type="button"
                        onClick={handleCopyFlag}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)] flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Copy launch flag"
                    >
                        {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <div className="text-[11px] text-[var(--text-muted)] hidden md:flex items-center gap-1.5 border-l border-[var(--border)] pl-2.5">
                        <Info className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                        Auto-injected on launch
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlatformSelector;
