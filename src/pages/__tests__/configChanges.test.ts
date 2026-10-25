import { describe, it, expect, vi } from 'vitest';

// ConfigEditor pulls in Tauri APIs at import time; stub them so the pure helpers can be tested
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn() }));

const { computeConfigChanges, sameIniValue } = await import('../ConfigEditor');
const { parseIniContent } = await import('../../data/configMappings');

const maps = (gus: string, game: string) => ({ GameUserSettings: parseIniContent(gus), Game: parseIniContent(game) });

describe('sameIniValue', () => {
    it('compares numbers numerically and text case-insensitively', () => {
        expect(sameIniValue('2', '2.000000')).toBe(true);
        expect(sameIniValue('True', 'true')).toBe(true);
        expect(sameIniValue('2', '3')).toBe(false);
        expect(sameIniValue('My Server', 'my server')).toBe(true);
    });
});

describe('computeConfigChanges', () => {
    const saved = maps(
        '[ServerSettings]\nHarvestAmountMultiplier=4.000000\nServerPVE=True\n',
        '[/Script/ShooterGame.ShooterGameMode]\nHarvestXPMultiplier=2.000000\n',
    );

    it('reports nothing when only the number format differs', () => {
        const current = maps(
            '[ServerSettings]\nHarvestAmountMultiplier=4\nServerPVE=true\n',
            '[/Script/ShooterGame.ShooterGameMode]\nHarvestXPMultiplier=2\n',
        );
        expect(computeConfigChanges(current, saved)).toEqual([]);
    });

    it('lists changed and new keys per file', () => {
        const current = maps(
            '[ServerSettings]\nHarvestAmountMultiplier=4\nServerPVE=True\nXPMultiplier=3\n',
            '[/Script/ShooterGame.ShooterGameMode]\nHarvestXPMultiplier=5\n',
        );
        expect(computeConfigChanges(current, saved)).toEqual([
            { file: 'GameUserSettings', section: 'ServerSettings', key: 'XPMultiplier', oldValue: undefined, newValue: '3' },
            { file: 'Game', section: '/Script/ShooterGame.ShooterGameMode', key: 'HarvestXPMultiplier', oldValue: '2.000000', newValue: '5' },
        ]);
    });

    it('ignores cleared (empty) values, which are not written', () => {
        const current = maps('[ServerSettings]\nHarvestAmountMultiplier=\nServerPVE=True\n', '[/Script/ShooterGame.ShooterGameMode]\nHarvestXPMultiplier=2\n');
        expect(computeConfigChanges(current, saved)).toEqual([]);
    });
});
