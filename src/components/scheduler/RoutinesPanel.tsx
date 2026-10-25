import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    ListOrdered, Play, Pencil, Trash2, Plus, ChevronUp, ChevronDown, X, Loader2, CheckCircle2, XCircle, Ban,
    Megaphone, Timer, Hourglass, Terminal, Save, Power, PowerOff, RotateCw, Archive, Download,
    SlidersHorizontal, Skull, Clock, CalendarDays, Sparkles, Wrench,
} from 'lucide-react';
import { useTauriEvent } from '../../hooks/useTauriEvent';
import { NumberInput } from '../ui/NumberInput';
import { getAllCategories } from '../../data/configMappings';
import { cn } from '../../utils/helpers';
import {
    Routine, RoutineStep, RoutineStepType, RunningRoutine, RoutineProgressEvent, RoutineSchedule,
    getRoutines, saveRoutine, deleteRoutine, setRoutineEnabled, runRoutineNow, cancelRoutine, getRunningRoutines,
    scheduleToCron, cronToSchedule, shiftWeeklyBack, parseMinuteList,
} from '../../utils/routines';

const STEP_TYPES: { type: RoutineStepType; icon: typeof Play; label: string }[] = [
    { type: 'countdown', icon: Timer, label: 'Countdown warnings' },
    { type: 'broadcast', icon: Megaphone, label: 'Broadcast message' },
    { type: 'wait', icon: Hourglass, label: 'Wait' },
    { type: 'saveWorld', icon: Save, label: 'Save world' },
    { type: 'stop', icon: PowerOff, label: 'Stop server' },
    { type: 'setConfig', icon: SlidersHorizontal, label: 'Change config value' },
    { type: 'start', icon: Power, label: 'Start server' },
    { type: 'restart', icon: RotateCw, label: 'Restart server' },
    { type: 'backup', icon: Archive, label: 'Backup' },
    { type: 'updateServer', icon: Download, label: 'Update server (SteamCMD)' },
    { type: 'rcon', icon: Terminal, label: 'RCON command' },
    { type: 'destroyWildDinos', icon: Skull, label: 'Wipe wild dinos' },
];

const DAY_DEFAULTS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function newStep(type: RoutineStepType, t: (k: string, d: string) => string): RoutineStep {
    switch (type) {
        case 'countdown': return { type, minutes: [15, 10, 5, 1], message: t('routines.defaults.countdownMessage', 'Server shutting down in {minutes} minute(s)!') };
        case 'broadcast': return { type, message: '' };
        case 'wait': return { type, minutes: 1 };
        case 'rcon': return { type, command: '' };
        case 'setConfig': return { type, file: 'GameUserSettings', section: 'ServerSettings', key: '', value: '' };
        default: return { type } as RoutineStep;
    }
}

function emptyRoutine(serverId: number): Routine {
    return { id: 0, serverId, name: '', enabled: true, cronExpression: '0 18 * * *', runOnce: false, steps: [] };
}

// ────────────────────────────────────────────────────────────────────────────────

export function RoutinesPanel({ serverId }: { serverId: number | null }) {
    const { t } = useTranslation();
    const [routines, setRoutines] = useState<Routine[]>([]);
    const [running, setRunning] = useState<RunningRoutine[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<Routine | null>(null);
    const [showTemplates, setShowTemplates] = useState(false);

    const reload = useCallback(async () => {
        if (!serverId) return;
        setLoading(true);
        try {
            const [list, run] = await Promise.all([getRoutines(serverId), getRunningRoutines()]);
            setRoutines(list);
            setRunning(run);
        } catch (e) {
            toast.error(String(e));
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    useEffect(() => { reload(); }, [reload]);

    useTauriEvent<RoutineProgressEvent>('routine-progress', useCallback((ev) => {
        if (ev.status === 'running') {
            setRunning(prev => [
                ...prev.filter(r => r.serverId !== ev.serverId),
                { ...ev, startedAt: prev.find(r => r.serverId === ev.serverId)?.startedAt ?? new Date().toISOString() },
            ]);
            return;
        }
        setRunning(prev => prev.filter(r => r.serverId !== ev.serverId));
        if (ev.status === 'success') toast.success(t('routines.toast.finished', { name: ev.name, defaultValue: 'Routine "{{name}}" finished' }));
        if (ev.status === 'failed') toast.error(t('routines.toast.failed', { name: ev.name, error: ev.message ?? '', defaultValue: 'Routine "{{name}}" failed: {{error}}' }), { duration: 8000 });
        if (ev.status === 'cancelled') toast(t('routines.toast.cancelled', { name: ev.name, defaultValue: 'Routine "{{name}}" cancelled' }));
        reload();
    }, [t, reload]));

    const runningHere = running.find(r => r.serverId === serverId);

    const handleSave = async (routine: Routine) => {
        try {
            await saveRoutine(routine);
            toast.success(t('routines.toast.saved', 'Routine saved'));
            setEditing(null);
            reload();
        } catch (e) {
            toast.error(String(e));
        }
    };

    const handleCreateMany = async (list: Routine[]) => {
        try {
            for (const r of list) await saveRoutine(r);
            toast.success(t('routines.toast.created', { count: list.length, defaultValue: '{{count}} routine(s) created' }));
            setShowTemplates(false);
            reload();
        } catch (e) {
            toast.error(String(e));
        }
    };

    if (!serverId) return null;

    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <ListOrdered className="w-4 h-4 text-cyan-400" /> {t('routines.title', 'Routines & Events')}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {t('routines.subtitle', 'Chain steps on a schedule: opening hours, maintenance, timed config changes for events.')}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowTemplates(true)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border border-[var(--border)] text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {t('routines.fromTemplate', 'From template')}
                    </button>
                    <button onClick={() => setEditing(emptyRoutine(serverId))} className="px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 cursor-pointer">
                        <Plus className="w-3.5 h-3.5" /> {t('routines.new', 'New routine')}
                    </button>
                </div>
            </div>

            {runningHere && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{runningHere.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                            {t('routines.runningStep', { current: runningHere.stepIndex + 1, total: runningHere.stepCount, step: runningHere.stepLabel, defaultValue: 'Step {{current}}/{{total}}: {{step}}' })}
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                            <div className="h-full bg-cyan-500 transition-all" style={{ width: `${((runningHere.stepIndex + 1) / runningHere.stepCount) * 100}%` }} />
                        </div>
                    </div>
                    <button onClick={() => cancelRoutine(runningHere.serverId)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 flex items-center gap-1 cursor-pointer">
                        <Ban className="w-3.5 h-3.5" /> {t('routines.cancel', 'Cancel')}
                    </button>
                </div>
            )}

            {loading && routines.length === 0 ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" /></div>
            ) : routines.length === 0 ? (
                <div className="text-center py-8 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)]">
                    {t('routines.empty', 'No routines yet. Start from a template (opening hours, maintenance, event) or create one.')}
                </div>
            ) : (
                <div className="space-y-2">
                    {routines.map(r => (
                        <RoutineRow
                            key={r.id}
                            routine={r}
                            isRunning={runningHere?.routineId === r.id}
                            anyRunning={!!runningHere}
                            onToggle={async (enabled) => { await setRoutineEnabled(r.id, enabled); reload(); }}
                            onRun={async () => {
                                try { await runRoutineNow(r.id); toast.success(t('routines.toast.started', { name: r.name, defaultValue: 'Routine "{{name}}" started' })); reload(); }
                                catch (e) { toast.error(String(e)); }
                            }}
                            onEdit={() => setEditing(r)}
                            onDelete={async () => { await deleteRoutine(r.id); reload(); }}
                        />
                    ))}
                </div>
            )}

            {editing && <RoutineEditor initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} />}
            {showTemplates && <TemplateWizard serverId={serverId} onCancel={() => setShowTemplates(false)} onCreate={handleCreateMany} />}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────

function useScheduleText() {
    const { t } = useTranslation();
    const dayName = (d: number) => t(`routines.days.${d}`, DAY_DEFAULTS[d]);
    return (r: Routine) => {
        const s = cronToSchedule(r.cronExpression, r.runOnce);
        switch (s.kind) {
            case 'manual': return t('routines.schedule.manualOnly', 'Manual only');
            case 'cron': return `cron: ${s.expression}`;
            case 'date': {
                const [y, m, d] = s.date.split('-');
                return t('routines.schedule.onDate', { date: `${d}/${m}/${y}`, time: s.time, defaultValue: 'On {{date}} at {{time}} (once)' });
            }
            case 'weekly':
                return s.days.length === 7
                    ? t('routines.schedule.everyDay', { time: s.time, defaultValue: 'Every day at {{time}}' })
                    : t('routines.schedule.onDays', { days: s.days.map(dayName).join(', '), time: s.time, defaultValue: '{{days}} at {{time}}' });
        }
    };
}

function RoutineRow({ routine, isRunning, anyRunning, onToggle, onRun, onEdit, onDelete }: {
    routine: Routine; isRunning: boolean; anyRunning: boolean;
    onToggle: (enabled: boolean) => void; onRun: () => void; onEdit: () => void; onDelete: () => void;
}) {
    const { t } = useTranslation();
    const scheduleText = useScheduleText();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const status = routine.lastStatus;

    return (
        <div className={cn("flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border bg-[var(--surface-hover)]", isRunning ? "border-cyan-500/50" : "border-[var(--border)]", !routine.enabled && "opacity-60")}>
            <label className="relative inline-flex items-center cursor-pointer shrink-0" title={t('routines.enabled', 'Enabled')}>
                <input type="checkbox" checked={routine.enabled} onChange={e => onToggle(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500" />
            </label>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{routine.name}</div>
                <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap">
                    <Clock className="w-3 h-3" /> {scheduleText(routine)}
                    <span>•</span>
                    {t('routines.stepCount', { count: routine.steps.length, defaultValue: '{{count}} steps' })}
                    {routine.lastRun && status && status !== 'running' && (
                        <>
                            <span>•</span>
                            {status === 'success' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                            {status === 'failed' && <XCircle className="w-3 h-3 text-red-400" />}
                            {status === 'cancelled' && <Ban className="w-3 h-3 text-amber-400" />}
                            <span title={routine.lastError ?? undefined}>
                                {t('routines.lastRun', { date: new Date(routine.lastRun).toLocaleString(), defaultValue: 'Last run {{date}}' })}
                            </span>
                        </>
                    )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {routine.steps.map((s, i) => {
                        const meta = STEP_TYPES.find(m => m.type === s.type);
                        const Icon = meta?.icon ?? ListOrdered;
                        return (
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                                <Icon className="w-2.5 h-2.5" />
                                {s.type === 'setConfig' ? `${s.key}=${s.value}` : t(`routines.steps.${s.type}`, meta?.label ?? s.type)}
                            </span>
                        );
                    })}
                </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
                <button disabled={anyRunning} onClick={onRun} className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-green-600/80 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-1 cursor-pointer" title={t('routines.runNow', 'Run now')}>
                    <Play className="w-3.5 h-3.5" /> {t('routines.runNow', 'Run now')}
                </button>
                <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-[var(--surface-active)] text-[var(--text-secondary)] cursor-pointer" title={t('routines.edit', 'Edit')}><Pencil className="w-4 h-4" /></button>
                {confirmDelete ? (
                    <button onClick={onDelete} onBlur={() => setConfirmDelete(false)} autoFocus className="px-2 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white cursor-pointer">{t('routines.confirmDelete', 'Delete?')}</button>
                ) : (
                    <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 cursor-pointer" title={t('routines.delete', 'Delete')}><Trash2 className="w-4 h-4" /></button>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────

const inputCls = "w-full px-3 py-2 text-sm rounded-lg bg-[var(--input-background)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cyan-500";

function Modal({ title, children, onClose, footer }: { title: string; children: React.ReactNode; onClose: () => void; footer: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">{footer}</div>
            </div>
        </div>
    );
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map(d => (
                <button
                    key={d}
                    type="button"
                    onClick={() => onChange(days.includes(d) ? days.filter(x => x !== d) : [...days, d])}
                    className={cn("min-w-11 px-2 h-8 rounded-md text-xs font-semibold border cursor-pointer", days.includes(d) ? "bg-cyan-600 border-cyan-500 text-white" : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-muted)]")}
                >
                    {t(`routines.days.${d}`, DAY_DEFAULTS[d])}
                </button>
            ))}
        </div>
    );
}

function ScheduleEditor({ schedule, onChange }: { schedule: RoutineSchedule; onChange: (s: RoutineSchedule) => void }) {
    const { t } = useTranslation();
    const kinds: { kind: RoutineSchedule['kind']; label: string }[] = [
        { kind: 'weekly', label: t('routines.schedule.weekly', 'Days of week') },
        { kind: 'date', label: t('routines.schedule.date', 'Specific date') },
        { kind: 'manual', label: t('routines.schedule.manual', 'Manual') },
        { kind: 'cron', label: t('routines.schedule.cron', 'Cron (advanced)') },
    ];
    const switchKind = (kind: RoutineSchedule['kind']) => {
        const time = 'time' in schedule ? schedule.time : '18:00';
        if (kind === 'weekly') onChange({ kind, days: [0, 1, 2, 3, 4, 5, 6], time });
        if (kind === 'date') onChange({ kind, date: new Date().toISOString().slice(0, 10), time });
        if (kind === 'manual') onChange({ kind });
        if (kind === 'cron') onChange({ kind, expression: scheduleToCron(schedule).cronExpression.replace('@manual', '0 18 * * *') });
    };
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
                {kinds.map(k => (
                    <button key={k.kind} type="button" onClick={() => switchKind(k.kind)} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer", schedule.kind === k.kind ? "bg-cyan-600 border-cyan-500 text-white" : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)]")}>
                        {k.label}
                    </button>
                ))}
            </div>
            {schedule.kind === 'weekly' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <DayPicker days={schedule.days} onChange={days => onChange({ ...schedule, days })} />
                    <input type="time" value={schedule.time} onChange={e => onChange({ ...schedule, time: e.target.value })} className={cn(inputCls, "sm:w-32")} />
                </div>
            )}
            {schedule.kind === 'date' && (
                <div className="flex gap-3">
                    <input type="date" value={schedule.date} onChange={e => onChange({ ...schedule, date: e.target.value })} className={cn(inputCls, "w-44")} />
                    <input type="time" value={schedule.time} onChange={e => onChange({ ...schedule, time: e.target.value })} className={cn(inputCls, "w-32")} />
                </div>
            )}
            {schedule.kind === 'cron' && (
                <div>
                    <input value={schedule.expression} onChange={e => onChange({ ...schedule, expression: e.target.value })} className={cn(inputCls, "font-mono")} placeholder="0 18 * * 1-5" />
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">{t('routines.schedule.cronHelp', 'minute hour day month weekday (0 = Sunday). E.g. "30 3 * * 1,4" = Mon and Thu at 03:30.')}</p>
                </div>
            )}
            {schedule.kind === 'manual' && (
                <p className="text-xs text-[var(--text-muted)]">{t('routines.schedule.manualHelp', 'Runs only when you click "Run now".')}</p>
            )}
        </div>
    );
}

/** INI keys known to the config editor, for autocomplete in "Change config value" steps */
function useConfigKeys() {
    return useMemo(() => {
        const keys: { key: string; section: string; file: 'GameUserSettings' | 'Game'; label: string }[] = [];
        for (const cat of getAllCategories()) {
            for (const group of cat.groups) {
                for (const f of group.fields) {
                    if (['boolean', 'slider', 'number', 'text', 'dropdown'].includes(f.type) && !keys.some(k => k.key === f.key)) {
                        keys.push({ key: f.key, section: f.section, file: group.source === 'Game' ? 'Game' : 'GameUserSettings', label: f.label });
                    }
                }
            }
        }
        return keys;
    }, []);
}

function StepFields({ step, onChange }: { step: RoutineStep; onChange: (s: RoutineStep) => void }) {
    const { t } = useTranslation();
    const configKeys = useConfigKeys();
    switch (step.type) {
        case 'broadcast':
            return <input value={step.message} onChange={e => onChange({ ...step, message: e.target.value })} className={inputCls} placeholder={t('routines.fields.message', 'Message shown to players')} />;
        case 'countdown':
            return (
                <div className="space-y-2">
                    <input
                        defaultValue={step.minutes.join(', ')}
                        onBlur={e => onChange({ ...step, minutes: parseMinuteList(e.target.value) })}
                        className={cn(inputCls, "font-mono")}
                        placeholder="15, 10, 5, 1"
                    />
                    <input value={step.message} onChange={e => onChange({ ...step, message: e.target.value })} className={inputCls} placeholder={t('routines.fields.countdownMessage', 'Message — {minutes} is replaced by the minutes left')} />
                    <p className="text-[11px] text-[var(--text-muted)]">{t('routines.fields.countdownHelp', 'Warns at each minute mark (e.g. 15, 10, 5, 1) and continues when the time is up. Use {minutes} in the message.')}</p>
                </div>
            );
        case 'wait':
            return (
                <div className="flex items-center gap-2">
                    <NumberInput integer min={1} value={step.minutes} onValueChange={n => onChange({ ...step, minutes: n })} className={cn(inputCls, "w-24 text-center font-mono")} />
                    <span className="text-xs text-[var(--text-muted)]">{t('routines.fields.minutes', 'minutes')}</span>
                </div>
            );
        case 'rcon':
            return <input value={step.command} onChange={e => onChange({ ...step, command: e.target.value })} className={cn(inputCls, "font-mono")} placeholder="SetTimeOfDay 12:00" />;
        case 'setConfig':
            return (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                    <input
                        list="routine-config-keys"
                        value={step.key}
                        onChange={e => {
                            const known = configKeys.find(k => k.key.toLowerCase() === e.target.value.toLowerCase());
                            onChange(known ? { ...step, key: known.key, section: known.section, file: known.file } : { ...step, key: e.target.value });
                        }}
                        className={cn(inputCls, "font-mono")}
                        placeholder={t('routines.fields.key', 'INI key (e.g. XPMultiplier)')}
                    />
                    <datalist id="routine-config-keys">
                        {configKeys.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </datalist>
                    <input value={step.value} onChange={e => onChange({ ...step, value: e.target.value })} className={cn(inputCls, "sm:w-32 font-mono")} placeholder={t('routines.fields.value', 'Value')} />
                    <select value={step.file} onChange={e => onChange({ ...step, file: e.target.value as 'GameUserSettings' | 'Game' })} className={cn(inputCls, "sm:w-44")}>
                        <option value="GameUserSettings">GameUserSettings.ini</option>
                        <option value="Game">Game.ini</option>
                    </select>
                    <input value={step.section} onChange={e => onChange({ ...step, section: e.target.value })} className={cn(inputCls, "sm:col-span-3 font-mono text-xs")} placeholder={t('routines.fields.section', 'Section (e.g. ServerSettings)')} />
                </div>
            );
        default:
            return null;
    }
}

function StepsEditor({ steps, onChange }: { steps: RoutineStep[]; onChange: (steps: RoutineStep[]) => void }) {
    const { t } = useTranslation();
    const move = (i: number, d: number) => {
        const next = [...steps];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        onChange(next);
    };
    const hasConfigWhileRunning = steps.some((s, i) => s.type === 'setConfig' && !steps.slice(0, i).some(p => p.type === 'stop' || p.type === 'updateServer'));
    return (
        <div className="space-y-2">
            {steps.map((step, i) => {
                const meta = STEP_TYPES.find(m => m.type === step.type)!;
                const Icon = meta.icon;
                return (
                    <div key={i} className="flex gap-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]">
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-cyan-600/30 text-cyan-300 text-[11px] font-bold">{i + 1}</span>
                            <button disabled={i === 0} onClick={() => move(i, -1)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 cursor-pointer"><ChevronUp className="w-4 h-4" /></button>
                            <button disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 cursor-pointer"><ChevronDown className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                                <Icon className="w-4 h-4 text-cyan-400" /> {t(`routines.steps.${step.type}`, meta.label)}
                            </div>
                            <StepFields step={step} onChange={s => onChange(steps.map((x, j) => (j === i ? s : x)))} />
                        </div>
                        <button onClick={() => onChange(steps.filter((_, j) => j !== i))} className="self-start p-1 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                );
            })}
            {hasConfigWhileRunning && (
                <p className="text-[11px] text-amber-300/90 px-1">
                    {t('routines.warnConfigRunning', 'Tip: config changes only take effect after a restart. Put "Stop server" before and "Start server" after "Change config value".')}
                </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
                {STEP_TYPES.map(m => {
                    const Icon = m.icon;
                    return (
                        <button key={m.type} type="button" onClick={() => onChange([...steps, newStep(m.type, t)])} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border border-[var(--border)] text-[var(--text-secondary)] cursor-pointer">
                            <Plus className="w-3 h-3" /><Icon className="w-3 h-3" /> {t(`routines.steps.${m.type}`, m.label)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function RoutineEditor({ initial, onCancel, onSave }: { initial: Routine; onCancel: () => void; onSave: (r: Routine) => void }) {
    const { t } = useTranslation();
    const [name, setName] = useState(initial.name);
    const [schedule, setSchedule] = useState<RoutineSchedule>(() => cronToSchedule(initial.cronExpression, initial.runOnce));
    const [steps, setSteps] = useState<RoutineStep[]>(initial.steps);

    const submit = () => {
        if (!name.trim()) return toast.error(t('routines.validation.name', 'Give the routine a name'));
        if (steps.length === 0) return toast.error(t('routines.validation.steps', 'Add at least one step'));
        if (schedule.kind === 'weekly' && schedule.days.length === 0) return toast.error(t('routines.validation.days', 'Pick at least one day'));
        if (steps.some(s => s.type === 'setConfig' && (!s.key.trim() || !s.section.trim()))) return toast.error(t('routines.validation.configKey', 'Fill in the key and section of every config change'));
        onSave({ ...initial, name: name.trim(), steps, ...scheduleToCron(schedule) });
    };

    return (
        <Modal
            title={initial.id ? t('routines.editTitle', 'Edit routine') : t('routines.newTitle', 'New routine')}
            onClose={onCancel}
            footer={<>
                <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer">{t('common.cancel', 'Cancel')}</button>
                <button onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer">{t('common.save', 'Save')}</button>
            </>}
        >
            <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('routines.fields.name', 'Name')}</label>
                <input value={name} onChange={e => setName(e.target.value)} className={cn(inputCls, "mt-1")} placeholder={t('routines.fields.namePlaceholder', 'e.g. Weekend 3x XP event')} />
            </div>
            <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> {t('routines.fields.when', 'When')}</label>
                <div className="mt-2"><ScheduleEditor schedule={schedule} onChange={setSchedule} /></div>
            </div>
            <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5"><ListOrdered className="w-3.5 h-3.5" /> {t('routines.fields.steps', 'Steps (run in order)')}</label>
                <div className="mt-2"><StepsEditor steps={steps} onChange={setSteps} /></div>
            </div>
        </Modal>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Templates: generate one or two ready-made routines from a few questions

type TemplateKind = 'hours' | 'maintenance' | 'event';

interface ConfigChange { key: string; section: string; file: 'GameUserSettings' | 'Game'; eventValue: string; normalValue: string }

function TemplateWizard({ serverId, onCancel, onCreate }: { serverId: number; onCancel: () => void; onCreate: (r: Routine[]) => void }) {
    const { t } = useTranslation();
    const configKeys = useConfigKeys();
    const [kind, setKind] = useState<TemplateKind>('hours');
    const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
    const [openTime, setOpenTime] = useState('18:00');
    const [closeTime, setCloseTime] = useState('23:00');
    const [warnings, setWarnings] = useState('15, 10, 5, 1');
    const [withBackup, setWithBackup] = useState(true);
    const [withUpdate, setWithUpdate] = useState(true);
    const [eventName, setEventName] = useState('');
    const [eventMode, setEventMode] = useState<'weekly' | 'date'>('weekly');
    const [startDays, setStartDays] = useState<number[]>([5]);
    const [endDays, setEndDays] = useState<number[]>([1]);
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
    const [changes, setChanges] = useState<ConfigChange[]>([
        { key: 'XPMultiplier', section: 'ServerSettings', file: 'GameUserSettings', eventValue: '3', normalValue: '1' },
    ]);

    const warnList = parseMinuteList(warnings);
    const lead = warnList[0] ?? 0;
    const countdown = (message: string): RoutineStep[] => warnList.length ? [{ type: 'countdown', minutes: warnList, message }] : [];

    // Start the countdown early so the action happens exactly at the chosen time
    const weeklyAt = (d: number[], time: string, back: number) => {
        const s = shiftWeeklyBack(d, time, back);
        return scheduleToCron({ kind: 'weekly', days: s.days, time: s.time });
    };
    const dateAt = (date: string, time: string, back: number) => {
        const dt = new Date(`${date}T${time}:00`);
        dt.setMinutes(dt.getMinutes() - back);
        const pad = (n: number) => String(n).padStart(2, '0');
        return scheduleToCron({ kind: 'date', date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` });
    };
    const base = (name: string, cron: { cronExpression: string; runOnce: boolean }, steps: RoutineStep[]): Routine =>
        ({ id: 0, serverId, name, enabled: true, steps, ...cron });

    const build = (): Routine[] | string => {
        if (kind === 'hours') {
            if (!days.length) return t('routines.validation.days', 'Pick at least one day');
            return [
                base(t('routines.templates.openName', { time: openTime, defaultValue: 'Open server ({{time}})' }), weeklyAt(days, openTime, 0), [{ type: 'start' }]),
                base(t('routines.templates.closeName', { time: closeTime, defaultValue: 'Close server ({{time}})' }), weeklyAt(days, closeTime, lead), [
                    ...countdown(t('routines.templates.closeMessage', 'The server closes in {minutes} minute(s)! Find a safe place.')),
                    { type: 'saveWorld' }, { type: 'stop' },
                ]),
            ];
        }
        if (kind === 'maintenance') {
            if (!days.length) return t('routines.validation.days', 'Pick at least one day');
            return [base(t('routines.templates.maintenanceName', { time: closeTime, defaultValue: 'Maintenance ({{time}})' }), weeklyAt(days, closeTime, lead), [
                ...countdown(t('routines.templates.maintenanceMessage', 'Maintenance in {minutes} minute(s). The server will be back shortly.')),
                { type: 'saveWorld' }, { type: 'stop' },
                ...(withBackup ? [{ type: 'backup' } as RoutineStep] : []),
                ...(withUpdate ? [{ type: 'updateServer' } as RoutineStep] : []),
                { type: 'start' },
            ])];
        }
        // event
        const name = eventName.trim() || t('routines.templates.eventDefaultName', 'Event');
        const valid = changes.filter(c => c.key.trim());
        if (!valid.length) return t('routines.validation.eventChanges', 'Add at least one config change for the event');
        if (eventMode === 'weekly' && (!startDays.length || !endDays.length)) return t('routines.validation.days', 'Pick at least one day');
        const setAll = (field: 'eventValue' | 'normalValue'): RoutineStep[] =>
            valid.map(c => ({ type: 'setConfig', file: c.file, section: c.section, key: c.key, value: c[field] }));
        const startCron = eventMode === 'weekly' ? weeklyAt(startDays, openTime, lead) : dateAt(startDate, openTime, lead);
        const endCron = eventMode === 'weekly' ? weeklyAt(endDays, closeTime, lead) : dateAt(endDate, closeTime, lead);
        return [
            base(t('routines.templates.eventStartName', { name, defaultValue: '{{name}} — start' }), startCron, [
                ...countdown(t('routines.templates.eventStartMessage', { name, defaultValue: 'Restarting in {minutes} minute(s) to start {{name}}!' })),
                { type: 'saveWorld' }, { type: 'stop' }, ...setAll('eventValue'), { type: 'start' },
            ]),
            base(t('routines.templates.eventEndName', { name, defaultValue: '{{name}} — end' }), endCron, [
                ...countdown(t('routines.templates.eventEndMessage', { name, defaultValue: '{{name}} ends in {minutes} minute(s). Restarting with normal rates.' })),
                { type: 'saveWorld' }, { type: 'stop' }, ...setAll('normalValue'), { type: 'start' },
            ]),
        ];
    };

    const submit = () => {
        const result = build();
        if (typeof result === 'string') return toast.error(result);
        onCreate(result);
    };

    const kinds: { kind: TemplateKind; icon: typeof Play; title: string; desc: string }[] = [
        { kind: 'hours', icon: Clock, title: t('routines.templates.hours', 'Opening hours'), desc: t('routines.templates.hoursDesc', 'Server online only between two times.') },
        { kind: 'maintenance', icon: Wrench, title: t('routines.templates.maintenance', 'Maintenance'), desc: t('routines.templates.maintenanceDesc', 'Warn, save, stop, backup, update and start again.') },
        { kind: 'event', icon: Sparkles, title: t('routines.templates.event', 'Event'), desc: t('routines.templates.eventDesc', 'Change config values for a period, then restore them.') },
    ];

    const timeInput = (value: string, set: (v: string) => void) => (
        <input type="time" value={value} onChange={e => set(e.target.value)} className={cn(inputCls, "w-32")} />
    );

    return (
        <Modal
            title={t('routines.templates.title', 'Create from template')}
            onClose={onCancel}
            footer={<>
                <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer">{t('common.cancel', 'Cancel')}</button>
                <button onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer">{t('routines.templates.create', 'Create routines')}</button>
            </>}
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {kinds.map(k => {
                    const Icon = k.icon;
                    return (
                        <button key={k.kind} onClick={() => setKind(k.kind)} className={cn("text-left p-3 rounded-xl border cursor-pointer", kind === k.kind ? "border-cyan-500 bg-cyan-500/10" : "border-[var(--border)] bg-[var(--surface-hover)]")}>
                            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Icon className="w-4 h-4 text-cyan-400" /> {k.title}</div>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{k.desc}</p>
                        </button>
                    );
                })}
            </div>

            {kind !== 'event' && (
                <div className="space-y-3">
                    <DayPicker days={days} onChange={setDays} />
                    <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                        {kind === 'hours' && <>{t('routines.templates.opensAt', 'Opens at')} {timeInput(openTime, setOpenTime)}</>}
                        {kind === 'hours' ? t('routines.templates.closesAt', 'closes at') : t('routines.templates.stopsAt', 'Stops at')} {timeInput(closeTime, setCloseTime)}
                    </div>
                    {kind === 'maintenance' && (
                        <div className="flex gap-4 text-sm text-[var(--text-secondary)]">
                            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={withBackup} onChange={e => setWithBackup(e.target.checked)} className="accent-cyan-500" /> {t('routines.steps.backup', 'Backup')}</label>
                            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={withUpdate} onChange={e => setWithUpdate(e.target.checked)} className="accent-cyan-500" /> {t('routines.steps.updateServer', 'Update server (SteamCMD)')}</label>
                        </div>
                    )}
                </div>
            )}

            {kind === 'event' && (
                <div className="space-y-4">
                    <input value={eventName} onChange={e => setEventName(e.target.value)} className={inputCls} placeholder={t('routines.templates.eventNamePlaceholder', 'Event name (e.g. Weekend 3x)')} />
                    <div className="flex gap-1.5">
                        {(['weekly', 'date'] as const).map(m => (
                            <button key={m} onClick={() => setEventMode(m)} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer", eventMode === m ? "bg-cyan-600 border-cyan-500 text-white" : "bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text-secondary)]")}>
                                {m === 'weekly' ? t('routines.templates.everyWeek', 'Every week') : t('routines.templates.onceDates', 'Once (specific dates)')}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{t('routines.templates.starts', 'Starts')}</div>
                            {eventMode === 'weekly' ? <DayPicker days={startDays} onChange={setStartDays} /> : <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={cn(inputCls, "w-44")} />}
                            {timeInput(openTime, setOpenTime)}
                        </div>
                        <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{t('routines.templates.ends', 'Ends')}</div>
                            {eventMode === 'weekly' ? <DayPicker days={endDays} onChange={setEndDays} /> : <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={cn(inputCls, "w-44")} />}
                            {timeInput(closeTime, setCloseTime)}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                            <span>{t('routines.fields.key', 'INI key (e.g. XPMultiplier)')}</span>
                            <span>{t('routines.templates.duringEvent', 'During')}</span>
                            <span>{t('routines.templates.afterEvent', 'After')}</span>
                            <span />
                        </div>
                        {changes.map((c, i) => (
                            <div key={i} className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2">
                                <input
                                    list="routine-config-keys-tpl"
                                    value={c.key}
                                    onChange={e => {
                                        const known = configKeys.find(k => k.key.toLowerCase() === e.target.value.toLowerCase());
                                        setChanges(changes.map((x, j) => j !== i ? x : known ? { ...x, key: known.key, section: known.section, file: known.file } : { ...x, key: e.target.value }));
                                    }}
                                    className={cn(inputCls, "font-mono")}
                                />
                                <input value={c.eventValue} onChange={e => setChanges(changes.map((x, j) => j === i ? { ...x, eventValue: e.target.value } : x))} className={cn(inputCls, "font-mono")} />
                                <input value={c.normalValue} onChange={e => setChanges(changes.map((x, j) => j === i ? { ...x, normalValue: e.target.value } : x))} className={cn(inputCls, "font-mono")} />
                                <button onClick={() => setChanges(changes.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                        <datalist id="routine-config-keys-tpl">
                            {configKeys.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                        </datalist>
                        <button onClick={() => setChanges([...changes, { key: '', section: 'ServerSettings', file: 'GameUserSettings', eventValue: '', normalValue: '' }])} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer">
                            <Plus className="w-3.5 h-3.5" /> {t('routines.templates.addChange', 'Add value')}
                        </button>
                    </div>
                </div>
            )}

            <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('routines.templates.warnings', 'Player warnings (minutes before)')}</label>
                <input value={warnings} onChange={e => setWarnings(e.target.value)} className={cn(inputCls, "mt-1 font-mono")} placeholder="15, 10, 5, 1" />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    {t('routines.templates.warningsHelp', { minutes: lead, defaultValue: 'Warnings start {{minutes}} min earlier so the stop happens exactly at the chosen time.' })}
                </p>
            </div>
        </Modal>
    );
}
