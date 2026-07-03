import { useState, useMemo } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, PackageOpen, LayoutList, X } from 'lucide-react';
import { arkItems, arkSupplyCrates } from '../../data/arkItems';
import { parseLootCrateString, stringifyLootCrate, LootCrate } from '../../utils/lootCrateParser';

interface LootCrateEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function LootCrateEditor({ value, onChange }: LootCrateEditorProps) {
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
      <div className="flex justify-between items-center bg-gray-800/50 p-3 rounded-lg border border-gray-700">
        <div>
          <h3 className="font-medium text-white flex items-center">
            <PackageOpen className="w-5 h-5 mr-2 text-primary-400" />
            Loot Crate Overrides
          </h3>
          <p className="text-sm text-gray-400">Override the contents of supply drops and loot crates.</p>
        </div>
        <button
          onClick={addCrate}
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded flex items-center text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Override
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
                    {arkSupplyCrates.find(c => c.id === parsed.SupplyCrateClassString)?.name || parsed.SupplyCrateClassString || 'New Crate Override'}
                  </span>
                  <span className="text-xs text-gray-500">{parsed.ItemSets.length} Item Sets</span>
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
                    <label className="block text-xs font-medium text-gray-400 mb-1">Target Supply Crate Class</label>
                    <input
                      type="text"
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                      value={parsed.SupplyCrateClassString}
                      onChange={(e) => {
                        parsed.SupplyCrateClassString = e.target.value;
                        updateCrate(idx, parsed);
                      }}
                      list="supply-crates"
                    />
                    <datalist id="supply-crates">
                      {arkSupplyCrates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Min Sets Generated</label>
                      <input
                        type="number"
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                        value={parsed.MinItemSets}
                        onChange={(e) => { parsed.MinItemSets = parseFloat(e.target.value); updateCrate(idx, parsed); }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Max Sets Generated</label>
                      <input
                        type="number"
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                        value={parsed.MaxItemSets}
                        onChange={(e) => { parsed.MaxItemSets = parseFloat(e.target.value); updateCrate(idx, parsed); }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium text-gray-300 flex items-center">
                      <LayoutList className="w-4 h-4 mr-2" />
                      Item Sets ({parsed.ItemSets.length})
                    </h4>
                    <button
                      onClick={() => {
                        parsed.ItemSets.push({
                          MinNumItems: 1, MaxNumItems: 1, NumItemsPower: 1.0, SetWeight: 1.0, bItemsRandomWithoutReplacement: true, ItemEntries: []
                        });
                        updateCrate(idx, parsed);
                      }}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-200"
                    >
                      + Add Set
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
                          <span className="font-medium">Item Set {setIdx + 1}</span>
                          <span className="text-xs text-gray-500">({set.ItemEntries.length} items)</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            parsed.ItemSets.splice(setIdx, 1);
                            updateCrate(idx, parsed);
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
                                <label className="block text-xs text-gray-400 mb-1">Set Weight</label>
                                <input
                                  type="number" step="0.1"
                                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                                  value={set.SetWeight}
                                  onChange={(e) => { set.SetWeight = parseFloat(e.target.value); updateCrate(idx, parsed); }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Min Items</label>
                                <input
                                  type="number"
                                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                                  value={set.MinNumItems}
                                  onChange={(e) => { set.MinNumItems = parseFloat(e.target.value); updateCrate(idx, parsed); }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Max Items</label>
                                <input
                                  type="number"
                                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                                  value={set.MaxNumItems}
                                  onChange={(e) => { set.MaxNumItems = parseFloat(e.target.value); updateCrate(idx, parsed); }}
                                />
                              </div>
                              <div className="flex flex-col justify-end">
                                <button
                                  onClick={() => {
                                    set.ItemEntries.push({
                                      EntryWeight: 1.0, ItemClassStrings: [''], ItemsWeights: [1.0], MinQuantity: 1, MaxQuantity: 1, MinQuality: 1.0, MaxQuality: 1.0, bForceBlueprint: false, ChanceToBeBlueprintOverride: 0.0
                                    });
                                    updateCrate(idx, parsed);
                                  }}
                                  className="px-2 py-1 bg-primary-600 hover:bg-primary-500 rounded text-xs text-white"
                                >
                                  + Add Item
                                </button>
                              </div>
                           </div>

                           {set.ItemEntries.length > 0 && (
                             <div className="space-y-2 mt-3">
                               {set.ItemEntries.map((entry, entryIdx) => (
                                 <div key={entryIdx} className="bg-gray-900 border border-gray-700 rounded p-2 flex flex-col gap-2 relative">
                                   <button
                                      onClick={() => {
                                        set.ItemEntries.splice(entryIdx, 1);
                                        updateCrate(idx, parsed);
                                      }}
                                      className="absolute top-2 right-2 text-gray-500 hover:text-red-400"
                                   >
                                      <X className="w-3.5 h-3.5" />
                                   </button>
                                   <div className="pr-6">
                                     <div className="flex items-center justify-between mb-1">
                                       <label className="block text-xs font-medium text-gray-400">Item Classes (Options)</label>
                                       <button
                                         onClick={() => {
                                           entry.ItemClassStrings.push('');
                                           entry.ItemsWeights.push(1.0);
                                           updateCrate(idx, parsed);
                                         }}
                                         className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded border border-gray-600"
                                       >
                                         + Add Option
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
                                               onChange={(e) => { entry.ItemClassStrings[classIdx] = e.target.value; updateCrate(idx, parsed); }}
                                               list="ark-items"
                                               placeholder="e.g. PrimalItemResource_Stone_C"
                                             />
                                           </div>
                                           <div className="w-20 shrink-0 flex items-center gap-1" title="Probability weight relative to other options in this entry">
                                             <label className="text-[10px] text-gray-500">Wt:</label>
                                             <input
                                               type="number"
                                               step="0.1"
                                               className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-sm text-gray-200"
                                               value={entry.ItemsWeights[classIdx] !== undefined ? entry.ItemsWeights[classIdx] : 1.0}
                                               onChange={(e) => { entry.ItemsWeights[classIdx] = parseFloat(e.target.value) || 0; updateCrate(idx, parsed); }}
                                             />
                                           </div>
                                           {entry.ItemClassStrings.length > 1 && (
                                             <button
                                               onClick={() => {
                                                 entry.ItemClassStrings.splice(classIdx, 1);
                                                 entry.ItemsWeights.splice(classIdx, 1);
                                                 updateCrate(idx, parsed);
                                               }}
                                               className="text-gray-500 hover:text-red-400 p-1 shrink-0"
                                               title="Remove Option"
                                             >
                                               <X className="w-3.5 h-3.5" />
                                             </button>
                                           )}
                                         </div>
                                       ))}
                                     </div>
                                     <datalist id="ark-items">
                                        {arkItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                                     </datalist>
                                   </div>
                                   <div className="grid grid-cols-5 gap-2">
                                     <div>
                                        <label className="block text-[10px] text-gray-500">Weight</label>
                                        <input type="number" step="0.1" className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.EntryWeight} onChange={(e) => { entry.EntryWeight = parseFloat(e.target.value); updateCrate(idx, parsed); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">Min Qty</label>
                                        <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MinQuantity} onChange={(e) => { entry.MinQuantity = parseFloat(e.target.value); updateCrate(idx, parsed); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">Max Qty</label>
                                        <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MaxQuantity} onChange={(e) => { entry.MaxQuantity = parseFloat(e.target.value); updateCrate(idx, parsed); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">Min Quality</label>
                                        <input type="number" step="0.1" className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MinQuality} onChange={(e) => { entry.MinQuality = parseFloat(e.target.value); updateCrate(idx, parsed); }} />
                                     </div>
                                     <div>
                                        <label className="block text-[10px] text-gray-500">Max Quality</label>
                                        <input type="number" step="0.1" className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200" value={entry.MaxQuality} onChange={(e) => { entry.MaxQuality = parseFloat(e.target.value); updateCrate(idx, parsed); }} />
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
            <p className="text-gray-400">No loot crate overrides yet.</p>
            <button
              onClick={addCrate}
              className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
            >
              Add First Override
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


