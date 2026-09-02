import { describe, it, expect } from 'vitest';
import { parseLootCrateString, stringifyLootCrate, LootCrate } from '../lootCrateParser';

describe('lootCrateParser', () => {
    it('should parse a basic ARK loot crate INI configuration', () => {
        const iniLine = `ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="SupplyCrate_Level03_C",MinItemSets=1,MaxItemSets=2,NumItemSetsPower=1.0,bSetsRandomWithoutReplacement=true,ItemSets=((MinNumItems=1,MaxNumItems=3,NumItemsPower=1.0,SetWeight=1.0,bItemsRandomWithoutReplacement=true,ItemEntries=((EntryWeight=1.0,ItemClassStrings=("PrimalItemResource_Metal_C"),ItemsWeights=(1.0),MinQuantity=100.0,MaxQuantity=200.0,MinQuality=1.0,MaxQuality=1.0,bForceBlueprint=false,ChanceToBeBlueprintOverride=0.0)))))`;

        const parsed = parseLootCrateString(iniLine);
        expect(parsed).not.toBeNull();
        expect(parsed?.SupplyCrateClassString).toBe('SupplyCrate_Level03_C');
        expect(parsed?.MinItemSets).toBe(1);
        expect(parsed?.MaxItemSets).toBe(2);
        expect(parsed?.ItemSets.length).toBe(1);

        const firstSet = parsed?.ItemSets[0];
        expect(firstSet?.MinNumItems).toBe(1);
        expect(firstSet?.MaxNumItems).toBe(3);
        expect(firstSet?.ItemEntries.length).toBe(1);

        const firstEntry = firstSet?.ItemEntries[0];
        expect(firstEntry?.ItemClassStrings).toEqual(['PrimalItemResource_Metal_C']);
        expect(firstEntry?.MinQuantity).toBe(100.0);
        expect(firstEntry?.MaxQuantity).toBe(200.0);
    });

    it('should serialize a LootCrate object back to a valid INI format', () => {
        const crate: LootCrate = {
            SupplyCrateClassString: 'SupplyCrate_Cave_QualityTier1_C',
            MinItemSets: 1,
            MaxItemSets: 2,
            NumItemSetsPower: 1.0,
            bSetsRandomWithoutReplacement: true,
            ItemSets: [
                {
                    MinNumItems: 1,
                    MaxNumItems: 2,
                    NumItemsPower: 1.0,
                    SetWeight: 1.0,
                    bItemsRandomWithoutReplacement: true,
                    ItemEntries: [
                        {
                            EntryWeight: 1.0,
                            ItemClassStrings: ['PrimalItemArmor_ClothBoots_C'],
                            ItemsWeights: [1.0],
                            MinQuantity: 1,
                            MaxQuantity: 1,
                            MinQuality: 1,
                            MaxQuality: 2,
                            bForceBlueprint: true,
                            ChanceToBeBlueprintOverride: 0.5,
                        },
                    ],
                },
            ],
        };

        const serialized = stringifyLootCrate(crate);
        expect(serialized).toContain('SupplyCrateClassString="SupplyCrate_Cave_QualityTier1_C"');
        expect(serialized).toContain('ItemClassStrings=("PrimalItemArmor_ClothBoots_C")');
        expect(serialized).toContain('bForceBlueprint=True');
    });

    it('should round-trip parse and stringify idempotently', () => {
        const crate: LootCrate = {
            SupplyCrateClassString: 'SupplyCrate_Ocean_QualityTier3_C',
            MinItemSets: 2,
            MaxItemSets: 4,
            NumItemSetsPower: 1.0,
            bSetsRandomWithoutReplacement: false,
            ItemSets: [
                {
                    MinNumItems: 1,
                    MaxNumItems: 1,
                    NumItemsPower: 1.0,
                    SetWeight: 0.8,
                    bItemsRandomWithoutReplacement: true,
                    ItemEntries: [
                        {
                            EntryWeight: 1.0,
                            ItemClassStrings: ['PrimalItem_WeaponRifle_C'],
                            ItemsWeights: [1.0],
                            MinQuantity: 1,
                            MaxQuantity: 1,
                            MinQuality: 3,
                            MaxQuality: 5,
                            bForceBlueprint: false,
                            ChanceToBeBlueprintOverride: 0.1,
                        },
                    ],
                },
            ],
        };

        const serialized1 = stringifyLootCrate(crate);
        const reparsed = parseLootCrateString(serialized1);
        expect(reparsed).not.toBeNull();
        expect(reparsed?.SupplyCrateClassString).toBe(crate.SupplyCrateClassString);
        expect(reparsed?.ItemSets[0].ItemEntries[0].ItemClassStrings[0]).toBe('PrimalItem_WeaponRifle_C');
    });
});
