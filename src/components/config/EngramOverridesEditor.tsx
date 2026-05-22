import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check } from 'lucide-react';
interface EngramOverride {
    EngramClassName: string;
    EngramHidden: boolean;
    EngramPointsCost: number;
    EngramLevelRequirement: number;
    RemoveEngramPreReq: boolean;
}

function parseEngramLine(line: string): EngramOverride {
    const defaultEngram: EngramOverride = {
        EngramClassName: '',
        EngramHidden: false,
        EngramPointsCost: 0,
        EngramLevelRequirement: 1,
        RemoveEngramPreReq: false
    };

    if (!line.trim().startsWith('(')) return defaultEngram;

    const inner = line.trim().slice(1, -1);
    const parts = inner.split(',').map(p => p.trim());
    
    parts.forEach(part => {
        const [k, ...vParts] = part.split('=');
        if (!k || vParts.length === 0) return;
        
        const key = k.trim();
        const v = vParts.join('=').trim();
        
        if (key === 'EngramClassName') {
            defaultEngram.EngramClassName = v.replace(/^"|"$/g, '');
        } else if (key === 'EngramHidden') {
            defaultEngram.EngramHidden = v.toLowerCase() === 'true';
        } else if (key === 'EngramPointsCost') {
            defaultEngram.EngramPointsCost = parseInt(v) || 0;
        } else if (key === 'EngramLevelRequirement') {
            defaultEngram.EngramLevelRequirement = parseInt(v) || 1;
        } else if (key === 'RemoveEngramPreReq') {
            defaultEngram.RemoveEngramPreReq = v.toLowerCase() === 'true';
        }
    });

    return defaultEngram;
}

function serializeEngramLine(engram: EngramOverride): string {
    return `(EngramClassName="${engram.EngramClassName}",EngramHidden=${engram.EngramHidden ? 'True' : 'False'},EngramPointsCost=${engram.EngramPointsCost},EngramLevelRequirement=${engram.EngramLevelRequirement},RemoveEngramPreReq=${engram.RemoveEngramPreReq ? 'True' : 'False'})`;
}

interface EngramOverridesEditorProps {
    value: string;
    onChange: (value: string) => void;
}

export function EngramOverridesEditor({ value, onChange }: EngramOverridesEditorProps) {
    const [entries, setEntries] = useState<EngramOverride[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<EngramOverride | null>(null);

    useEffect(() => {
        if (!value) {
            setEntries([]);
            return;
        }
        const parsed = value.split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('('))
            .map(parseEngramLine);
        setEntries(parsed);
    }, [value]);

    const updateEntries = (newEntries: EngramOverride[]) => {
        setEntries(newEntries);
        onChange(newEntries.map(serializeEngramLine).join('\n'));
    };

    const handleAdd = () => {
        const newEntry: EngramOverride = {
            EngramClassName: 'EngramEntry_NewItem_C',
            EngramHidden: false,
            EngramPointsCost: 0,
            EngramLevelRequirement: 1,
            RemoveEngramPreReq: false
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
        setEditForm(entries[index]);
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

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors text-sm font-medium border border-emerald-500/30"
                >
                    <Plus className="w-4 h-4" />
                    Add Engram Override
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {entries.map((entry, idx) => (
                    <div key={idx} className="bg-[#151525] border border-[#2d2d44] rounded-xl overflow-hidden shadow-sm">
                        {editingIndex === idx && editForm ? (
                            <div className="p-4 space-y-4 bg-[#1a1a2e]">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Engram Class Name</label>
                                    <input
                                        type="text"
                                        value={editForm.EngramClassName}
                                        onChange={(e) => setEditForm({ ...editForm, EngramClassName: e.target.value })}
                                        className="w-full bg-[#0d0d1a] border border-[#2d2d44] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Points Cost</label>
                                        <input
                                            type="number"
                                            value={editForm.EngramPointsCost}
                                            onChange={(e) => setEditForm({ ...editForm, EngramPointsCost: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-[#0d0d1a] border border-[#2d2d44] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Level Requirement</label>
                                        <input
                                            type="number"
                                            value={editForm.EngramLevelRequirement}
                                            onChange={(e) => setEditForm({ ...editForm, EngramLevelRequirement: parseInt(e.target.value) || 1 })}
                                            className="w-full bg-[#0d0d1a] border border-[#2d2d44] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 pt-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className="relative flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={editForm.EngramHidden}
                                                onChange={(e) => setEditForm({ ...editForm, EngramHidden: e.target.checked })}
                                                className="peer sr-only"
                                            />
                                            <div className="w-5 h-5 border-2 border-slate-600 rounded bg-slate-900 peer-checked:bg-violet-500 peer-checked:border-violet-500 transition-all"></div>
                                            <Check className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Hidden</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className="relative flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={editForm.RemoveEngramPreReq}
                                                onChange={(e) => setEditForm({ ...editForm, RemoveEngramPreReq: e.target.checked })}
                                                className="peer sr-only"
                                            />
                                            <div className="w-5 h-5 border-2 border-slate-600 rounded bg-slate-900 peer-checked:bg-violet-500 peer-checked:border-violet-500 transition-all"></div>
                                            <Check className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Remove Prerequisites</span>
                                    </label>
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-[#2d2d44]">
                                    <button
                                        onClick={handleCancelEdit}
                                        className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 flex items-center justify-between group">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-violet-400">{entry.EngramClassName}</span>
                                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                                        <span>Cost: <span className="text-white">{entry.EngramPointsCost}</span></span>
                                        <span>Level: <span className="text-white">{entry.EngramLevelRequirement}</span></span>
                                        {entry.EngramHidden && <span className="text-rose-400 font-medium">Hidden</span>}
                                        {entry.RemoveEngramPreReq && <span className="text-amber-400 font-medium">No Pre-reqs</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        No engram overrides configured. Click add to create one.
                    </div>
                )}
            </div>
        </div>
    );
}
