import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Globe, Save, RotateCw, Leaf, Sprout, Search, Filter, ChevronDown,
  Check, Zap, Wheat, TreePine, Gem, Flame, Droplets, Mountain,
  X, Info, AlertTriangle, Sliders, LayoutGrid, ChevronLeft, ChevronRight,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { useAseServerStore } from '../stores/aseServerStore';
import { AseGameConfig } from '../types/ase.types';

// ─── Static Resource Database ──────────────────────────────────────────────────
interface ResourceEntry {
  className: string;
  displayName: string;
  category: string;
  icon: string;
}

const RESOURCE_DATABASE: ResourceEntry[] = [
  // Core Resources
  { className: 'PrimalItemResource_Stone_C', displayName: 'Stone', category: 'Core', icon: '🪨' },
  { className: 'PrimalItemResource_Wood_C', displayName: 'Wood', category: 'Core', icon: '🪵' },
  { className: 'PrimalItemResource_Thatch_C', displayName: 'Thatch', category: 'Core', icon: '🌾' },
  { className: 'PrimalItemResource_Flint_C', displayName: 'Flint', category: 'Core', icon: '🔥' },
  { className: 'PrimalItemResource_Fiber_C', displayName: 'Fiber', category: 'Core', icon: '🧶' },
  { className: 'PrimalItemResource_Hide_C', displayName: 'Hide', category: 'Core', icon: '🐾' },
  { className: 'PrimalItemResource_Chitin_C', displayName: 'Chitin / Keratin', category: 'Core', icon: '🦴' },
  { className: 'PrimalItemResource_Metal_C', displayName: 'Metal', category: 'Core', icon: '⛏️' },
  { className: 'PrimalItemResource_MetalIngot_C', displayName: 'Metal Ingot', category: 'Core', icon: '🔩' },
  { className: 'PrimalItemResource_Crystal_C', displayName: 'Crystal', category: 'Core', icon: '💎' },
  { className: 'PrimalItemResource_Obsidian_C', displayName: 'Obsidian', category: 'Core', icon: '🖤' },
  { className: 'PrimalItemResource_Cemite_C', displayName: 'Cementing Paste', category: 'Core', icon: '🧪' },
  { className: 'PrimalItemResource_Silicon_C', displayName: 'Silica Pearls', category: 'Core', icon: '🫧' },
  { className: 'PrimalItemResource_Polymer_C', displayName: 'Polymer', category: 'Core', icon: '🔲' },
  { className: 'PrimalItemResource_Electronics_C', displayName: 'Electronics', category: 'Core', icon: '⚡' },
  { className: 'PrimalItemResource_Oil_C', displayName: 'Oil', category: 'Core', icon: '🛢️' },
  { className: 'PrimalItemResource_Gasoline_C', displayName: 'Gasoline', category: 'Core', icon: '⛽' },
  { className: 'PrimalItemResource_Gunpowder_C', displayName: 'Gunpowder', category: 'Core', icon: '💥' },
  { className: 'PrimalItemResource_NarcoBerry_C', displayName: 'Narcoberry', category: 'Core', icon: '🫐' },
  { className: 'PrimalItemResource_Sparkpowder_C', displayName: 'Sparkpowder', category: 'Core', icon: '✨' },
  { className: 'PrimalItemResource_Charcoalite_C', displayName: 'Charcoal', category: 'Core', icon: '🖤' },
  { className: 'PrimalItemResource_Sap_C', displayName: 'Sap', category: 'Core', icon: '🍯' },
  { className: 'PrimalItemResource_Sand_C', displayName: 'Sand', category: 'Core', icon: '🏖️' },
  { className: 'PrimalItemResource_BlackPearl_C', displayName: 'Black Pearl', category: 'Core', icon: '🖤' },

  // Consumables
  { className: 'PrimalItemConsumable_RawMeat_C', displayName: 'Raw Meat', category: 'Consumables', icon: '🥩' },
  { className: 'PrimalItemConsumable_CookedMeat_C', displayName: 'Cooked Meat', category: 'Consumables', icon: '🍖' },
  { className: 'PrimalItemConsumable_RawPrimeMeat_C', displayName: 'Raw Prime Meat', category: 'Consumables', icon: '🥓' },
  { className: 'PrimalItemConsumable_Berry_Amarberry_C', displayName: 'Amarberry', category: 'Consumables', icon: '🍇' },
  { className: 'PrimalItemConsumable_Berry_Azulberry_C', displayName: 'Azulberry', category: 'Consumables', icon: '🫐' },
  { className: 'PrimalItemConsumable_Berry_Tintoberry_C', displayName: 'Tintoberry', category: 'Consumables', icon: '🍒' },
  { className: 'PrimalItemConsumable_Berry_Mejoberry_C', displayName: 'Mejoberry', category: 'Consumables', icon: '🍑' },
  { className: 'PrimalItemConsumable_Berry_Stimberry_C', displayName: 'Stimberry', category: 'Consumables', icon: '🍓' },

  // Aberration
  { className: 'PrimalItemResource_ApexDrop_Basilisk_C', displayName: 'Basilisk Scale', category: 'Aberration', icon: '🐍' },
  { className: 'PrimalItemResource_Gem_C', displayName: 'Blue Gem', category: 'Aberration', icon: '🔵' },
  { className: 'PrimalItemResource_Gem_BioLum_C', displayName: 'Green Gem', category: 'Aberration', icon: '🟢' },
  { className: 'PrimalItemResource_Gem_Element_C', displayName: 'Red Gem', category: 'Aberration', icon: '🔴' },
  { className: 'PrimalItemResource_FungalWood_C', displayName: 'Fungal Wood', category: 'Aberration', icon: '🍄' },
  { className: 'PrimalItemResource_Gas_C', displayName: 'Congealed Gas Ball', category: 'Aberration', icon: '💨' },

  // Extinction
  { className: 'PrimalItemResource_Dust_C', displayName: 'Element Dust', category: 'Extinction', icon: '⚗️' },
  { className: 'PrimalItemResource_ScrapMetal_C', displayName: 'Scrap Metal', category: 'Extinction', icon: '🔧' },
  { className: 'PrimalItemResource_ScrapMetalIngot_C', displayName: 'Scrap Metal Ingot', category: 'Extinction', icon: '⚙️' },
  { className: 'PrimalItemResource_CorruptedPolymer_C', displayName: 'Corrupted Nodule', category: 'Extinction', icon: '🟣' },
  { className: 'PrimalItemResource_ElementShard_C', displayName: 'Element Shard', category: 'Extinction', icon: '🌐' },

  // Genesis
  { className: 'PrimalItemResource_Mutagen_C', displayName: 'Mutagen', category: 'Genesis', icon: '🧬' },
  { className: 'PrimalItemResource_MutagelBulb_C', displayName: 'Mutagel', category: 'Genesis', icon: '🫧' },
  { className: 'PrimalItemResource_AmberGem_C', displayName: 'Ambergris', category: 'Genesis', icon: '🟡' },
  { className: 'PrimalItemResource_RareFlower_C', displayName: 'Rare Flower', category: 'Genesis', icon: '🌸' },
  { className: 'PrimalItemResource_RareMushroom_C', displayName: 'Rare Mushroom', category: 'Genesis', icon: '🍄' },
];

// ─── Preset Definitions ────────────────────────────────────────────────────────
interface RatePreset {
  label: string;
  tag: string;
  color: string;
  harvestAmount: number;
  tamingSpeed: number;
  dinoCount: number;
  resourceRespawn: number;
  harvestHealth: number;
  xp: number;
}

const PRESETS: RatePreset[] = [
  { label: 'Official Rates', tag: '1x', color: 'amber', harvestAmount: 1, tamingSpeed: 1, dinoCount: 1, resourceRespawn: 1, harvestHealth: 1, xp: 1 },
  { label: 'Boosted', tag: '3x', color: 'emerald', harvestAmount: 3, tamingSpeed: 3, dinoCount: 1, resourceRespawn: 0.5, harvestHealth: 1, xp: 2 },
  { label: 'High Rates', tag: '5x', color: 'cyan', harvestAmount: 5, tamingSpeed: 5, dinoCount: 1, resourceRespawn: 0.3, harvestHealth: 1, xp: 3 },
  { label: 'PvE Balanced', tag: 'PvE', color: 'sky', harvestAmount: 2, tamingSpeed: 4, dinoCount: 1, resourceRespawn: 0.5, harvestHealth: 1, xp: 2 },
  { label: 'PvP Harvester', tag: 'PvP', color: 'rose', harvestAmount: 5, tamingSpeed: 10, dinoCount: 1.5, resourceRespawn: 0.2, harvestHealth: 1, xp: 5 },
  { label: 'Hardcore Survival', tag: 'HC', color: 'orange', harvestAmount: 0.5, tamingSpeed: 0.5, dinoCount: 1.5, resourceRespawn: 2, harvestHealth: 2, xp: 0.5 },
  { label: 'Primitive Economy', tag: 'PRIM', color: 'stone', harvestAmount: 0.25, tamingSpeed: 0.25, dinoCount: 2, resourceRespawn: 3, harvestHealth: 3, xp: 0.25 },
];

const ITEMS_PER_PAGE = 12;

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  All: <LayoutGrid className="w-3.5 h-3.5" />,
  Core: <Mountain className="w-3.5 h-3.5" />,
  Consumables: <Wheat className="w-3.5 h-3.5" />,
  Aberration: <Gem className="w-3.5 h-3.5" />,
  Extinction: <Flame className="w-3.5 h-3.5" />,
  Genesis: <Droplets className="w-3.5 h-3.5" />,
  Modded: <Sparkles className="w-3.5 h-3.5" />,
};

// ─── Helpers ────────────────────────────────────────────────────────────────────
function classNameToDisplay(className: string): string {
  let name = className
    .replace(/^PrimalItemResource_/, '')
    .replace(/^PrimalItemConsumable_/, '')
    .replace(/_C$/, '');
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  name = name.replace(/_/g, ' ');
  return name;
}

function parseMultiplierString(raw: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!raw) return map;
  for (const chunk of raw.split(';')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const classMatch = trimmed.match(/ClassName\s*=\s*"([^"]+)"/i);
    const multMatch = trimmed.match(/Multiplier\s*=\s*([\d.]+)/i);
    if (classMatch && multMatch) {
      map.set(classMatch[1], parseFloat(multMatch[1]));
    }
  }
  return map;
}

function serializeMultiplierMap(map: Map<string, number>): string {
  const entries: string[] = [];
  map.forEach((mult, className) => {
    entries.push(`(ClassName="${className}",Multiplier=${mult.toFixed(6)})`);
  });
  return entries.join(';');
}

import { cn } from '../../utils/helpers';

interface ASEEnvironmentManagerProps {
  embedded?: boolean;
  config?: AseGameConfig;
  onChange?: (config: AseGameConfig) => void;
  externalSearchQuery?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function ASEEnvironmentManager({ embedded = false, config: propConfig, onChange, externalSearchQuery }: ASEEnvironmentManagerProps = {}) {
  const { servers } = useAseServerStore();
  const selectedServer = servers[0];

  // Config state
  const [config, setConfig] = useState<AseGameConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<AseGameConfig | null>(null);
  const [loading, setLoading] = useState(!embedded);
  const [saving, setSaving] = useState(false);

  // Resource multiplier map
  const [resourceMultipliers, setResourceMultipliers] = useState<Map<string, number>>(new Map());
  const [originalResourceMultipliers, setOriginalResourceMultipliers] = useState<Map<string, number>>(new Map());

  // UI state
  const [searchQuery, setSearchQuery] = useState('');

  // Sync external search query from visual editor sidebar
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);

  // Click outside handler for preset dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync propConfig and parse overrides when embedded
  useEffect(() => {
    if (embedded && propConfig) {
      if (propConfig !== config) {
        setConfig(propConfig);
      }
      if (propConfig.harvestResourceItemAmountClassMultipliers !== config?.harvestResourceItemAmountClassMultipliers) {
        const parsed = parseMultiplierString(propConfig.harvestResourceItemAmountClassMultipliers);
        setResourceMultipliers(parsed);
      }
    }
  }, [embedded, propConfig, config]);

  // Load config
  useEffect(() => {
    if (embedded) return;
    if (!selectedServer) { setLoading(false); return; }
    (async () => {
      try {
        const cfg = await invoke<AseGameConfig>('read_ase_config', { serverId: selectedServer.id });
        setConfig(cfg);
        setOriginalConfig(JSON.parse(JSON.stringify(cfg)));
        const parsed = parseMultiplierString(cfg.harvestResourceItemAmountClassMultipliers);
        setResourceMultipliers(parsed);
        setOriginalResourceMultipliers(new Map(parsed));
      } catch (e) {
        toast.error(`Failed to load config: ${e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedServer?.id, embedded]);

  // Modded resource detection
  const moddedResources = useMemo<ResourceEntry[]>(() => {
    const knownClasses = new Set(RESOURCE_DATABASE.map(r => r.className));
    const modded: ResourceEntry[] = [];
    resourceMultipliers.forEach((_, className) => {
      if (!knownClasses.has(className)) {
        modded.push({
          className,
          displayName: classNameToDisplay(className),
          category: 'Modded',
          icon: '🔧',
        });
      }
    });
    return modded;
  }, [resourceMultipliers]);

  // Combined resources
  const allResources = useMemo(() => [...RESOURCE_DATABASE, ...moddedResources], [moddedResources]);

  // Get categories
  const categories = useMemo(() => {
    const cats = ['All', ...new Set(allResources.map(r => r.category))];
    return cats;
  }, [allResources]);

  // Filtered + paginated resources
  const filteredResources = useMemo(() => {
    let res = allResources;
    if (activeCategory !== 'All') res = res.filter(r => r.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      res = res.filter(r =>
        r.displayName.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }
    return res;
  }, [allResources, activeCategory, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredResources.length / ITEMS_PER_PAGE));
  const paginatedResources = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredResources.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredResources, currentPage]);

  // Reset pagination on filter change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, activeCategory]);

  // Dirty state
  const isDirty = useMemo(() => {
    if (!config || !originalConfig) return false;
    const globalChanged =
      config.harvestAmountMultiplier !== originalConfig.harvestAmountMultiplier ||
      config.tamingSpeedMultiplier !== originalConfig.tamingSpeedMultiplier ||
      config.dinoCountMultiplier !== originalConfig.dinoCountMultiplier ||
      config.resourcesRespawnPeriodMultiplier !== originalConfig.resourcesRespawnPeriodMultiplier ||
      config.harvestHealthMultiplier !== originalConfig.harvestHealthMultiplier ||
      config.xpMultiplier !== originalConfig.xpMultiplier ||
      config.clampResourceHarvestDamage !== originalConfig.clampResourceHarvestDamage ||
      config.optimizedHarvestingHealth !== originalConfig.optimizedHarvestingHealth;
    if (globalChanged) return true;
    if (resourceMultipliers.size !== originalResourceMultipliers.size) return true;
    for (const [k, v] of resourceMultipliers) {
      if (originalResourceMultipliers.get(k) !== v) return true;
    }
    for (const [k] of originalResourceMultipliers) {
      if (!resourceMultipliers.has(k)) return true;
    }
    return false;
  }, [config, originalConfig, resourceMultipliers, originalResourceMultipliers]);

  // Setters
  const updateGlobal = useCallback((key: keyof AseGameConfig, val: number | boolean) => {
    if (embedded && propConfig && onChange) {
      onChange({ ...propConfig, [key]: val });
    } else {
      setConfig(prev => prev ? { ...prev, [key]: val } : prev);
    }
  }, [embedded, propConfig, onChange]);

  const updateResourceMultiplier = useCallback((className: string, multiplier: number) => {
    setResourceMultipliers(prev => {
      const next = new Map(prev);
      if (multiplier === 1) {
        next.delete(className);
      } else {
        next.set(className, multiplier);
      }
      if (embedded && propConfig && onChange) {
        onChange({
          ...propConfig,
          harvestResourceItemAmountClassMultipliers: serializeMultiplierMap(next)
        });
      }
      return next;
    });
  }, [embedded, propConfig, onChange]);

  const removeResourceMultiplier = useCallback((className: string) => {
    setResourceMultipliers(prev => {
      const next = new Map(prev);
      next.delete(className);
      if (embedded && propConfig && onChange) {
        onChange({
          ...propConfig,
          harvestResourceItemAmountClassMultipliers: serializeMultiplierMap(next)
        });
      }
      return next;
    });
  }, [embedded, propConfig, onChange]);

  // Apply preset
  const applyPreset = useCallback((preset: RatePreset) => {
    if (embedded && propConfig && onChange) {
      onChange({
        ...propConfig,
        harvestAmountMultiplier: preset.harvestAmount,
        tamingSpeedMultiplier: preset.tamingSpeed,
        dinoCountMultiplier: preset.dinoCount,
        resourcesRespawnPeriodMultiplier: preset.resourceRespawn,
        harvestHealthMultiplier: preset.harvestHealth,
        xpMultiplier: preset.xp,
      });
    } else {
      setConfig(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          harvestAmountMultiplier: preset.harvestAmount,
          tamingSpeedMultiplier: preset.tamingSpeed,
          dinoCountMultiplier: preset.dinoCount,
          resourcesRespawnPeriodMultiplier: preset.resourceRespawn,
          harvestHealthMultiplier: preset.harvestHealth,
          xpMultiplier: preset.xp,
        };
      });
    }
    setPresetDropdownOpen(false);
    toast.success(`Applied ${preset.label} preset`);
  }, [embedded, propConfig, onChange]);

  // Save
  const handleSave = async () => {
    if (!config || !selectedServer) return;
    setSaving(true);
    try {
      const finalConfig = {
        ...config,
        harvestResourceItemAmountClassMultipliers: serializeMultiplierMap(resourceMultipliers),
      };
      await invoke('write_ase_config', { serverId: selectedServer.id, config: finalConfig });
      setOriginalConfig(JSON.parse(JSON.stringify(finalConfig)));
      setConfig(finalConfig);
      setOriginalResourceMultipliers(new Map(resourceMultipliers));
      toast.success('Environment configuration saved');
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  // Revert
  const handleRevert = () => {
    if (originalConfig) {
      setConfig(JSON.parse(JSON.stringify(originalConfig)));
      setResourceMultipliers(new Map(originalResourceMultipliers));
      toast('Configuration reverted', { icon: '↩️' });
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Globe className="w-10 h-10 text-amber-400 mx-auto mb-3 animate-pulse" />
          <p className="text-slate-400 text-sm">Loading environment configuration...</p>
        </div>
      </div>
    );
  }

  // No server state
  if (!selectedServer || !config) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Globe className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">No Server Selected</h3>
          <p className="text-slate-500 text-sm">Create or select an ASE server to manage environment settings.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={cn("space-y-6", !embedded && "pb-24")}
      initial={embedded ? undefined : { opacity: 0, y: 12 }}
      animate={embedded ? undefined : { opacity: 1, y: 0 }}
      transition={embedded ? undefined : { duration: 0.3 }}
    >
      {/* Header */}
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-lime-500/10 border border-lime-500/20 rounded-xl">
              <Globe className="w-5 h-5 text-lime-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Environment & Harvest</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedServer?.name} — Manage rates, resources, and taming economy
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
              <span className="text-[10px] font-bold text-amber-400 tracking-wider uppercase">ASE Engine</span>
            </div>
            {resourceMultipliers.size > 0 && (
              <div className="px-3 py-1 bg-lime-500/10 border border-lime-500/20 rounded-full">
                <span className="text-[10px] font-bold text-lime-400 tracking-wider uppercase">
                  {resourceMultipliers.size} Override{resourceMultipliers.size !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global Rates & Preset Panel */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            Global Rate Multipliers
          </h2>
          {/* Preset Dropdown */}
          <div className="relative z-20" ref={presetRef}>
            <button
              onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-300 hover:bg-white/10 hover:border-amber-500/30 transition-all focus:outline-none"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Apply Preset</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${presetDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {presetDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-64 bg-[#0f1729] border border-white/10 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden"
                >
                  {PRESETS.map(preset => (
                    <button
                      key={preset.tag}
                      onClick={() => applyPreset(preset)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left focus:outline-none"
                    >
                      <span className={`w-2 h-2 rounded-full bg-${preset.color}-400`} />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-200">{preset.label}</p>
                        <p className="text-[10px] text-slate-500">
                          H:{preset.harvestAmount}x T:{preset.tamingSpeed}x XP:{preset.xp}x
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold text-${preset.color}-400 bg-${preset.color}-500/10 px-1.5 py-0.5 rounded`}>
                        {preset.tag}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Slider Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { key: 'harvestAmountMultiplier' as keyof AseGameConfig, label: 'Harvest Amount', icon: <Leaf className="w-4 h-4 text-lime-400" />, max: 20, step: 0.5, color: 'lime' },
            { key: 'tamingSpeedMultiplier' as keyof AseGameConfig, label: 'Taming Speed', icon: <Sprout className="w-4 h-4 text-emerald-400" />, max: 50, step: 0.5, color: 'emerald' },
            { key: 'dinoCountMultiplier' as keyof AseGameConfig, label: 'Dino Spawn Count', icon: <TreePine className="w-4 h-4 text-green-400" />, max: 5, step: 0.1, color: 'green' },
            { key: 'resourcesRespawnPeriodMultiplier' as keyof AseGameConfig, label: 'Resource Respawn', icon: <RotateCw className="w-4 h-4 text-sky-400" />, max: 10, step: 0.1, color: 'sky' },
            { key: 'harvestHealthMultiplier' as keyof AseGameConfig, label: 'Harvest Health', icon: <Mountain className="w-4 h-4 text-amber-400" />, max: 10, step: 0.1, color: 'amber' },
            { key: 'xpMultiplier' as keyof AseGameConfig, label: 'XP Multiplier', icon: <Zap className="w-4 h-4 text-yellow-400" />, max: 50, step: 0.5, color: 'yellow' },
          ].map(slider => {
            const val = config[slider.key] as number;
            return (
              <div key={slider.key} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {slider.icon}
                    <span className="text-xs font-medium text-slate-300">{slider.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={val}
                      onChange={e => updateGlobal(slider.key, parseFloat(e.target.value) || 0)}
                      min={0}
                      max={slider.max}
                      step={slider.step}
                      className="w-16 bg-[#0A0F1C]/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-amber-500/40"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">×</span>
                  </div>
                </div>
                <input
                  type="range"
                  value={val}
                  onChange={e => updateGlobal(slider.key, parseFloat(e.target.value))}
                  min={0}
                  max={slider.max}
                  step={slider.step}
                  className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-amber-500"
                  style={{
                    background: `linear-gradient(to right, hsl(var(--accent-hue, 45) 80% 50%) 0%, hsl(var(--accent-hue, 45) 80% 50%) ${(val / slider.max) * 100}%, rgba(255,255,255,0.05) ${(val / slider.max) * 100}%, rgba(255,255,255,0.05) 100%)`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Toggle Checkboxes */}
        <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-white/5">
          {[
            { key: 'clampResourceHarvestDamage' as keyof AseGameConfig, label: 'Clamp Resource Harvest Damage', tip: 'Prevents excessive resource damage from high-level dinos' },
            { key: 'optimizedHarvestingHealth' as keyof AseGameConfig, label: 'Use Optimized Harvesting Health', tip: 'Applies optimized health calculations for harvested resources' },
          ].map(toggle => (
            <button
              key={toggle.key}
              onClick={() => updateGlobal(toggle.key, !config[toggle.key])}
              className="flex items-center gap-2.5 px-4 py-2 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all group focus:outline-none"
              title={toggle.tip}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${config[toggle.key] ? 'bg-amber-500 border-amber-400' : 'border-white/20'}`}>
                {config[toggle.key] && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-slate-300 group-hover:text-white transition-colors">{toggle.label}</span>
              <Info className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
            </button>
          ))}
        </div>
      </div>

      {/* Agriculture & Farming Settings */}
      <div className="glass-panel rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sprout className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-white">Agriculture & Ecosystem</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { key: 'cropGrowthSpeedMultiplier' as keyof AseGameConfig, label: 'Crop Growth Speed', icon: <Sprout className="w-4 h-4 text-emerald-400" />, max: 20, step: 0.1, color: 'emerald' },
            { key: 'cropDecaySpeedMultiplier' as keyof AseGameConfig, label: 'Crop Decay Speed', icon: <Droplets className="w-4 h-4 text-sky-400" />, max: 20, step: 0.1, color: 'sky' },
            { key: 'poopIntervalMultiplier' as keyof AseGameConfig, label: 'Poop Interval', icon: <Mountain className="w-4 h-4 text-amber-600" />, max: 10, step: 0.1, color: 'amber' },
            { key: 'layEggIntervalMultiplier' as keyof AseGameConfig, label: 'Lay Egg Interval', icon: <Gem className="w-4 h-4 text-fuchsia-400" />, max: 10, step: 0.1, color: 'fuchsia' },
            { key: 'hairGrowthSpeedMultiplier' as keyof AseGameConfig, label: 'Hair Growth Speed', icon: <Sparkles className="w-4 h-4 text-yellow-400" />, max: 10, step: 0.1, color: 'yellow' },
          ].map(slider => {
            const val = config[slider.key] as number ?? 1.0;
            return (
              <div key={slider.key} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {slider.icon}
                    <span className="text-xs font-medium text-slate-300">{slider.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={val}
                      onChange={e => updateGlobal(slider.key, parseFloat(e.target.value) || 0)}
                      min={0}
                      max={slider.max}
                      step={slider.step}
                      className="w-16 bg-[#0A0F1C]/80 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-amber-500/40"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">×</span>
                  </div>
                </div>
                <input
                  type="range"
                  value={val}
                  onChange={e => updateGlobal(slider.key, parseFloat(e.target.value))}
                  min={0}
                  max={slider.max}
                  step={slider.step}
                  className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-amber-500"
                  style={{
                    background: `linear-gradient(to right, hsl(var(--accent-hue, 45) 80% 50%) 0%, hsl(var(--accent-hue, 45) 80% 50%) ${(val / slider.max) * 100}%, rgba(255,255,255,0.05) ${(val / slider.max) * 100}%, rgba(255,255,255,0.05) 100%)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Resource Harvest Overrides */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Wheat className="w-4 h-4 text-lime-400" />
            Custom Harvest Amount Multipliers
            <span className="text-[10px] font-normal text-slate-500 ml-1">
              (per-resource overrides in Game.ini)
            </span>
          </h2>
          {/* Search */}
          <div className="relative w-full md:w-56">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search resources..."
              className="w-full pl-9 pr-4 py-2 bg-[#0A0F1C]/80 border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/30 transition-colors"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-5 p-1.5 bg-white/[0.01] border border-white/5 rounded-xl">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all focus:outline-none ${
                activeCategory === cat
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-300 border border-transparent'
              }`}
            >
              {CATEGORY_ICONS[cat] || <Filter className="w-3.5 h-3.5" />}
              <span>{cat}</span>
              {cat !== 'All' && (
                <span className="text-[9px] opacity-60">
                  ({allResources.filter(r => r.category === cat).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Resource Table */}
        <div className="space-y-1.5">
          {/* Header */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
            <div className="col-span-1">Icon</div>
            <div className="col-span-3">Resource</div>
            <div className="col-span-3">Class Name</div>
            <div className="col-span-1">Source</div>
            <div className="col-span-3">Multiplier</div>
            <div className="col-span-1 text-right">Reset</div>
          </div>

          {/* Rows */}
          <AnimatePresence mode="popLayout">
            {paginatedResources.map(resource => {
              const mult = resourceMultipliers.get(resource.className) ?? 1;
              const hasOverride = resourceMultipliers.has(resource.className);
              return (
                <motion.div
                  key={resource.className}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={`grid grid-cols-12 gap-3 items-center px-4 py-2.5 rounded-xl transition-all ${
                    hasOverride
                      ? 'bg-amber-500/[0.04] border border-amber-500/10 hover:border-amber-500/25'
                      : 'bg-white/[0.01] border border-white/[0.03] hover:bg-white/[0.03] hover:border-white/10'
                  }`}
                >
                  <div className="col-span-1 text-base">{resource.icon}</div>
                  <div className="col-span-3">
                    <p className="text-xs font-medium text-slate-200 truncate">{resource.displayName}</p>
                  </div>
                  <div className="col-span-3">
                    <p className="text-[10px] font-mono text-slate-500 truncate" title={resource.className}>
                      {resource.className}
                    </p>
                  </div>
                  <div className="col-span-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      resource.category === 'Modded'
                        ? 'bg-sky-500/10 text-sky-400'
                        : 'bg-slate-500/10 text-slate-500'
                    }`}>
                      {resource.category === 'Modded' ? 'MOD' : 'BASE'}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <input
                      type="range"
                      value={mult}
                      onChange={e => updateResourceMultiplier(resource.className, parseFloat(e.target.value))}
                      min={0}
                      max={20}
                      step={0.1}
                      className="flex-1 h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-amber-500"
                      style={{
                        background: `linear-gradient(to right, hsl(45 80% 50%) 0%, hsl(45 80% 50%) ${(mult / 20) * 100}%, rgba(255,255,255,0.05) ${(mult / 20) * 100}%, rgba(255,255,255,0.05) 100%)`,
                      }}
                    />
                    <input
                      type="number"
                      value={mult}
                      onChange={e => updateResourceMultiplier(resource.className, parseFloat(e.target.value) || 0)}
                      min={0}
                      max={20}
                      step={0.1}
                      className="w-14 bg-[#0A0F1C]/80 border border-white/10 rounded-lg px-1.5 py-1 text-[11px] text-white text-center focus:outline-none focus:border-amber-500/40"
                    />
                    <span className="text-[10px] text-slate-500">×</span>
                  </div>
                  <div className="col-span-1 text-right">
                    {hasOverride && (
                      <button
                        onClick={() => removeResourceMultiplier(resource.className)}
                        className="p-1 hover:bg-rose-500/10 rounded transition-colors group focus:outline-none"
                        title="Remove custom override"
                      >
                        <X className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 transition-colors" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredResources.length === 0 && (
            <div className="text-center py-10">
              <Search className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No resources match your search</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <p className="text-[10px] text-slate-500">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredResources.length)} of {filteredResources.length}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-white/5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all focus:outline-none"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let page: number;
                if (totalPages <= 7) {
                  page = i + 1;
                } else if (currentPage <= 4) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  page = totalPages - 6 + i;
                } else {
                  page = currentPage - 3 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all focus:outline-none ${
                      currentPage === page
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-500 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-white/5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all focus:outline-none"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Save/Revert Bar */}
      {!embedded && (
        <AnimatePresence>
          {isDirty && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
              <div className="flex items-center gap-3 px-5 py-3 bg-[#0f1729]/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-900/20">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-300 font-medium">Unsaved environment changes</span>
                <button
                  onClick={handleRevert}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all focus:outline-none"
                >
                  Revert
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5 focus:outline-none"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}
