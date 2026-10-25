import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Package, Search, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../ui/NumberInput';

/**
 * Editor for Game.ini `ConfigOverrideItemMaxQuantity` lines:
 *   (ItemClassString="PrimalItemConsumable_RawMeat_C",Quantity=(MaxItemQuantity=200,bIgnoreMultiplier=True))
 * Value is the \n-joined list of those parenthesized entries (one per duplicate INI key).
 */

interface StackOverride {
    itemClass: string;
    maxQuantity: number;
    ignoreMultiplier: boolean;
}

type ItemCategory = 'meat' | 'resources' | 'crafting' | 'berries' | 'consumables';

interface CatalogItem {
    cls: string;
    name: string; // English default; translated via itemStackEditor.items.<cls>
    category: ItemCategory;
}

// Common ASA item classes (same class names as ASE for these core items)
export const ITEM_CATALOG: CatalogItem[] = [
    // Meat
    { cls: 'PrimalItemConsumable_RawMeat_C', name: 'Raw Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_RawPrimeMeat_C', name: 'Raw Prime Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_RawMutton_C', name: 'Raw Mutton', category: 'meat' },
    { cls: 'PrimalItemConsumable_RawMeat_Fish_C', name: 'Raw Fish Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_RawPrimeMeat_Fish_C', name: 'Raw Prime Fish Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_CookedMeat_C', name: 'Cooked Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_CookedPrimeMeat_C', name: 'Cooked Prime Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_CookedMeat_Fish_C', name: 'Cooked Fish Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_CookedPrimeMeat_Fish_C', name: 'Cooked Prime Fish Meat', category: 'meat' },
    { cls: 'PrimalItemConsumable_CookedMeat_Jerky_C', name: 'Cooked Meat Jerky', category: 'meat' },
    { cls: 'PrimalItemConsumable_CookedPrimeMeat_Jerky_C', name: 'Prime Meat Jerky', category: 'meat' },
    { cls: 'PrimalItemConsumable_SpoiledMeat_C', name: 'Spoiled Meat', category: 'meat' },
    // Basic resources
    { cls: 'PrimalItemResource_Wood_C', name: 'Wood', category: 'resources' },
    { cls: 'PrimalItemResource_Stone_C', name: 'Stone', category: 'resources' },
    { cls: 'PrimalItemResource_Thatch_C', name: 'Thatch', category: 'resources' },
    { cls: 'PrimalItemResource_Fibers_C', name: 'Fiber', category: 'resources' },
    { cls: 'PrimalItemResource_Flint_C', name: 'Flint', category: 'resources' },
    { cls: 'PrimalItemResource_Hide_C', name: 'Hide', category: 'resources' },
    { cls: 'PrimalItemResource_Chitin_C', name: 'Chitin', category: 'resources' },
    { cls: 'PrimalItemResource_Keratin_C', name: 'Keratin', category: 'resources' },
    { cls: 'PrimalItemResource_Metal_C', name: 'Metal', category: 'resources' },
    { cls: 'PrimalItemResource_Crystal_C', name: 'Crystal', category: 'resources' },
    { cls: 'PrimalItemResource_Obsidian_C', name: 'Obsidian', category: 'resources' },
    { cls: 'PrimalItemResource_Oil_C', name: 'Oil', category: 'resources' },
    { cls: 'PrimalItemResource_Silicon_C', name: 'Silica Pearls', category: 'resources' },
    { cls: 'PrimalItemResource_BlackPearl_C', name: 'Black Pearl', category: 'resources' },
    { cls: 'PrimalItemResource_Sulfur_C', name: 'Sulfur', category: 'resources' },
    { cls: 'PrimalItemResource_Sap_C', name: 'Sap', category: 'resources' },
    { cls: 'PrimalItemResource_Polymer_Organic_C', name: 'Organic Polymer', category: 'resources' },
    { cls: 'PrimalItemResource_Element_C', name: 'Element', category: 'resources' },
    // Crafted materials
    { cls: 'PrimalItemResource_MetalIngot_C', name: 'Metal Ingot', category: 'crafting' },
    { cls: 'PrimalItemResource_Gunpowder_C', name: 'Gunpowder', category: 'crafting' },
    { cls: 'PrimalItemResource_Sparkpowder_C', name: 'Sparkpowder', category: 'crafting' },
    { cls: 'PrimalItemResource_Charcoal_C', name: 'Charcoal', category: 'crafting' },
    { cls: 'PrimalItemResource_ChitinPaste_C', name: 'Cementing Paste', category: 'crafting' },
    { cls: 'PrimalItemResource_Electronics_C', name: 'Electronics', category: 'crafting' },
    { cls: 'PrimalItemResource_Polymer_C', name: 'Polymer', category: 'crafting' },
    // Berries
    { cls: 'PrimalItemConsumable_Berry_Amarberry_C', name: 'Amarberry', category: 'berries' },
    { cls: 'PrimalItemConsumable_Berry_Azulberry_C', name: 'Azulberry', category: 'berries' },
    { cls: 'PrimalItemConsumable_Berry_Mejoberry_C', name: 'Mejoberry', category: 'berries' },
    { cls: 'PrimalItemConsumable_Berry_Tintoberry_C', name: 'Tintoberry', category: 'berries' },
    { cls: 'PrimalItemConsumable_Berry_Stimberry_C', name: 'Stimberry', category: 'berries' },
    { cls: 'PrimalItemConsumable_Berry_Narcoberry_C', name: 'Narcoberry', category: 'berries' },
    // Consumables
    { cls: 'PrimalItemConsumable_Narcotic_C', name: 'Narcotic', category: 'consumables' },
    { cls: 'PrimalItemConsumable_Stimulant_C', name: 'Stimulant', category: 'consumables' },
    { cls: 'PrimalItemConsumable_Honey_C', name: 'Honey', category: 'consumables' },
    { cls: 'PrimalItemResource_RareFlower_C', name: 'Rare Flower', category: 'consumables' },
    { cls: 'PrimalItemResource_RareMushroom_C', name: 'Rare Mushroom', category: 'consumables' },
];

// Quick packs: apply the same stack size to a whole group of items at once
const PACKS: { id: ItemCategory; defaultQuantity: number }[] = [
    { id: 'meat', defaultQuantity: 200 },
    { id: 'resources', defaultQuantity: 1000 },
    { id: 'crafting', defaultQuantity: 1000 },
    { id: 'berries', defaultQuantity: 1000 },
    { id: 'consumables', defaultQuantity: 500 },
];

const PACK_DEFAULT_NAMES: Record<ItemCategory, string> = {
    meat: 'Meat',
    resources: 'Basic resources',
    crafting: 'Crafted materials',
    berries: 'Berries',
    consumables: 'Consumables',
};

export function parseLine(line: string): StackOverride | null {
    const cls = line.match(/ItemClassString\s*=\s*"([^"]+)"/i)?.[1];
    if (!cls) return null;
    const qty = line.match(/MaxItemQuantity\s*=\s*([0-9.]+)/i)?.[1];
    const ignore = line.match(/bIgnoreMultiplier\s*=\s*(True|False|1|0)/i)?.[1];
    return {
        itemClass: cls,
        maxQuantity: qty ? Math.round(parseFloat(qty)) : 1,
        ignoreMultiplier: ignore ? /^(true|1)$/i.test(ignore) : false,
    };
}

export function serializeLine(o: StackOverride): string {
    return `(ItemClassString="${o.itemClass}",Quantity=(MaxItemQuantity=${Math.max(1, Math.round(o.maxQuantity))},bIgnoreMultiplier=${o.ignoreMultiplier ? 'True' : 'False'}))`;
}

interface ItemStackEditorProps {
    value: string;
    onChange: (value: string) => void;
}

export function ItemStackEditor({ value, onChange }: ItemStackEditorProps) {
    const { t } = useTranslation();
    const [entries, setEntries] = useState<StackOverride[]>([]);
    const [search, setSearch] = useState('');
    const [packQty, setPackQty] = useState<Record<string, number>>({});
    const [packIgnore, setPackIgnore] = useState(true);

    useEffect(() => {
        const parsed = (value || '')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('('))
            .map(parseLine)
            .filter((o): o is StackOverride => o !== null);
        setEntries(parsed);
    }, [value]);

    const itemName = (cls: string) => {
        const known = ITEM_CATALOG.find(i => i.cls.toLowerCase() === cls.toLowerCase());
        return known ? t(`itemStackEditor.items.${known.cls}`, known.name) : null;
    };

    const commit = (next: StackOverride[]) => {
        setEntries(next);
        onChange(next.map(serializeLine).join('\n'));
    };

    // Insert or update by class name (case-insensitive) so packs never create duplicates
    const upsert = (list: StackOverride[], item: StackOverride) => {
        const idx = list.findIndex(e => e.itemClass.toLowerCase() === item.itemClass.toLowerCase());
        if (idx === -1) return [...list, item];
        const copy = [...list];
        copy[idx] = item;
        return copy;
    };

    const addItem = (cls: string) => {
        if (!cls.trim()) return;
        const existing = entries.find(e => e.itemClass.toLowerCase() === cls.toLowerCase());
        if (!existing) commit([...entries, { itemClass: cls.trim(), maxQuantity: 100, ignoreMultiplier: true }]);
        setSearch('');
    };

    const applyPack = (category: ItemCategory, quantity: number) => {
        let next = entries;
        for (const item of ITEM_CATALOG.filter(i => i.category === category)) {
            next = upsert(next, { itemClass: item.cls, maxQuantity: quantity, ignoreMultiplier: packIgnore });
        }
        commit(next);
    };

    const updateEntry = (index: number, patch: Partial<StackOverride>) => {
        commit(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    };

    const suggestions = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return ITEM_CATALOG.filter(i =>
            i.cls.toLowerCase().includes(q) ||
            i.name.toLowerCase().includes(q) ||
            t(`itemStackEditor.items.${i.cls}`, i.name).toLowerCase().includes(q)
        ).slice(0, 8);
    }, [search, t]);

    const looksLikeClass = /^[A-Za-z0-9_]+_C$/.test(search.trim());

    return (
        <div className="space-y-4">
            {/* Quick packs */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)]">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                        <Layers className="w-4 h-4 text-violet-400" />
                        {t('itemStackEditor.packsTitle', 'Quick packs')}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input type="checkbox" checked={packIgnore} onChange={e => setPackIgnore(e.target.checked)} className="accent-violet-500" />
                        {t('itemStackEditor.ignoreMultiplier', 'Ignore global stack multiplier')}
                    </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {PACKS.map(pack => {
                        const count = ITEM_CATALOG.filter(i => i.category === pack.id).length;
                        const qty = packQty[pack.id] ?? pack.defaultQuantity;
                        return (
                            <div key={pack.id} className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--input-background)]">
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                        {t(`itemStackEditor.packs.${pack.id}`, PACK_DEFAULT_NAMES[pack.id])}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-muted)]">
                                        {t('itemStackEditor.itemCount', { count, defaultValue: '{{count}} items' })}
                                    </div>
                                </div>
                                <NumberInput
                                    integer
                                    min={1}
                                    value={qty}
                                    onValueChange={n => setPackQty(p => ({ ...p, [pack.id]: n }))}
                                    className="w-20 px-2 py-1 text-xs rounded-md bg-[var(--surface)] border border-[var(--input-border)] text-[var(--text-primary)] font-mono"
                                    aria-label={t('itemStackEditor.maxQuantity', 'Max stack')}
                                />
                                <button
                                    type="button"
                                    onClick={() => applyPack(pack.id, qty)}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-md bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
                                >
                                    {t('itemStackEditor.apply', 'Apply')}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Add single item */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && looksLikeClass) addItem(search); }}
                    placeholder={t('itemStackEditor.searchPlaceholder', 'Search an item by name or class (e.g. Raw Meat or PrimalItemConsumable_RawMeat_C)')}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-[var(--input-background)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-violet-500"
                />
                {(suggestions.length > 0 || looksLikeClass) && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden">
                        {suggestions.map(item => (
                            <button
                                key={item.cls}
                                type="button"
                                onClick={() => addItem(item.cls)}
                                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--surface-hover)] cursor-pointer"
                            >
                                <span className="text-sm text-[var(--text-primary)]">{t(`itemStackEditor.items.${item.cls}`, item.name)}</span>
                                <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">{item.cls}</span>
                            </button>
                        ))}
                        {looksLikeClass && !suggestions.some(s => s.cls.toLowerCase() === search.trim().toLowerCase()) && (
                            <button
                                type="button"
                                onClick={() => addItem(search)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-violet-300 hover:bg-[var(--surface-hover)] cursor-pointer border-t border-[var(--border)]"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {t('itemStackEditor.addCustom', { defaultValue: 'Add custom class {{cls}}', cls: search.trim() })}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Overrides list */}
            {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border border-dashed border-[var(--border)] text-[var(--text-muted)]">
                    <Package className="w-6 h-6 opacity-50" />
                    <span className="text-sm">{t('itemStackEditor.empty', 'No item stack overrides. Use a quick pack or search an item above.')}</span>
                </div>
            ) : (
                <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--surface-hover)]">
                        <span>{t('itemStackEditor.item', 'Item')}</span>
                        <span className="w-24 text-center">{t('itemStackEditor.maxQuantity', 'Max stack')}</span>
                        <span className="w-28 text-center">{t('itemStackEditor.ignoreMultiplierShort', 'Ignore multiplier')}</span>
                        <span className="w-8" />
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-[var(--border)]">
                        {entries.map((entry, index) => {
                            const name = itemName(entry.itemClass);
                            return (
                                <div key={`${entry.itemClass}-${index}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="text-sm text-[var(--text-primary)] truncate">{name ?? entry.itemClass}</div>
                                        {name && <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">{entry.itemClass}</div>}
                                    </div>
                                    <NumberInput
                                        integer
                                        min={1}
                                        value={entry.maxQuantity}
                                        onValueChange={n => updateEntry(index, { maxQuantity: n })}
                                        className="w-24 px-2 py-1 text-sm text-center rounded-md bg-[var(--input-background)] border border-[var(--input-border)] text-[var(--text-primary)] font-mono"
                                        aria-label={t('itemStackEditor.maxQuantity', 'Max stack')}
                                    />
                                    <div className="w-28 flex justify-center">
                                        <input
                                            type="checkbox"
                                            checked={entry.ignoreMultiplier}
                                            onChange={e => updateEntry(index, { ignoreMultiplier: e.target.checked })}
                                            className="w-4 h-4 accent-violet-500 cursor-pointer"
                                            aria-label={t('itemStackEditor.ignoreMultiplier', 'Ignore global stack multiplier')}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => commit(entries.filter((_, i) => i !== index))}
                                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                                        title={t('itemStackEditor.remove', 'Remove')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between items-center px-3 py-2 text-xs text-[var(--text-muted)] bg-[var(--surface-hover)]">
                        <span>{t('itemStackEditor.itemCount', { count: entries.length, defaultValue: '{{count}} items' })}</span>
                        <button type="button" onClick={() => commit([])} className="hover:text-red-400 cursor-pointer">
                            {t('itemStackEditor.clearAll', 'Remove all')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
