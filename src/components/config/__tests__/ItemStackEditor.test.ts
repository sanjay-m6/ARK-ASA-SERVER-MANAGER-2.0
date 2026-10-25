import { describe, it, expect } from 'vitest';
import { parseLine, serializeLine, ITEM_CATALOG } from '../ItemStackEditor';
import { parseIniContent, generateIniContent } from '../../../data/configMappings';

// Real lines from a migrated ASE server's Game.ini
const LINES = [
    '(ItemClassString="PrimalItemConsumable_RawMutton_C",Quantity=(MaxItemQuantity=5,bIgnoreMultiplier=True))',
    '(ItemClassString="PrimalItemResource_Thatch_C",Quantity=(MaxItemQuantity=2000,bIgnoreMultiplier=True))',
    '(ItemClassString="PrimalItemResource_Polymer_Organic_C",Quantity=(MaxItemQuantity=80,bIgnoreMultiplier=True))',
];

describe('ItemStackEditor parse/serialize', () => {
    it('round-trips real ConfigOverrideItemMaxQuantity entries unchanged', () => {
        for (const line of LINES) {
            const parsed = parseLine(line);
            expect(parsed).not.toBeNull();
            expect(serializeLine(parsed!)).toBe(line);
        }
    });

    it('parses quantity and multiplier flag', () => {
        expect(parseLine(LINES[1])).toEqual({ itemClass: 'PrimalItemResource_Thatch_C', maxQuantity: 2000, ignoreMultiplier: true });
        expect(parseLine('(ItemClassString="PrimalItemConsumable_RawMeat_C",Quantity=(MaxItemQuantity=200))'))
            .toEqual({ itemClass: 'PrimalItemConsumable_RawMeat_C', maxQuantity: 200, ignoreMultiplier: false });
    });

    it('ignores lines without an item class', () => {
        expect(parseLine('(Quantity=(MaxItemQuantity=10))')).toBeNull();
    });

    it('keeps every duplicate key through the INI parse/generate cycle', () => {
        const ini = '[/Script/ShooterGame.ShooterGameMode]\n' + LINES.map(l => `ConfigOverrideItemMaxQuantity=${l}`).join('\n') + '\n';
        const value = parseIniContent(ini).get('/Script/ShooterGame.ShooterGameMode')!.get('ConfigOverrideItemMaxQuantity')!;
        expect(value.split('\n')).toEqual(LINES);
        const out = generateIniContent(parseIniContent(ini));
        expect(out.match(/ConfigOverrideItemMaxQuantity=/g)).toHaveLength(LINES.length);
    });

    it('has no duplicate classes in the catalog', () => {
        const classes = ITEM_CATALOG.map(i => i.cls.toLowerCase());
        expect(new Set(classes).size).toBe(classes.length);
    });
});
