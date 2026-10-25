import { invoke } from '@tauri-apps/api/core';

/** One routine step — mirrors `RoutineStep` in src-tauri/src/services/routines.rs */
export type RoutineStep =
    | { type: 'broadcast'; message: string }
    | { type: 'countdown'; minutes: number[]; message: string }
    | { type: 'wait'; minutes: number }
    | { type: 'rcon'; command: string }
    | { type: 'saveWorld' }
    | { type: 'stop' }
    | { type: 'start' }
    | { type: 'restart' }
    | { type: 'backup' }
    | { type: 'updateServer' }
    | { type: 'setConfig'; file: 'GameUserSettings' | 'Game'; section: string; key: string; value: string }
    | { type: 'destroyWildDinos' };

export type RoutineStepType = RoutineStep['type'];

export interface Routine {
    id: number;
    serverId: number;
    name: string;
    enabled: boolean;
    /** 5-field cron ("min hour day month weekday") or "@manual" */
    cronExpression: string;
    runOnce: boolean;
    steps: RoutineStep[];
    lastRun?: string | null;
    lastStatus?: 'running' | 'success' | 'failed' | 'cancelled' | null;
    lastError?: string | null;
}

export interface RunningRoutine {
    routineId: number;
    serverId: number;
    name: string;
    stepIndex: number;
    stepCount: number;
    stepLabel: string;
    startedAt: string;
}

export interface RoutineProgressEvent extends Omit<RunningRoutine, 'startedAt'> {
    status: 'running' | 'success' | 'failed' | 'cancelled';
    message?: string | null;
}

export const getRoutines = (serverId?: number) => invoke<Routine[]>('get_routines', { serverId: serverId ?? null });
export const saveRoutine = (routine: Routine) => invoke<number>('save_routine', { routine });
export const deleteRoutine = (id: number) => invoke<void>('delete_routine', { id });
export const setRoutineEnabled = (id: number, enabled: boolean) => invoke<void>('set_routine_enabled', { id, enabled });
export const runRoutineNow = (id: number) => invoke<void>('run_routine_now', { id });
export const cancelRoutine = (serverId: number) => invoke<boolean>('cancel_routine', { serverId });
export const getRunningRoutines = () => invoke<RunningRoutine[]>('get_running_routines');

// ── Schedule helpers ────────────────────────────────────────────────────────────

export type RoutineSchedule =
    | { kind: 'weekly'; days: number[]; time: string } // days: 0 = Sunday … 6 = Saturday
    | { kind: 'date'; date: string; time: string } // date: YYYY-MM-DD (runs once)
    | { kind: 'manual' }
    | { kind: 'cron'; expression: string };

const pad = (n: number) => String(n).padStart(2, '0');

export function scheduleToCron(s: RoutineSchedule): { cronExpression: string; runOnce: boolean } {
    switch (s.kind) {
        case 'manual':
            return { cronExpression: '@manual', runOnce: false };
        case 'cron':
            return { cronExpression: s.expression.trim(), runOnce: false };
        case 'weekly': {
            const [h, m] = s.time.split(':').map(Number);
            const days = [...new Set(s.days)].sort((a, b) => a - b);
            const dow = days.length === 0 || days.length === 7 ? '*' : days.join(',');
            return { cronExpression: `${m} ${h} * * ${dow}`, runOnce: false };
        }
        case 'date': {
            const [, mo, d] = s.date.split('-').map(Number);
            const [h, m] = s.time.split(':').map(Number);
            return { cronExpression: `${m} ${h} ${d} ${mo} *`, runOnce: true };
        }
    }
}

/** Best-effort reverse of scheduleToCron so the editor can show friendly controls */
export function cronToSchedule(cron: string, runOnce: boolean): RoutineSchedule {
    if (cron.trim() === '@manual') return { kind: 'manual' };
    const parts = cron.trim().split(/\s+/);
    if (parts.length === 5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
        const time = `${pad(+parts[1])}:${pad(+parts[0])}`;
        if (parts[2] === '*' && parts[3] === '*' && /^(\*|\d(,\d)*)$/.test(parts[4])) {
            const days = parts[4] === '*' ? [0, 1, 2, 3, 4, 5, 6] : parts[4].split(',').map(Number).map(d => d % 7);
            return { kind: 'weekly', days, time };
        }
        if (runOnce && /^\d+$/.test(parts[2]) && /^\d+$/.test(parts[3]) && parts[4] === '*') {
            const now = new Date();
            const month = +parts[3], day = +parts[2];
            // Pick the next occurrence's year
            const thisYear = new Date(now.getFullYear(), month - 1, day, +parts[1], +parts[0]);
            const year = thisYear < now ? now.getFullYear() + 1 : now.getFullYear();
            return { kind: 'date', date: `${year}-${pad(month)}-${pad(day)}`, time };
        }
    }
    return { kind: 'cron', expression: cron };
}

/**
 * Shift a weekly time back by `minutes` (so a countdown that starts earlier ends exactly at the
 * chosen time). Wrapping before midnight moves the days one back.
 */
export function shiftWeeklyBack(days: number[], time: string, minutes: number): { days: number[]; time: string } {
    const [h, m] = time.split(':').map(Number);
    let total = h * 60 + m - minutes;
    let dayShift = 0;
    while (total < 0) {
        total += 1440;
        dayShift -= 1;
    }
    return {
        days: days.map(d => (((d + dayShift) % 7) + 7) % 7),
        time: `${pad(Math.floor(total / 60))}:${pad(total % 60)}`,
    };
}

/** "15, 10,5 1" → [15, 10, 5, 1] */
export function parseMinuteList(text: string): number[] {
    return [...new Set(text.split(/[\s,;]+/).map(Number).filter(n => Number.isFinite(n) && n > 0).map(Math.round))].sort((a, b) => b - a);
}
