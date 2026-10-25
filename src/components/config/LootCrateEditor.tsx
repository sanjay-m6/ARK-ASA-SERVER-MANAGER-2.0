import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, ChevronRight, PackageOpen, LayoutList, X } from 'lucide-react';
import { arkItems, arkSupplyCrates } from '../../data/arkItems';
import { parseLootCrateString, stringifyLootCrate, LootCrate } from '../../utils/lootCrateParser';
import { NumberInput } from '../ui/NumberInput';

interface LootCrateEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function LootCrateEditor({ value, onChange }: LootCrateEditorProps) {
  const { t } = useTranslation();
  const [expandedCrates, setExpandedCrates] = useState<Record<number, boolean>>({});
  const [expandedSets, setExpandedSets] = useState<Record<string, boolean>>({});

  const crates = useMemo(() => {
    const lines = typeof value === 'string' && value ? value.split('\n') : [];
    return lines
      .map((str, idx) => ({ idx, parsed: parseLootCrateString(str.trim()) }))
      .filter(item => item.parsed !== null) as { idx: number; parsed: LootCrate }[];
  }, [value]);

  const updateCrate = (idx: number, newCrate: LootCrate) => {
    const lines = typeof value === 'string' && value ? value.split('\n') : [];
    lines[idx] = stringifyLootCrate(newCrate);
    onChange(lines.join('\n'));
  };

  /** Deep-clone a parsed crate so we never mutate the useMemo cache */
  const cloneCrate = (crate: LootCrate): LootCrate => structuredClone(crate);

  const removeCrate = (idx: number) => {
    const lines = typeof value === 'string' && value ? value.split('\n') : [];
    lines.splice(idx, 1);
    onChange(lines.join('\n'));
  };

  const addCrate = () => {
    const newCrate: LootCrate = {
      SupplyCrateClassString: 'SupplyCrate_Level03_C',
      MinItemSets: 1,
      MaxItemSets: 1,
      NumItemSetsPower: 1.0,
      bSetsRandomWithoutReplacement: true,
      ItemSets: []
    };
    const lines = typeof value === 'string' && value ? value.split('\n') : [];
    onChange([...lines, stringifyLootCrate(newCrate)].join('\n'));
  };

  const toggleCrate = (idx: number) => {
    setExpandedCrates(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleSet = (crateIdx: number, setIdx: number) => {
    const key = `${crateIdx}-${setIdx}`;
    setExpandedSets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      {/* Render datalists ONCE at top level — not inside loops (Bug 4 fix) */}
      <datalist id="supply-crates">
        {arkSupplyCrates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </datalist>
      <datalist id="ark-items">
        {arkItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </datalist>

      <div className="flex justify-between items-center bg-gray-800/50 p-3 rounded-lg border border-gray-700">
        <div>
          <h3 className="font-medium text-white flex items-center">
            <PackageOpen className="w-5 h-5 mr-2 text-primary-400" />
            {t('lootCrateEditor.title', 'Loot Crate Overrides')}
          </h3>
          <p className="text-sm text-gray-400">{t('lootCrateEditor.subtitle', 'Override the contents of supply drops and loot crates.')}</p>
        </div>
        <button
          onClick={addCrate}
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded flex items-center text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t('lootCrateEditor.addOverride', 'Add Override')}
        </button>
      </div>

      <div className="space-y-3">
        {crates.map(({ idx, parsed }) => (
          <div key={idx} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div 
              className="flex items-center justify-between p-3 bg-gray-900/50 cursor-pointer hover:bg-gray-700/50 transition-colors"
              onClick={() => toggleCrate(idx)}
            >
              <div className="flex items-center space-x-3">
                {expandedCrates[idx] ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                <div className="flex flex-col">
                  <span className="font-medium text-gray-200">
                    {arkSupplyCrates.find(c => c.id === parsed.SupplyCrateClassString)?.name || parsed.SupplyCrateClassString || t('lootCrateEditor.newCrate', 'New Crate Override')}
                  </span>
                  <span className="text-xs text-gray-500">{t('lootCrateEditor.itemSetsCount', { defaultValue: '{{count}} Item Sets', count: parsed.ItemSets.length })}</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeCrate(idx); }}
                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {expandedCrates[idx] && (
              <div className="p-4 space-y-6 border-t border-gray-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">{t('lootCrateEditor.targetCrate', 'Target Supply Crate Class')}</label>
                    <input
                      type="text"
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                      value={parsed.SupplyCrateClassString}
                      onChange={(e) => {
                        const clone = cloneCrate(parsed);
                        clone.SupplyCrateClassString = e.target.value;
                        updateCrate(idx, clone);
                      }}
                      list="supply-crates"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">{t('lootCrateEditor.minSets', 'Min Sets Generated')}</label>
                      <NumberInput
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                        value={parsed.MinItemSets}
                        onValueChange={(n) => { const clone = cloneCrate(parsed); clone.MinItemSets = n; updateCrate(idx, clone); }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">{t('lootCrateEditor.maxSets', 'Max Sets Generated')}</label>
                      <NumberInput
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                        value={parsed.MaxItemSets}
                        onValueChange={(n) => { const clone = cloneCrate(parsed); clone.MaxItemSets = n; updateCrate(idx, clone); }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium text-gray-300 flex items-center">
                      <LayoutList className="w-4 h-4 mr-2" />
                      {t('lootCrateEditor.itemSets', 'Item Sets')} ({parsed.ItemSets.length})
                    </h4>
                    <button
                      onClick={() => {
                        const clone = cloneCrate(parsed);
                        clone.ItemSets.push({
                          MinNumItems: 1, MaxNumItems: 1, NumItemsPower: 1.0, SetWeight: 1.0, bItemsRandomWithoutReplacement: true, ItemEntries: []
                        });
                        updateCrate(idx, clone);
                      }}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-200"
                    >
                      {t('lootCrateEditor.addSet', '+ Add Set')}
                    </button>
                  </div>

                  {parsed.ItemSets.map((set, setIdx) => (
                    <div key={setIdx} className="border border-gray-700 rounded bg-gray-800/50 overflow-hidden">
                      <div 
                        className="flex items-center justify-between p-2 bg-gray-900/30 cursor-pointer hover:bg-gray-700/50"
                        onClick={() => toggleSet(idx, setIdx)}
                      >
                        <div className="flex items-center space-x-2 text-sm text-gray-300">
                          {expandedSets[`${idx}-${setIdx}`] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <span className="font-medium">{t('lootCrateEditor.itemSet', { defaultValue: 'Item Set {{index}}', index: setIdx + 1 })}</span>
                          <span className="text-xs text-gray-500">({t('lootCrateEditor.itemsCount', { defaultValue: '{{count}} items', count: set.ItemEntries.length })})</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const clone = cloneCrate(parsed);
                            clone.ItemSets.splice(setIdx, 1);
                            updateCrate(idx, clone);
                          }}
                          className="text-gray-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {expandedSets[`${idx}-${setIdx}`] && (
                        <div className="p-3 border-t border-gray-700 space-y-4">
                           <div className="grid grid-cols-4 gap-3">
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">{t('lootCrateEditor.setWeight', 'Set Weight')}</label>
                                <NumberInput
                                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                                  value={set.SetWeight}
                                  onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].SetWeight = n; updateCrate(idx, clone); }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">{t('lootCrateEditor.minItems', 'Min Items')}</label>
                                <NumberInput
                                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                                  value={set.MinNumItems}
                                  onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].MinNumItems = n; updateCrate(idx, clone); }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">{t('lootCrateEditor.maxItems', 'Max Items')}</label>
                                <NumberInput
                                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                                  value={set.MaxNumItems}
                                  onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].MaxNumItems = n; updateCrate(idx, clone); }}
                                />
                              </div>
                              <div className="flex flex-col justify-end">
                                <button
                                  onClick={() => {
                                    const clone = cloneCrate(parsed);
                                    clone.ItemSets[setIdx].ItemEntries.push({
                                      EntryWeight: 1.0, ItemClassStrings: [''], ItemsWeights: [1.0], MinQuantity: 1, MaxQuantity: 1, MinQuality: 1.0, MaxQuality: 1.0, bForceBlueprint: false, ChanceToBeBlueprintOverride: 0.0
                                    });
                                    updateCrate(idx, clone);
                                  }}
                                  className="px-2 py-1 bg-primary-600 hover:bg-primary-500 rounded text-xs text-white"
                                >
                                  {t('lootCrateEditor.addItem', '+ Add Item')}
                                </button>
                              </div>
                           </div>

                           {set.ItemEntries.length > 0 && (
                             <div className="space-y-2 mt-3">
                               {set.ItemEntries.map((entry, entryIdx) => (
                                 <div key={entryIdx} className="bg-gray-900 border border-gray-700 rounded p-2 flex flex-col gap-2 relative">
                                   <button
                                      onClick={() => {
                                        const clone = cloneCrate(parsed);
                                        clone.ItemSets[setIdx].ItemEntries.splice(entryIdx, 1);
                                        updateCrate(idx, clone);
                                      }}
                                      className="absolute top-2 right-2 text-gray-500 hover:text-red-400"
                                   >
                                      <X className="w-3.5 h-3.5" />
                                   </button>
                                   <div className="pr-6">
                                     <div className="flex items-center justify-between mb-1">
                                       <label className="block text-xs font-medium text-gray-400">{t('lootCrateEditor.itemClasses', 'Item Classes (Options)')}</label>
                                       <button
                                         onClick={() => {
                                           const clone = cloneCrate(parsed);
                                           clone.ItemSets[setIdx].ItemEntries[entryIdx].ItemClassStrings.push('');
                                           clone.ItemSets[setIdx].ItemEntries[entryIdx].ItemsWeights.push(1.0);
                                           updateCrate(idx, clone);
                                         }}
                                         className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded border border-gray-600"
                                       >
                                         {t('lootCrateEditor.addOption', '+ Add Option')}
                                       </button>
                                     </div>
                                     <div className="space-y-1.5">
                                       {entry.ItemClassStrings.map((itemClass, classIdx) => (
                                         <div key={classIdx} className="flex gap-2 items-center">
                                           <div className="flex-grow">
                                             <input
                                               type="text"
                                               className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                                               value={itemClass}
                                               onChange={(e) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].ItemEntries[entryIdx].ItemClassStrings[classIdx] = e.target.value; updateCrate(idx, clone); }}
                                               list="ark-items"
                                               placeholder={t('lootCrateEditor.itemPlaceholder', 'e.g. PrimalItemResource_Stone_C')}
                                             />
                                           </div>
                                           <div className="w-20 shrink-0 flex items-center gap-1" title={t('lootCrateEditor.weightTitle', 'Probability weight relative to other options in this entry')}>
                                             <label className="text-[10px] text-gray-500">{t('lootCrateEditor.wt', 'Wt:')}</label>
                                             <NumberInput
                                               className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-sm text-gray-200"
                                               value={entry.ItemsWeights[classIdx] !== undefined ? entry.ItemsWeights[classIdx] : 1.0}
                                               onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].ItemEntries[entryIdx].ItemsWeights[classIdx] = n; updateCrate(idx, clone); }}
                                             />
                                           </div>
                                           {entry.ItemClassStrings.length > 1 && (
                                             <button
                                               onClick={() => {
                                                 const clone = cloneCrate(parsed);
                                                 clone.ItemSets[setIdx].ItemEntries[entryIdx].ItemClassStrings.splice(classIdx, 1);
                                                 clone.ItemSets[setIdx].ItemEntries[entryIdx].ItemsWeights.splice(classIdx, 1);
                                                 updateCrate(idx, clone);
                                               }}
                                               className="text-gray-500 hover:text-red-400 p-1 shrink-0"
                                               title={t('lootCrateEditor.removeOption', 'Remove Option')}
                                             >
                                               <X className="w-3.5 h-3.5" />
                                             </button>
                                           )}
                                         </div>
                                       ))}
                                     </div>
                                   </div>
                                   <div className="grid grid-cols-5 gap-2">
                                     <div>
                                        <label className="block text-[10px] text-gray-500">{t('lootCrateEditor.weight', 'Weight')}</label>
                                        <NumberInput className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.EntryWeight} onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].ItemEntries[entryIdx].EntryWeight = n; updateCrate(idx, clone); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">{t('lootCrateEditor.minQty', 'Min Qty')}</label>
                                        <NumberInput className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MinQuantity} onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].ItemEntries[entryIdx].MinQuantity = n; updateCrate(idx, clone); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">{t('lootCrateEditor.maxQty', 'Max Qty')}</label>
                                        <NumberInput className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MaxQuantity} onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].ItemEntries[entryIdx].MaxQuantity = n; updateCrate(idx, clone); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">{t('lootCrateEditor.minQuality', 'Min Quality')}</label>
                                        <NumberInput className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MinQuality} onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].ItemEntries[entryIdx].MinQuality = n; updateCrate(idx, clone); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">{t('lootCrateEditor.maxQuality', 'Max Quality')}</label>
                                        <NumberInput className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MaxQuality} onValueChange={(n) => { const clone = cloneCrate(parsed); clone.ItemSets[setIdx].ItemEntries[entryIdx].MaxQuality = n; updateCrate(idx, clone); }} />
                                     </div>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {crates.length === 0 && (
          <div className="text-center py-8 bg-gray-800/50 border border-gray-700 border-dashed rounded-lg">
            <PackageOpen className="w-8 h-8 mx-auto text-gray-500 mb-2" />
            <p className="text-gray-400">{t('lootCrateEditor.empty', 'No loot crate overrides yet.')}</p>
            <button
              onClick={addCrate}
              className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
            >
              {t('lootCrateEditor.addFirst', 'Add First Override')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
