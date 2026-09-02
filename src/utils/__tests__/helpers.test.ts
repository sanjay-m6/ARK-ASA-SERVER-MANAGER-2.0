import { describe, it, expect } from 'vitest';
import { cn, formatBytes, formatDuration, generateAutoServerName } from '../helpers';

describe('helpers utility functions', () => {
    describe('cn (classNames merger)', () => {
        it('should merge class names cleanly', () => {
            expect(cn('px-2 py-1', 'bg-blue-500')).toBe('px-2 py-1 bg-blue-500');
        });

        it('should resolve tailwind class conflicts correctly', () => {
            expect(cn('p-4', 'p-2')).toBe('p-2');
            expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
        });

        it('should handle conditional falsy values', () => {
            expect(cn('base', false && 'hidden', null, undefined, 'active')).toBe('base active');
        });
    });

    describe('formatBytes', () => {
        it('should return "0 Bytes" for zero', () => {
            expect(formatBytes(0)).toBe('0 Bytes');
        });

        it('should format kilobytes, megabytes, and gigabytes', () => {
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1024 * 1024)).toBe('1 MB');
            expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
            expect(formatBytes(1536, 1)).toBe('1.5 KB');
        });
    });

    describe('formatDuration', () => {
        it('should format seconds only', () => {
            expect(formatDuration(45)).toBe('45s');
            expect(formatDuration(0)).toBe('0s');
        });

        it('should format minutes and seconds', () => {
            expect(formatDuration(125)).toBe('2m 5s');
        });

        it('should format hours, minutes, and seconds', () => {
            expect(formatDuration(3665)).toBe('1h 1m 5s');
        });
    });

    describe('generateAutoServerName', () => {
        it('should generate "server1" when no servers exist', () => {
            expect(generateAutoServerName([])).toBe('server1');
        });

        it('should increment when "server1" already exists', () => {
            const existing = [{ name: 'server1' }];
            expect(generateAutoServerName(existing)).toBe('server2');
        });

        it('should detect case-insensitive and spaced variations', () => {
            const existing = [
                { name: 'Server 1' },
                { name: 'server_2' },
            ];
            expect(generateAutoServerName(existing)).toBe('server3');
        });
    });
});
