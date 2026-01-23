import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { cn } from '../../utils/helpers';

interface ArrayItem {
    id: string;
    fields: Record<string, string>;
}

interface ArrayEditorProps {
    label: string;
    value: string; // The raw INI string e.g. (ClassName="DinoX",Multiplier=2.0)
    onChange: (newValue: string) => void;
    template: Record<string, { label: string; placeholder: string }>;
}

export const ArrayEditor = ({ label, value, onChange, template }: ArrayEditorProps) => {
    const [items, setItems] = useState<ArrayItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Record<string, string>>({});

    // Parse INI string to items
    // ARK format: (Field1="Val1",Field2=2.0),(Field1="Val2",Field2=3.0)
    useEffect(() => {
        if (!value) {
            setItems([]);
            return;
        }

        const itemsMatch = value.match(/\(([^)]+)\)/g);
        if (!itemsMatch) {
            setItems([]);
            return;
        }

        const parsedItems = itemsMatch.map((raw, idx) => {
            const inner = raw.slice(1, -1);
            const fields: Record<string, string> = {};
            const pairs = inner.split(',');

            pairs.forEach(pair => {
                const [k, v] = pair.split('=');
                if (k && v) {
                    fields[k.trim()] = v.trim().replace(/^"|"$/g, '');
                }
            });

            return { id: idx.toString(), fields };
        });

        setItems(parsedItems);
    }, [value]);

    const serialize = (newItems: ArrayItem[]) => {
        const serialized = newItems.map(item => {
            const pairs = Object.entries(item.fields)
                .map(([k, v]) => {
                    const isNumeric = !isNaN(parseFloat(v)) && isFinite(Number(v));
                    const formattedValue = isNumeric ? v : `"${v}"`;
                    return `${k}=${formattedValue}`;
                })
                .join(',');
            return `(${pairs})`;
        }).join(',');
        onChange(serialized);
    };

    const handleAdd = () => {
        const newFields: Record<string, string> = {};
        Object.keys(template).forEach(key => newFields[key] = '');

        const newItem: ArrayItem = {
            id: Date.now().toString(),
            fields: newFields
        };

        setEditingId(newItem.id);
        setEditValues(newFields);
        setItems([...items, newItem]);
    };

    const handleSaveEdit = () => {
        const newItems = items.map(item =>
            item.id === editingId ? { ...item, fields: editValues } : item
        );
        setItems(newItems);
        serialize(newItems);
        setEditingId(null);
    };

    const handleRemove = (id: string) => {
        const newItems = items.filter(item => item.id !== id);
        setItems(newItems);
        serialize(newItems);
    };

    return (
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{label}</h4>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-1.5 px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 rounded-md transition-colors text-xs font-medium"
                >
                    <Plus className="w-3.5 h-3.5" /> Add Entry
                </button>
            </div>

            <div className="space-y-2">
                {items.length === 0 && (
                    <div className="text-center py-6 text-slate-500 text-xs italic bg-slate-900/40 rounded-lg border border-dashed border-slate-700">
                        No entries configured
                    </div>
                )}

                {items.map((item) => (
                    <div
                        key={item.id}
                        className={cn(
                            "p-3 rounded-lg border transition-all",
                            editingId === item.id
                                ? "bg-slate-800 border-cyan-500/50"
                                : "bg-slate-900/60 border-slate-700 hover:border-slate-600"
                        )}
                    >
                        {editingId === item.id ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 gap-2">
                                    {Object.entries(template).map(([key, info]) => (
                                        <div key={key}>
                                            <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">
                                                {info.label}
                                            </label>
                                            <input
                                                type="text"
                                                value={editValues[key] || ''}
                                                placeholder={info.placeholder}
                                                onChange={(e) => setEditValues({ ...editValues, [key]: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:ring-1 focus:ring-cyan-500 outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        onClick={() => setEditingId(null)}
                                        className="p-1.5 text-slate-400 hover:text-white"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        className="px-3 py-1 bg-cyan-600 text-white rounded text-xs font-medium flex items-center gap-1"
                                    >
                                        <Check className="w-3.5 h-3.5" /> Confirm
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between group">
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    {Object.entries(item.fields).map(([k, v]) => (
                                        <div key={k} className="flex flex-col">
                                            <span className="text-[9px] text-slate-600 uppercase font-bold">{template[k]?.label || k}</span>
                                            <span className="text-xs text-slate-300 font-mono">{v}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => {
                                            setEditingId(item.id);
                                            setEditValues(item.fields);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-cyan-400 transition-colors"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleRemove(item.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
