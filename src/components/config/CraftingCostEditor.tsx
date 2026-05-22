import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, Box } from 'lucide-react';

interface ResourceRequirement {
    ResourceItemTypeString: string;
    BaseResourceRequirement: number;
    bCraftingRequireExactResourceType: boolean;
}

interface CraftingCostOverride {
    ItemClassString: string;
    BaseCraftingResourceRequirements: ResourceRequirement[];
}

function parseCraftingCostLine(line: string): CraftingCostOverride {
    const result: CraftingCostOverride = {
        ItemClassString: '',
        BaseCraftingResourceRequirements: []
    };

    const itemMatch = line.match(/ItemClassString="([^"]+)"/);
    if (itemMatch) {
        result.ItemClassString = itemMatch[1];
    }

    const reqsStart = line.indexOf('BaseCraftingResourceRequirements=(');
    if (reqsStart !== -1) {
        const innerStr = line.substring(reqsStart + 'BaseCraftingResourceRequirements=('.length);
        const regex = /\(ResourceItemTypeString="([^"]+)",BaseResourceRequirement=([0-9.]+)(?:,bCraftingRequireExactResourceType=(True|False))?/gi;
        let match;
        while ((match = regex.exec(innerStr)) !== null) {
            result.BaseCraftingResourceRequirements.push({
                ResourceItemTypeString: match[1],
                BaseResourceRequirement: parseFloat(match[2]) || 1.0,
                bCraftingRequireExactResourceType: match[3] ? match[3].toLowerCase() === 'true' : false
            });
        }
    }
    return result;
}

function serializeCraftingCostLine(cost: CraftingCostOverride): string {
    const reqs = cost.BaseCraftingResourceRequirements.map(req => 
        `(ResourceItemTypeString="${req.ResourceItemTypeString}",BaseResourceRequirement=${req.BaseResourceRequirement.toFixed(1)},bCraftingRequireExactResourceType=${req.bCraftingRequireExactResourceType ? 'True' : 'False'})`
    ).join(',');
    return `(ItemClassString="${cost.ItemClassString}",BaseCraftingResourceRequirements=(${reqs}))`;
}

interface CraftingCostEditorProps {
    value: string;
    onChange: (value: string) => void;
}

export function CraftingCostEditor({ value, onChange }: CraftingCostEditorProps) {
    const [entries, setEntries] = useState<CraftingCostOverride[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<CraftingCostOverride | null>(null);

    useEffect(() => {
        if (!value) {
            setEntries([]);
            return;
        }
        const parsed = value.split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('('))
            .map(parseCraftingCostLine);
        setEntries(parsed);
    }, [value]);

    const updateEntries = (newEntries: CraftingCostOverride[]) => {
        setEntries(newEntries);
        onChange(newEntries.map(serializeCraftingCostLine).join('\n'));
    };

    const handleAdd = () => {
        const newEntry: CraftingCostOverride = {
            ItemClassString: 'PrimalItem_NewItem_C',
            BaseCraftingResourceRequirements: []
        };
        const newEntries = [...entries, newEntry];
        updateEntries(newEntries);
        setEditingIndex(newEntries.length - 1);
        setEditForm(newEntry);
    };

    const handleDelete = (index: number) => {
        const newEntries = [...entries];
        newEntries.splice(index, 1);
        updateEntries(newEntries);
        if (editingIndex === index) {
            setEditingIndex(null);
            setEditForm(null);
        } else if (editingIndex !== null && editingIndex > index) {
            setEditingIndex(editingIndex - 1);
        }
    };

    const handleEdit = (index: number) => {
        setEditingIndex(index);
        setEditForm({ ...entries[index], BaseCraftingResourceRequirements: [...entries[index].BaseCraftingResourceRequirements.map(r => ({ ...r }))] });
    };

    const handleSaveEdit = () => {
        if (editingIndex !== null && editForm) {
            const newEntries = [...entries];
            newEntries[editingIndex] = editForm;
            updateEntries(newEntries);
            setEditingIndex(null);
            setEditForm(null);
        }
    };

    const handleCancelEdit = () => {
        setEditingIndex(null);
        setEditForm(null);
    };

    const addResourceRequirement = () => {
        if (!editForm) return;
        setEditForm({
            ...editForm,
            BaseCraftingResourceRequirements: [
                ...editForm.BaseCraftingResourceRequirements,
                {
                    ResourceItemTypeString: 'PrimalItemResource_Wood_C',
                    BaseResourceRequirement: 1.0,
                    bCraftingRequireExactResourceType: false
                }
            ]
        });
    };

    const removeResourceRequirement = (idx: number) => {
        if (!editForm) return;
        const newReqs = [...editForm.BaseCraftingResourceRequirements];
        newReqs.splice(idx, 1);
        setEditForm({
            ...editForm,
            BaseCraftingResourceRequirements: newReqs
        });
    };

    const updateResourceRequirement = (idx: number, field: keyof ResourceRequirement, val: any) => {
        if (!editForm) return;
        const newReqs = [...editForm.BaseCraftingResourceRequirements];
        newReqs[idx] = { ...newReqs[idx], [field]: val };
        setEditForm({
            ...editForm,
            BaseCraftingResourceRequirements: newReqs
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors text-sm font-medium border border-blue-500/30"
                >
                    <Plus className="w-4 h-4" />
                    Add Crafting Cost Override
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {entries.map((entry, idx) => (
                    <div key={idx} className="bg-[#151525] border border-[#2d2d44] rounded-xl overflow-hidden shadow-sm">
                        {editingIndex === idx && editForm ? (
                            <div className="p-4 space-y-5 bg-[#1a1a2e]">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Item to Override (Class Name)</label>
                                    <input
                                        type="text"
                                        value={editForm.ItemClassString}
                                        onChange={(e) => setEditForm({ ...editForm, ItemClassString: e.target.value })}
                                        className="w-full bg-[#0d0d1a] border border-[#2d2d44] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
                                        placeholder="e.g., PrimalItem_WeaponStoneHatchet_C"
                                    />
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-medium text-slate-400">Resource Requirements</label>
                                        <button
                                            onClick={addResourceRequirement}
                                            className="flex items-center gap-1.5 px-2 py-1 bg-[#2d2d44] hover:bg-[#3d3d5c] text-white rounded-md text-xs font-medium transition-colors"
                                        >
                                            <Plus className="w-3 h-3" />
                                            Add Resource
                                        </button>
                                    </div>
                                    
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                        {editForm.BaseCraftingResourceRequirements.length === 0 ? (
                                            <div className="text-center py-4 text-xs text-slate-500 border border-dashed border-[#2d2d44] rounded-lg">
                                                No resources added. This will make the item free to craft.
                                            </div>
                                        ) : (
                                            editForm.BaseCraftingResourceRequirements.map((req, rIdx) => (
                                                <div key={rIdx} className="flex items-center gap-3 bg-[#0d0d1a] p-2 rounded-lg border border-[#2d2d44]">
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={req.ResourceItemTypeString}
                                                                onChange={(e) => updateResourceRequirement(rIdx, 'ResourceItemTypeString', e.target.value)}
                                                                placeholder="Resource Class Name"
                                                                className="flex-1 bg-[#1a1a2e] border border-[#2d2d44] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={req.BaseResourceRequirement}
                                                                onChange={(e) => updateResourceRequirement(rIdx, 'BaseResourceRequirement', parseFloat(e.target.value) || 0)}
                                                                placeholder="Amount"
                                                                className="w-20 bg-[#1a1a2e] border border-[#2d2d44] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                                                            />
                                                        </div>
                                                        <label className="flex items-center gap-2 cursor-pointer group w-fit">
                                                            <div className="relative flex items-center justify-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={req.bCraftingRequireExactResourceType}
                                                                    onChange={(e) => updateResourceRequirement(rIdx, 'bCraftingRequireExactResourceType', e.target.checked)}
                                                                    className="peer sr-only"
                                                                />
                                                                <div className="w-4 h-4 border-2 border-slate-600 rounded bg-slate-900 peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-all"></div>
                                                                <Check className="absolute w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                                            </div>
                                                            <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-300 transition-colors">Require Exact Type</span>
                                                        </label>
                                                    </div>
                                                    <button
                                                        onClick={() => removeResourceRequirement(rIdx)}
                                                        className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-md transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-3 border-t border-[#2d2d44]">
                                    <button
                                        onClick={handleCancelEdit}
                                        className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 flex items-start justify-between group">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg shrink-0 mt-0.5">
                                        <Box className="w-4 h-4" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-white break-all">{entry.ItemClassString}</span>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                            {entry.BaseCraftingResourceRequirements.map((req, rIdx) => (
                                                <span key={rIdx} className="text-xs text-slate-400 bg-[#0d0d1a] px-2 py-0.5 rounded border border-[#2d2d44]">
                                                    {req.BaseResourceRequirement}x <span className="text-blue-300">{req.ResourceItemTypeString.replace(/PrimalItemResource_|_C/g, '')}</span>
                                                </span>
                                            ))}
                                            {entry.BaseCraftingResourceRequirements.length === 0 && (
                                                <span className="text-xs text-emerald-400 font-medium">Free to craft</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4">
                                    <button
                                        onClick={() => handleEdit(idx)}
                                        className="p-1.5 text-slate-400 hover:text-white hover:bg-[#2d2d44] rounded-md transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(idx)}
                                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-md transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {entries.length === 0 && (
                    <div className="text-center py-6 text-sm text-slate-500 bg-[#151525] border border-[#2d2d44] border-dashed rounded-xl">
                        No crafting cost overrides configured. Click add to create one.
                    </div>
                )}
            </div>
        </div>
    );
}
