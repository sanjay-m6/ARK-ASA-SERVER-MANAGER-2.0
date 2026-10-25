import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, RotateCcw, Copy, Check, Eye, List, Sparkles, Layers, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../ui/NumberInput';

interface EngramPointsPerLevelEditorProps {
    value: string;
    onChange: (value: string) => void;
}

/**
 * Robustly parses a raw value string into an array of numeric engram point values per level.
 * Accepts:
 *  - Multiline numeric strings ("0\n2400\n2400")
 *  - Full INI lines ("OverridePlayerLevelEngramPoints=2400")
 *  - Comma-separated strings ("0,2400,2400")
 * Explicitly preserves zero (0) values and preserves exact level ordering.
 */
export function parseEngramPoints(input: string): number[] {
    if (!input || typeof input !== 'string') return [];
    
    const lines = input.split(/[\r\n]+/);
    const result: number[] = [];

    for (const rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;

        // Strip comment prefix if any
        if (line.startsWith(';') || line.startsWith('#')) continue;

        // If line contains '=' (e.g. OverridePlayerLevelEngramPoints=2400)
        if (line.includes('=')) {
            const parts = line.split('=');
            if (parts.length >= 2) {
                line = parts[1].trim();
            }
        }

        // If line contains comma separated numbers
        if (line.includes(',')) {
            const subParts = line.split(',');
            for (const sub of subParts) {
                const trimmedSub = sub.trim();
                const num = Number(trimmedSub);
                if (!isNaN(num) && isFinite(num)) {
                    result.push(num);
                }
            }
            continue;
        }

        const num = Number(line);
        if (!isNaN(num) && isFinite(num)) {
            result.push(num);
        }
    }

    return result;
}

export function serializeEngramPoints(levels: number[]): string {
    return levels.map(v => (isNaN(v) ? 0 : Math.max(0, Math.floor(v)))).join('\n');
}

export function EngramPointsPerLevelEditor({ value, onChange }: EngramPointsPerLevelEditorProps) {
    const { t } = useTranslation();
    const [levels, setLevels] = useState<number[]>([]);
    const [defaultPoints, setDefaultPoints] = useState<number>(2400);
    const [targetLevelCount, setTargetLevelCount] = useState<number>(105);
    const [viewMode, setViewMode] = useState<'grid' | 'raw'>('grid');
    const [copied, setCopied] = useState(false);

    // Sync from prop
    useEffect(() => {
        const parsed = parseEngramPoints(value);
        setLevels(parsed);
    }, [value]);

    const updateLevels = (newLevels: number[]) => {
        setLevels(newLevels);
        onChange(serializeEngramPoints(newLevels));
    };

    const handleLevelChange = (index: number, valStr: string) => {
        const parsedVal = valStr === '' ? 0 : parseInt(valStr, 10);
        const finalVal = isNaN(parsedVal) ? 0 : Math.max(0, parsedVal);
        const next = [...levels];
        next[index] = finalVal;
        updateLevels(next);
    };

    const handleAddLevel = () => {
        const next = [...levels, defaultPoints];
        updateLevels(next);
        toast.success(t('engramPointsEditor.toasts.levelAdded', { defaultValue: 'Level {{level}} added ({{points}} points)', level: next.length, points: defaultPoints }));
    };

    const handleDeleteLevel = (index: number) => {
        const next = levels.filter((_, i) => i !== index);
        updateLevels(next);
    };

    const handleApplyToAll = () => {
        if (levels.length === 0) {
            toast.error(t('engramPointsEditor.toasts.addLevelFirst', 'Add at least one level first or generate levels'));
            return;
        }
        const next = levels.map(() => defaultPoints);
        updateLevels(next);
        toast.success(t('engramPointsEditor.toasts.appliedToAll', { defaultValue: 'Applied {{points}} engram points to all {{count}} levels', points: defaultPoints, count: levels.length }));
    };

    const handleGenerateLevels = (count: number) => {
        const next: number[] = [];
        for (let i = 0; i < count; i++) {
            // Level 1 typically grants 0 or starting points, rest get defaultPoints
            next.push(i === 0 ? 0 : defaultPoints);
        }
        updateLevels(next);
        toast.success(t('engramPointsEditor.toasts.generated', { defaultValue: 'Generated {{count}} levels ({{points}} pts/level)', count, points: defaultPoints }));
    };

    const handleReset = () => {
        updateLevels([]);
        toast.success(t('engramPointsEditor.toasts.cleared', 'Cleared all level overrides'));
    };

    // Raw INI preview text matching exact Game.ini output
    const rawIniPreview = useMemo(() => {
        if (levels.length === 0) {
            return `; ${t('engramPointsEditor.rawEmptyLine1', 'No Engram Points Overrides Configured')}\n; ${t('engramPointsEditor.rawEmptyLine2', 'Default ARK server progression will be used.')}`;
        }
        let ini = '[/Script/ShooterGame.ShooterGameMode]\n';
        for (const pts of levels) {
            ini += `OverridePlayerLevelEngramPoints=${pts}\n`;
        }
        return ini.trim();
    }, [levels, t]);

    const copyRawPreview = () => {
        navigator.clipboard.writeText(rawIniPreview);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success(t('engramPointsEditor.toasts.copied', 'Raw INI configuration copied to clipboard'));
    };

    return (
        <div className="w-full bg-[#121225] border-2 border-[#2d2d44] rounded-2xl p-5 space-y-6 shadow-xl text-left">
            {/* Header & Quick Tools Bar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                                {t('engramPointsEditor.title', 'Engram Points Per Level Editor')}
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-mono border border-orange-500/30">
                                    {t('engramPointsEditor.levelsConfigured', { defaultValue: '{{count}} Levels Configured', count: levels.length })}
                                </span>
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {t('engramPointsEditor.subtitle', 'Set custom Engram Points awarded to players upon each level up in ARK: Survival Ascended.')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Mode Toggle & Presets */}
                <div className="flex items-center gap-2 self-end md:self-auto">
                    <button
                        type="button"
                        onClick={() => setViewMode(viewMode === 'grid' ? 'raw' : 'grid')}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1a1a32] hover:bg-[#252545] border border-[#3d3d60] text-xs font-semibold text-slate-300 transition-all"
                    >
                        {viewMode === 'grid' ? <Eye className="w-4 h-4 text-cyan-400" /> : <List className="w-4 h-4 text-orange-400" />}
                        {viewMode === 'grid' ? t('engramPointsEditor.showRaw', 'Show Raw INI Preview') : t('engramPointsEditor.showGrid', 'Show Level Grid')}
                    </button>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-400 transition-all"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('common.reset', 'Reset')}
                    </button>
                </div>
            </div>

            {/* Quick Generator Panel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#181830] p-4 rounded-xl border border-white/5">
                {/* Default Points Input */}
                <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        {t('engramPointsEditor.pointsPerLevel', 'Points Per Level')}
                    </label>
                    <NumberInput
                        integer
                        min={0}
                        max={100000}
                        value={defaultPoints}
                        onValueChange={setDefaultPoints}
                        className="w-full bg-[#111122] border border-[#2d2d48] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-orange-500"
                    />
                </div>

                {/* Max Level Target Input */}
                <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        {t('engramPointsEditor.targetLevelCount', 'Target Level Count')}
                    </label>
                    <NumberInput
                        integer
                        min={1}
                        max={500}
                        value={targetLevelCount}
                        onValueChange={setTargetLevelCount}
                        className="w-full bg-[#111122] border border-[#2d2d48] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-orange-500"
                    />
                </div>

                {/* Quick Generator Buttons */}
                <div className="flex items-end">
                    <button
                        type="button"
                        onClick={() => handleGenerateLevels(targetLevelCount)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-lg text-xs font-bold shadow-md transition-all"
                    >
                        <Sparkles className="w-4 h-4" />
                        {t('engramPointsEditor.generateLevels', { defaultValue: 'Generate {{count}} Levels', count: targetLevelCount })}
                    </button>
                </div>

                {/* Apply to All */}
                <div className="flex items-end">
                    <button
                        type="button"
                        onClick={handleApplyToAll}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#252545] hover:bg-[#32325c] border border-orange-500/30 text-orange-300 rounded-lg text-xs font-bold transition-all"
                    >
                        <ArrowRight className="w-4 h-4" />
                        {t('engramPointsEditor.applyToAll', { defaultValue: 'Apply {{points}} to All', points: defaultPoints })}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            {viewMode === 'grid' ? (
                <div className="space-y-4">
                    {levels.length === 0 ? (
                        <div className="text-center py-10 bg-[#16162a] rounded-xl border border-dashed border-slate-700 p-6 space-y-3">
                            <Layers className="w-10 h-10 text-slate-500 mx-auto opacity-50" />
                            <p className="text-sm font-semibold text-slate-300">{t('engramPointsEditor.emptyTitle', 'No Custom Engram Points Configured')}</p>
                            <p className="text-xs text-slate-500 max-w-md mx-auto">
                                {t('engramPointsEditor.emptyDescription', 'Click below to generate standard level progression or add levels manually.')}
                            </p>
                            <div className="flex justify-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => handleGenerateLevels(105)}
                                    className="px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 transition-all shadow-lg"
                                >
                                    {t('engramPointsEditor.generateDefault', 'Generate 105 Levels (2400 pts)')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAddLevel}
                                    className="px-4 py-2 bg-[#252545] text-slate-200 border border-slate-600 rounded-lg text-xs font-semibold hover:bg-[#303058] transition-all"
                                >
                                    {t('engramPointsEditor.addFirstLevel', '+ Add Level 1')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Scrollable Level Table Grid */}
                            <div className="max-h-[380px] overflow-y-auto border border-[#2d2d48] rounded-xl bg-[#141428] scrollbar-thin scrollbar-thumb-orange-500/30 scrollbar-track-transparent">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[#1b1b36] sticky top-0 z-10 text-[11px] font-bold text-slate-400 uppercase border-b border-[#2d2d48]">
                                        <tr>
                                            <th className="py-2.5 px-4 w-28">{t('engramPointsEditor.playerLevel', 'Player Level')}</th>
                                            <th className="py-2.5 px-4">{t('engramPointsEditor.pointsGranted', 'Engram Points Granted')}</th>
                                            <th className="py-2.5 px-4 w-24 text-right">{t('common.actions', 'Actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono text-xs text-slate-200">
                                        {levels.map((pts, idx) => (
                                            <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="py-2 px-4 font-bold text-orange-400">
                                                    {t('engramPointsEditor.level', { defaultValue: 'Level {{level}}', level: idx + 1 })}
                                                </td>
                                                <td className="py-2 px-4">
                                                    <div className="flex items-center gap-3">
                                                        <NumberInput
                                                            integer
                                                            min={0}
                                                            max={100000}
                                                            value={pts}
                                                            onValueChange={(n) => handleLevelChange(idx, String(n))}
                                                            className="w-36 bg-[#0c0c1a] border border-[#2d2d48] rounded-md px-3 py-1 text-white font-mono text-xs focus:outline-none focus:border-orange-500"
                                                        />
                                                        <span className="text-[11px] text-slate-500 font-sans">
                                                            {pts === 0 ? t('engramPointsEditor.starter', '(0 points - starter)') : t('engramPointsEditor.plusPoints', { defaultValue: '+{{points}} pts', points: pts.toLocaleString() })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-2 px-4 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteLevel(idx)}
                                                        className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                        title={t('engramPointsEditor.deleteLevel', 'Delete Level')}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Add Level Row Button */}
                            <div className="flex justify-between items-center pt-2">
                                <button
                                    type="button"
                                    onClick={handleAddLevel}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    {t('engramPointsEditor.addLevel', { defaultValue: 'Add Level {{level}} ({{points}} pts)', level: levels.length + 1, points: defaultPoints })}
                                </button>
                                <span className="text-xs text-slate-500 font-mono">
                                    {t('engramPointsEditor.total', 'Total Engram Points across all levels:')} <strong className="text-orange-400">{levels.reduce((a, b) => a + b, 0).toLocaleString()}</strong>
                                </span>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                /* Raw INI Preview Panel */
                <div className="space-y-3">
                    <div className="flex items-center justify-between bg-[#181830] px-4 py-2 rounded-t-xl border border-white/5">
                        <span className="text-xs font-bold text-slate-300 font-mono flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            {t('engramPointsEditor.rawPreviewTitle', 'Generated Game.ini Output Preview')} (ShooterGame/Saved/Config/WindowsServer/Game.ini)
                        </span>
                        <button
                            type="button"
                            onClick={copyRawPreview}
                            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-[#252545] px-2.5 py-1 rounded-md border border-white/10 transition-all"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? t('engramPointsEditor.copied', 'Copied!') : t('engramPointsEditor.copySnippet', 'Copy INI Snippet')}
                        </button>
                    </div>
                    <pre className="w-full bg-[#0a0a14] border border-[#2d2d48] rounded-b-xl p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-[300px] leading-relaxed scrollbar-thin scrollbar-thumb-emerald-500/30">
                        {rawIniPreview}
                    </pre>
                </div>
            )}
        </div>
    );
}
