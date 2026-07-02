// src/utils/lootCrateParser.ts

export interface CrateItemEntry {
  EntryWeight: number;
  ItemClassStrings: string[];
  ItemsWeights: number[];
  MinQuantity: number;
  MaxQuantity: number;
  MinQuality: number;
  MaxQuality: number;
  bForceBlueprint: boolean;
  ChanceToBeBlueprintOverride: number;
}

export interface CrateItemSet {
  MinNumItems: number;
  MaxNumItems: number;
  NumItemsPower: number;
  SetWeight: number;
  bItemsRandomWithoutReplacement: boolean;
  ItemEntries: CrateItemEntry[];
}

export interface LootCrate {
  SupplyCrateClassString: string;
  MinItemSets: number;
  MaxItemSets: number;
  NumItemSetsPower: number;
  bSetsRandomWithoutReplacement: boolean;
  ItemSets: CrateItemSet[];
}

export function parseLootCrateString(str: string): LootCrate | null {
  try {
    // Quick and dirty parser for ARK's specific INI format
    // e.g. ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="SupplyCrate_Level03_C",MinItemSets=1,MaxItemSets=1,NumItemSetsPower=1.0,bSetsRandomWithoutReplacement=true,ItemSets=((MinNumItems=1,...)))
    
    let content = str.replace(/^ConfigOverrideSupplyCrateItems=/, '').trim();
    if (content.startsWith('(') && content.endsWith(')')) {
      content = content.substring(1, content.length - 1);
    }

    const crate: LootCrate = {
      SupplyCrateClassString: '',
      MinItemSets: 1,
      MaxItemSets: 1,
      NumItemSetsPower: 1.0,
      bSetsRandomWithoutReplacement: true,
      ItemSets: []
    };

    const extractValue = (key: string, text: string, type: 'string' | 'number' | 'boolean') => {
      const regex = new RegExp(`${key}=(.*?)(?:,|\\)$)`);
      const match = text.match(regex);
      if (!match) return null;
      let val = match[1].trim();
      
      if (val.includes('ItemSets=')) {
        val = val.split('ItemSets=')[0].replace(/,$/, '');
      }

      if (type === 'string') return val.replace(/^"|"$/g, '');
      if (type === 'number') return parseFloat(val);
      if (type === 'boolean') return val.toLowerCase() === 'true';
      return val;
    };

    crate.SupplyCrateClassString = extractValue('SupplyCrateClassString', content, 'string') as string || '';
    crate.MinItemSets = extractValue('MinItemSets', content, 'number') as number ?? 1;
    crate.MaxItemSets = extractValue('MaxItemSets', content, 'number') as number ?? 1;
    crate.NumItemSetsPower = extractValue('NumItemSetsPower', content, 'number') as number ?? 1.0;
    crate.bSetsRandomWithoutReplacement = extractValue('bSetsRandomWithoutReplacement', content, 'boolean') as boolean ?? true;

    const itemSetsStrMatch = content.match(/ItemSets=\((.*)\)$/s);
    if (itemSetsStrMatch) {
      let setsStr = itemSetsStrMatch[1];
      
      let bracketLevel = 0;
      let currentSet = '';
      const sets: string[] = [];
      
      for (let i = 0; i < setsStr.length; i++) {
        if (setsStr[i] === '(') bracketLevel++;
        else if (setsStr[i] === ')') bracketLevel--;
        
        currentSet += setsStr[i];
        
        if (bracketLevel === 0 && currentSet.trim() !== '' && currentSet.trim() !== ',') {
           if (currentSet.startsWith(',')) currentSet = currentSet.substring(1);
           sets.push(currentSet.trim());
           currentSet = '';
        }
      }

      for (const setStr of sets) {
        let cleanSetStr = setStr;
        if (cleanSetStr.startsWith('(') && cleanSetStr.endsWith(')')) {
          cleanSetStr = cleanSetStr.substring(1, cleanSetStr.length - 1);
        }

        const set: CrateItemSet = {
          MinNumItems: extractValue('MinNumItems', cleanSetStr, 'number') as number ?? 1,
          MaxNumItems: extractValue('MaxNumItems', cleanSetStr, 'number') as number ?? 1,
          NumItemsPower: extractValue('NumItemsPower', cleanSetStr, 'number') as number ?? 1.0,
          SetWeight: extractValue('SetWeight', cleanSetStr, 'number') as number ?? 1.0,
          bItemsRandomWithoutReplacement: extractValue('bItemsRandomWithoutReplacement', cleanSetStr, 'boolean') as boolean ?? true,
          ItemEntries: []
        };

        const entriesStrMatch = cleanSetStr.match(/ItemEntries=\((.*)\)$/s);
        if (entriesStrMatch) {
          let entriesStr = entriesStrMatch[1];
          let eBracketLevel = 0;
          let currentEntry = '';
          const entries: string[] = [];
          
          for (let i = 0; i < entriesStr.length; i++) {
            if (entriesStr[i] === '(') eBracketLevel++;
            else if (entriesStr[i] === ')') eBracketLevel--;
            
            currentEntry += entriesStr[i];
            
            if (eBracketLevel === 0 && currentEntry.trim() !== '' && currentEntry.trim() !== ',') {
               if (currentEntry.startsWith(',')) currentEntry = currentEntry.substring(1);
               entries.push(currentEntry.trim());
               currentEntry = '';
            }
          }

          for (const entryStr of entries) {
            let cleanEntryStr = entryStr;
            if (cleanEntryStr.startsWith('(') && cleanEntryStr.endsWith(')')) {
               cleanEntryStr = cleanEntryStr.substring(1, cleanEntryStr.length - 1);
            }

            const itemClassesMatch = cleanEntryStr.match(/ItemClassStrings=\("([^"]+)"\)/);
            const itemClasses = itemClassesMatch ? [itemClassesMatch[1]] : [];

            const itemWeightsMatch = cleanEntryStr.match(/ItemsWeights=\(([\d.]+)\)/);
            const itemWeights = itemWeightsMatch ? [parseFloat(itemWeightsMatch[1])] : [];

            set.ItemEntries.push({
              EntryWeight: extractValue('EntryWeight', cleanEntryStr, 'number') as number ?? 1.0,
              ItemClassStrings: itemClasses,
              ItemsWeights: itemWeights,
              MinQuantity: extractValue('MinQuantity', cleanEntryStr, 'number') as number ?? 1.0,
              MaxQuantity: extractValue('MaxQuantity', cleanEntryStr, 'number') as number ?? 1.0,
              MinQuality: extractValue('MinQuality', cleanEntryStr, 'number') as number ?? 1.0,
              MaxQuality: extractValue('MaxQuality', cleanEntryStr, 'number') as number ?? 1.0,
              bForceBlueprint: extractValue('bForceBlueprint', cleanEntryStr, 'boolean') as boolean ?? false,
              ChanceToBeBlueprintOverride: extractValue('ChanceToBeBlueprintOverride', cleanEntryStr, 'number') as number ?? 0.0,
            });
          }
        }
        
        crate.ItemSets.push(set);
      }
    }
    
    return crate;
  } catch (e) {
    console.error('Failed to parse loot crate string', e);
    return null;
  }
}

export function stringifyLootCrate(crate: LootCrate): string {
  const setsStrings = crate.ItemSets.map(set => {
    const entriesStrings = set.ItemEntries.map(entry => {
      const classStr = `ItemClassStrings=("${entry.ItemClassStrings[0] || ''}")`;
      const weightStr = `ItemsWeights=(${entry.ItemsWeights[0] || 1.0})`;
      return `(EntryWeight=${entry.EntryWeight.toFixed(4)},${classStr},${weightStr},MinQuantity=${entry.MinQuantity.toFixed(4)},MaxQuantity=${entry.MaxQuantity.toFixed(4)},MinQuality=${entry.MinQuality.toFixed(4)},MaxQuality=${entry.MaxQuality.toFixed(4)},bForceBlueprint=${entry.bForceBlueprint ? 'True' : 'False'},ChanceToBeBlueprintOverride=${entry.ChanceToBeBlueprintOverride.toFixed(4)})`;
    }).join(',');

    return `(MinNumItems=${set.MinNumItems},MaxNumItems=${set.MaxNumItems},NumItemsPower=${set.NumItemsPower.toFixed(4)},SetWeight=${set.SetWeight.toFixed(4)},bItemsRandomWithoutReplacement=${set.bItemsRandomWithoutReplacement ? 'True' : 'False'},ItemEntries=(${entriesStrings}))`;
  }).join(',');

  return `ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="${crate.SupplyCrateClassString}",MinItemSets=${crate.MinItemSets},MaxItemSets=${crate.MaxItemSets},NumItemSetsPower=${crate.NumItemSetsPower.toFixed(4)},bSetsRandomWithoutReplacement=${crate.bSetsRandomWithoutReplacement ? 'True' : 'False'},ItemSets=(${setsStrings}))`;
}
