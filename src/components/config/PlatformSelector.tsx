import React, { useState, useEffect, useMemo } from 'react';
import { 
  Laptop, Gamepad2, Smartphone, Monitor, ShieldCheck, Terminal, 
  Check, Info
} from 'lucide-react';
import { useServerStore } from '../../stores/serverStore';
import { updateServerSettings } from '../../utils/tauri';
import toast from 'react-hot-toast';

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

        if (activePlatforms.length === 4) return '-ServerPlatform=ALL -crossplay (Full Crossplay)';
        if (activePlatforms.length === 1 && activePlatforms[0] === 'PC') return '-ServerPlatform=PC -UseServerPCOnly (PC Exclusive)';
        if (activePlatforms.length === 0) return 'None (Blocked)';
        return `-ServerPlatform=${activePlatforms.join('+')}`;
    }, [selection]);

    const handleToggle = async (key: keyof PlatformSelection) => {
        const newSelection = { ...selection, [key]: !selection[key] };
        
        if (!newSelection.pc && !newSelection.ps5 && !newSelection.xbox && !newSelection.msStore) {
            toast.error('At least one target platform must remain enabled.');
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
                toast.success('Platform launch options saved!');
            } catch (err) {
                console.error(err);
                toast.error('Failed to update platform settings');
            }
        }
    };

    const applyPreset = (preset: 'pcOnly' | 'fullCrossplay' | 'consolesPlusPc' | 'steamEpicOnly') => {
        let newSel: PlatformSelection;
        switch (preset) {
            case 'pcOnly':
                newSel = { pc: true, ps5: false, xbox: false, msStore: false };
                break;
            case 'fullCrossplay':
                newSel = { pc: true, ps5: true, xbox: true, msStore: true };
                break;
            case 'consolesPlusPc':
                newSel = { pc: true, ps5: true, xbox: true, msStore: false };
                break;
            case 'steamEpicOnly':
                newSel = { pc: true, ps5: false, xbox: false, msStore: false };
                break;
        }
        setSelection(newSel);
        const newCustomArgs = buildPlatformCustomArgs(effectiveCustomArgs, newSel);
        if (onChange) onChange(newCustomArgs);
        if (targetServerId && externalCustomArgs === undefined) {
            updateServerSettings({ serverId: targetServerId, customArgs: newCustomArgs }).then(refreshServers);
        }
    };

    const platformCards = [
        {
            id: 'pc' as const,
            name: 'PC (Steam & Epic)',
            tag: 'Steam / Epic',
            flagCode: 'PC',
            desc: 'Windows Steam & Epic Games Store players',
            icon: Laptop,
            activeGradient: 'from-blue-600/30 via-cyan-600/20 to-slate-900',
            activeBorder: 'border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.2)]',
            badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
            iconColor: 'text-cyan-400'
        },
        {
            id: 'ps5' as const,
            name: 'PlayStation 5',
            tag: 'PS5',
            flagCode: 'PS5',
            desc: 'PlayStation 5 console players',
            icon: Gamepad2,
            activeGradient: 'from-blue-700/30 via-indigo-600/20 to-slate-900',
            activeBorder: 'border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.2)]',
            badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
            iconColor: 'text-blue-400'
        },
        {
            id: 'xbox' as const,
            name: 'Xbox Series X/S',
            tag: 'Xbox XSX',
            flagCode: 'XSX',
            desc: 'Xbox Series X and Series S consoles',
            icon: Smartphone,
            activeGradient: 'from-emerald-600/30 via-teal-600/20 to-slate-900',
            activeBorder: 'border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.2)]',
            badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
            iconColor: 'text-emerald-400'
        },
        {
            id: 'msStore' as const,
            name: 'Microsoft Store',
            tag: 'WinGDK / Xbox App',
            flagCode: 'WinGDK',
            desc: 'PC Xbox App & Windows GDK store clients',
            icon: Monitor,
            activeGradient: 'from-sky-600/30 via-indigo-600/20 to-slate-900',
            activeBorder: 'border-sky-500/60 shadow-[0_0_20px_rgba(14,165,233,0.2)]',
            badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
            iconColor: 'text-sky-400'
        }
    ];

    if (compact) {
        return (
            <div className="bg-[#121225] border border-[#232342] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-violet-400" /> Platform Compatibility
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30">
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
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 text-left ${
                                    isChecked
                                        ? 'bg-violet-600/20 border-violet-500/50 text-white shadow-sm'
                                        : 'bg-[#18182e]/40 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                                }`}
                            >
                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                                    isChecked ? 'bg-violet-600 border-violet-400 text-white' : 'border-slate-700 bg-slate-900'
                                }`}>
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <Icon className={`w-3.5 h-3.5 ${p.iconColor}`} />
                                <span className="truncate">{p.name.split(' ')[0]}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="relative bg-gradient-to-br from-[#121225] via-[#15152c] to-[#0d0d1a] border border-[#27274a] rounded-2xl p-6 shadow-2xl space-y-6 overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-violet-600/10 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-600/10 blur-3xl rounded-full pointer-events-none" />

            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/25 flex-shrink-0">
                        <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-lg font-extrabold text-white tracking-tight">
                                Platform Access Control
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-violet-500/10 border border-violet-500/30 text-violet-300">
                                {activeCount === 4 ? '🌐 Full Crossplay' : activeCount === 1 && selection.pc ? '🖥️ PC Only' : `🎮 Custom (${activeCount} Active)`}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            Control which platforms can connect to your server via the native <code className="text-violet-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-violet-500/20">-ServerPlatform</code> engine flag.
                        </p>
                    </div>
                </div>

                {/* Preset Quick Toggles */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => applyPreset('pcOnly')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            activeCount === 1 && selection.pc
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-500/10'
                                : 'bg-[#1a1a33] border-[#2e2e50] text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                    >
                        PC Only
                    </button>
                    <button
                        type="button"
                        onClick={() => applyPreset('fullCrossplay')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            activeCount === 4
                                ? 'bg-violet-600/30 border-violet-500/60 text-violet-200 shadow-md shadow-violet-500/20'
                                : 'bg-[#1a1a33] border-[#2e2e50] text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                    >
                        Full Crossplay (All 4)
                    </button>
                </div>
            </div>

            {/* Platform Selection Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {platformCards.map(p => {
                    const Icon = p.icon;
                    const isChecked = selection[p.id];
                    return (
                        <div
                            key={p.id}
                            onClick={() => handleToggle(p.id)}
                            className={`group relative p-4 rounded-2xl border transition-all duration-300 cursor-pointer select-none overflow-hidden ${
                                isChecked
                                    ? `bg-gradient-to-br ${p.activeGradient} ${p.activeBorder}`
                                    : 'bg-[#111122]/70 border-[#222240] hover:border-slate-700 text-slate-500 hover:text-slate-300 hover:bg-[#15152a]'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className={`p-2 rounded-xl border transition-all ${
                                        isChecked ? 'bg-white/10 border-white/20' : 'bg-slate-900/60 border-slate-800'
                                    }`}>
                                        <Icon className={`w-5 h-5 ${p.iconColor}`} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white group-hover:text-violet-200 transition-colors">
                                            {p.name}
                                        </h4>
                                        <span className={`inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border mt-0.5 ${p.badgeBg}`}>
                                            {p.tag}
                                        </span>
                                    </div>
                                </div>

                                {/* Toggle Checkbox */}
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                                    isChecked
                                        ? 'bg-gradient-to-br from-violet-500 to-indigo-600 border-violet-400 text-white shadow-md shadow-violet-500/30'
                                        : 'border-slate-700 bg-slate-900/80 group-hover:border-slate-600'
                                }`}>
                                    {isChecked && <Check className="w-4 h-4 stroke-[3]" />}
                                </div>
                            </div>

                            <p className="text-[11.5px] text-slate-400 leading-snug">
                                {p.desc}
                            </p>

                            <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-500">
                                <span>Engine Flag:</span>
                                <span className={isChecked ? 'text-violet-300 font-bold' : 'text-slate-600'}>
                                    {p.flagCode}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Generated Command Preview Box */}
            <div className="bg-[#0b0b18] border border-[#1f1f3a] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Terminal className="w-4 h-4" />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Active Flag Generated
                        </span>
                        <code className="text-xs font-mono font-bold text-emerald-300">
                            {generatedFlag}
                        </code>
                    </div>
                </div>

                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    Automatically injected on server launch & batch export
                </div>
            </div>
        </div>
    );
};

export default PlatformSelector;
