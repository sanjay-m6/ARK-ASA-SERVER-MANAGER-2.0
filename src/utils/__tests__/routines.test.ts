import { describe, it, expect } from 'vitest';
import { scheduleToCron, cronToSchedule, shiftWeeklyBack, parseMinuteList } from '../routines';

describe('routine schedules', () => {
    it('builds weekly cron (0 = Sunday) and reads it back', () => {
        const cron = scheduleToCron({ kind: 'weekly', days: [5, 1, 3], time: '18:30' });
        expect(cron).toEqual({ cronExpression: '30 18 * * 1,3,5', runOnce: false });
        expect(cronToSchedule(cron.cronExpression, false)).toEqual({ kind: 'weekly', days: [1, 3, 5], time: '18:30' });
    });

    it('uses * when every day is selected', () => {
        expect(scheduleToCron({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '03:00' }).cronExpression).toBe('0 3 * * *');
        expect(cronToSchedule('0 3 * * *', false)).toEqual({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '03:00' });
    });

    it('specific dates run once', () => {
        expect(scheduleToCron({ kind: 'date', date: '2026-12-25', time: '20:05' })).toEqual({ cronExpression: '5 20 25 12 *', runOnce: true });
        const s = cronToSchedule('5 20 25 12 *', true);
        expect(s.kind).toBe('date');
        if (s.kind === 'date') {
            expect(s.date.endsWith('-12-25')).toBe(true);
            expect(s.time).toBe('20:05');
        }
    });

    it('manual and custom cron', () => {
        expect(scheduleToCron({ kind: 'manual' })).toEqual({ cronExpression: '@manual', runOnce: false });
        expect(cronToSchedule('@manual', false)).toEqual({ kind: 'manual' });
        expect(cronToSchedule('*/15 * * * *', false)).toEqual({ kind: 'cron', expression: '*/15 * * * *' });
    });

    it('shifts the countdown start back, wrapping to the previous day', () => {
        expect(shiftWeeklyBack([1, 5], '23:00', 15)).toEqual({ days: [1, 5], time: '22:45' });
        // 00:10 minus 15 min = 23:55 the day before (Monday → Sunday, Sunday → Saturday)
        expect(shiftWeeklyBack([1, 0], '00:10', 15)).toEqual({ days: [0, 6], time: '23:55' });
    });

    it('parses minute lists', () => {
        expect(parseMinuteList('1, 15,5 10;5')).toEqual([15, 10, 5, 1]);
        expect(parseMinuteList('abc, 0, -2')).toEqual([]);
    });
});
