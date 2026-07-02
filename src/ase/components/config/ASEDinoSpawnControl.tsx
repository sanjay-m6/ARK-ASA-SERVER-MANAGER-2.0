import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Info, X, Download, Upload, Plus, Trash2, ArrowRight } from 'lucide-react';
import { VANILLA_CREATURES, CreatureData } from '../../data/creatures';
import { AseGameConfig } from '../../types/ase.types';
import { cn } from '../../../utils/helpers';
import { toast } from 'react-hot-toast';

interface ASEDinoSpawnControlProps {
  config: AseGameConfig;
  onChange: (updated: AseGameConfig) => void;
  externalSearchQuery?: string;
}

type TabType = 'spawn' | 'multipliers' | 'spawn_containers' | 'tamed_damage' | 'tamed_resistance' | 'wild_damage' | 'wild_resistance' | 'replacements';

// Helper: Parse NPCReplacements string: (FromClassName="Class1",ToClassName="Class2")
function parseReplacement(itemStr: string): { from: string; to: string } | null {
  const fromMatch = itemStr.match(/FromClassName="([^"]+)"/);
  const toMatch = itemStr.match(/ToClassName="([^"]*)"/);
  if (fromMatch) {
    return {
      from: fromMatch[1],
      to: toMatch ? toMatch[1] : ''
    };
  }
  return null;
}

// Helper: Compile NPCReplacements string
function stringifyReplacement(from: string, to: string): string {
  return `(FromClassName="${from}",ToClassName="${to}")`;
}

// Helper: Parse DinoSpawnWeightMultipliers string:
// (DinoNameTag="Tag",SpawnWeightMultiplier=1.0,OverrideSpawnLimitPercentage=True,SpawnLimitPercentage=1.0)
interface SpawnWeightParsed {
  tag: string;
  weight: number;
  override: boolean;
  limit: number;
}
function parseSpawnWeight(itemStr: string): SpawnWeightParsed | null {
  const tagMatch = itemStr.match(/DinoNameTag="([^"]+)"/);
  const weightMatch = itemStr.match(/SpawnWeightMultiplier=([\d.]+)/);
  const overrideMatch = itemStr.match(/OverrideSpawnLimitPercentage=(True|False)/i);
  const limitMatch = itemStr.match(/SpawnLimitPercentage=([\d.]+)/);
  
  if (tagMatch) {
    return {
      tag: tagMatch[1],
      weight: weightMatch ? parseFloat(weightMatch[1]) : 1.0,
      override: overrideMatch ? overrideMatch[1].toLowerCase() === 'true' : false,
      limit: limitMatch ? parseFloat(limitMatch[1]) : 1.0
    };
  }
  return null;
}

function stringifySpawnWeight(parsed: SpawnWeightParsed): string {
  const overrideStr = parsed.override ? 'True' : 'False';
  return `(DinoNameTag="${parsed.tag}",SpawnWeightMultiplier=${parsed.weight.toFixed(4)},OverrideSpawnLimitPercentage=${overrideStr},SpawnLimitPercentage=${parsed.limit.toFixed(4)})`;
}

// Helper: Parse Class Multipliers: (ClassName="Class",Multiplier=1.0)
function parseClassMultiplier(itemStr: string): { className: string; multiplier: number } | null {
  const classMatch = itemStr.match(/ClassName="([^"]+)"/);
  const multMatch = itemStr.match(/Multiplier=([\d.]+)/);
  if (classMatch && multMatch) {
    return {
      className: classMatch[1],
      multiplier: parseFloat(multMatch[1])
    };
  }
  return null;
}

function stringifyClassMultiplier(className: string, multiplier: number): string {
  return `(ClassName="${className}",Multiplier=${multiplier.toFixed(4)})`;
}

// Spawn Containers Data and Types
interface SpawnContainerParsed {
  containerClass: string;
  entryName: string;
  entryWeight: number;
  dinoClass: string;
  maxLimit: number;
}

const SPAWN_CONTAINERS = [
  { value: 'DinoSpawnEntriesBeach_C', label: 'Beaches (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesGrassland_C', label: 'Grasslands (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesMountain_C', label: 'Mountains (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesPlains_C', label: 'Plains (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesRedwood_C', label: 'Redwood Forests (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesWater_C', label: 'Deep Ocean (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesTundra_C', label: 'Snow / Ice Tundra (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesJungle_C', label: 'Jungles (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesSwamp_C', label: 'Swamp (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesCave_C', label: 'Caves (Island/Center/Ragnarok)' },
  { value: 'DinoSpawnEntriesMonsterIsland_C', label: 'Monster / Carno Island (Island)' },
  { value: 'DinoSpawnEntriesDunes_C', label: 'Sand Dunes (Scorched Earth)' },
  { value: 'DinoSpawnEntriesCanyon_C', label: 'Canyons (Scorched Earth)' },
  { value: 'DinoSpawnEntriesAberration_C', label: 'Fertile Bio-Dome (Aberration)' },
  { value: 'DinoSpawnEntriesAberration_Blue_C', label: 'Luminous Swamp (Aberration)' },
  { value: 'DinoSpawnEntriesAberration_Red_C', label: 'Radiation Zone (Aberration)' },
  { value: 'DinoSpawnEntriesExtinction_C', label: 'Wasteland (Extinction)' },
  { value: 'Custom', label: 'Custom Container Class...' }
];

function parseSpawnContainer(itemStr: string): SpawnContainerParsed | null {
  try {
    const containerMatch = itemStr.match(/NPCSpawnEntriesContainerClassString="([^"]+)"/);
    const entryNameMatch = itemStr.match(/AnEntryName="([^"]+)"/);
    const entryWeightMatch = itemStr.match(/EntryWeight=([\d.]+)/);
    // Support both NPCsToSpawnStrings and NPCsToSpawn
    const dinoClassMatch = itemStr.match(/NPCsToSpawnStrings=\("([^"]+)"\)/) || itemStr.match(/NPCsToSpawn=\("([^"]+)"\)/);
    // Support both NPCClassString and NPCClass
    const limitMatch = itemStr.match(/MaxPercentageOfDesiredNumToAllow=([\d.]+)/);
    
    if (containerMatch && entryNameMatch && dinoClassMatch) {
      const dinoClass = dinoClassMatch[1];
      const maxLimit = limitMatch ? parseFloat(limitMatch[1]) : 1.0;
      return {
        containerClass: containerMatch[1],
        entryName: entryNameMatch[1],
        entryWeight: entryWeightMatch ? parseFloat(entryWeightMatch[1]) : 1.0,
        dinoClass,
        maxLimit
      };
    }
  } catch (e) {
    console.error('Failed to parse spawn container entry:', e);
  }
  return null;
}

function stringifySpawnContainer(data: SpawnContainerParsed): string {
  return `(NPCSpawnEntriesContainerClassString="${data.containerClass}",NPCSpawnEntries=((AnEntryName="${data.entryName}",EntryWeight=${data.entryWeight.toFixed(2)},NPCsToSpawnStrings=("${data.dinoClass}"))),NPCSpawnLimits=((NPCClassString="${data.dinoClass}",MaxPercentageOfDesiredNumToAllow=${data.maxLimit.toFixed(2)})))`;
}

// Custom Virtual Scroll Hook for 1000+ Dino Rows
function useVirtualList<T>({
  items,
  itemHeight = 64,
  containerHeight = 450,
  overscan = 6
}: {
  items: T[];
  itemHeight?: number;
  containerHeight?: number;
  overscan?: number;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = items.length * itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length - 1, Math.floor((scrollTop + containerHeight) / itemHeight) + overscan);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      item,
      index: startIndex + index,
      style: {
        position: 'absolute' as const,
        top: 0,
        transform: `translateY(${(startIndex + index) * itemHeight}px)`,
        height: itemHeight,
        width: '100%'
      }
    }));
  }, [items, startIndex, endIndex, itemHeight]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return { visibleItems, totalHeight, onScroll };
}

export function ASEDinoSpawnControl({ config, onChange, externalSearchQuery }: ASEDinoSpawnControlProps) {
  const [activeTab, setActiveTab] = useState<TabType>('spawn');

  // Spawn Container Form States
  const [containerClass, setContainerClass] = useState('DinoSpawnEntriesBeach_C');
  const [customContainerClass, setCustomContainerClass] = useState('');
  const [containerAction, setContainerAction] = useState<'add' | 'override'>('add');
  const [containerDinoClass, setContainerDinoClass] = useState('Dodo_Character_BP_C');
  const [containerEntryName, setContainerEntryName] = useState('DodoCustom');
  const [containerEntryWeight, setContainerEntryWeight] = useState(1.0);
  const [containerMaxLimit, setContainerMaxLimit] = useState(0.1);
  const [editingContainerIndex, setEditingContainerIndex] = useState<number | null>(null);
  const [editingContainerAction, setEditingContainerAction] = useState<'add' | 'override' | null>(null);
  
  // Custom Mod Creatures State
  const [customCreatures, setCustomCreatures] = useState<CreatureData[]>([]);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomClass, setNewCustomClass] = useState('');
  const [newCustomTag, setNewCustomTag] = useState('');
  const [newCustomMod, setNewCustomMod] = useState('Custom Mod');

  // Combined creature list (Vanilla + Custom Mod)
  const allCreatures = useMemo(() => {
    return [...VANILLA_CREATURES, ...customCreatures];
  }, [customCreatures]);

  // Helper to strip surrounding quotes
  const cleanClassName = (cls: string) => cls.replace(/^"+|"+$/g, '').trim();

  // Load custom creatures from config if they are configured but not in vanilla
  useEffect(() => {
    const knownClasses = new Set(VANILLA_CREATURES.map(c => c.className));
    const newlyDetected: CreatureData[] = [];
    
    // Scan preventDinoTameClassNames
    (config.preventDinoTameClassNames || []).forEach(rawCls => {
      const cls = cleanClassName(rawCls);
      if (cls && !knownClasses.has(cls)) {
        newlyDetected.push({
          name: cls.replace(/_Character_BP_C$/i, '').replace(/_/g, ' '),
          className: cls,
          tag: cls.replace(/_Character_BP_C$/i, ''),
          expansion: 'Custom Added',
          breedable: false,
          tameable: false
        });
        knownClasses.add(cls);
      }
    });

    // Scan excludeDinoClasses
    (config.excludeDinoClasses || []).forEach(rawCls => {
      const cls = cleanClassName(rawCls);
      if (cls && !knownClasses.has(cls)) {
        newlyDetected.push({
          name: cls.replace(/_Character_BP_C$/i, '').replace(/_/g, ' '),
          className: cls,
          tag: cls.replace(/_Character_BP_C$/i, ''),
          expansion: 'Custom Added',
          breedable: false,
          tameable: false
        });
        knownClasses.add(cls);
      }
    });

    if (newlyDetected.length > 0) {
      setCustomCreatures(prev => {
        const existing = new Set(prev.map(c => c.className));
        const filtered = newlyDetected.filter(c => !existing.has(c.className));
        return [...prev, ...filtered];
      });
    }
  }, [config.preventDinoTameClassNames, config.excludeDinoClasses]);

  // Migrate any old, non-functional excludeDinoClasses array entries to npcReplacements format automatically
  useEffect(() => {
    if (config.excludeDinoClasses && config.excludeDinoClasses.length > 0) {
      let replacements = [...(config.npcReplacements || [])];
      let changed = false;
      config.excludeDinoClasses.forEach(rawCls => {
        const cleanCls = cleanClassName(rawCls);
        if (cleanCls) {
          const exists = replacements.some(item => {
            const parsed = parseReplacement(item);
            return parsed ? parsed.from === cleanCls : false;
          });
          if (!exists) {
            replacements.push(stringifyReplacement(cleanCls, ''));
            changed = true;
          }
        }
      });
      onChange({
        ...config,
        excludeDinoClasses: [], // Clear old non-functional key
        npcReplacements: replacements
      });
      if (changed) {
        toast.success(`Migrated ${config.excludeDinoClasses.length} excluded creatures to NPCReplacements format`);
      }
    }
  }, [config.excludeDinoClasses]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Sync external search query from visual editor sidebar
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);
  const [modFilter, setModFilter] = useState('All'); // All, Vanilla, DLC, Mods
  const [typeFilter, setTypeFilter] = useState('All'); // All, Flyer, Water, Boss, Tek, Aberrant, Corrupted, X, R
  const [aggressionFilter, setAggressionFilter] = useState('All');
  const [dietFilter, setDietFilter] = useState('All');

  // Selected row indices
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());

  // Sidebar creature info state
  const [selectedCreature, setSelectedCreature] = useState<CreatureData | null>(null);

  // Import / Export JSON
  const [importString, setImportString] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const addSpawnContainersList = useMemo(() => {
    const list: (SpawnContainerParsed & { raw: string; index: number })[] = [];
    (config.configAddNpcSpawnEntriesContainer || []).forEach((item, index) => {
      const parsed = parseSpawnContainer(item);
      if (parsed) {
        list.push({ ...parsed, raw: item, index });
      }
    });
    return list;
  }, [config.configAddNpcSpawnEntriesContainer]);

  const overrideSpawnContainersList = useMemo(() => {
    const list: (SpawnContainerParsed & { raw: string; index: number })[] = [];
    (config.configOverrideNpcSpawnEntriesContainer || []).forEach((item, index) => {
      const parsed = parseSpawnContainer(item);
      if (parsed) {
        list.push({ ...parsed, raw: item, index });
      }
    });
    return list;
  }, [config.configOverrideNpcSpawnEntriesContainer]);

  // Parse mapped values for easier lookups
  const excludedSpawns = useMemo(() => {
    const set = new Set<string>();
    (config.npcReplacements || []).forEach(item => {
      const parsed = parseReplacement(item);
      if (parsed) {
        set.add(cleanClassName(parsed.from));
      }
    });
    return set;
  }, [config.npcReplacements]);

  const preventedTaming = useMemo(() => {
    const set = new Set<string>();
    (config.preventDinoTameClassNames || []).forEach(cls => {
      if (cls) set.add(cleanClassName(cls));
    });
    return set;
  }, [config.preventDinoTameClassNames]);

  const activeReplacementsMap = useMemo(() => {
    const map = new Map<string, string>();
    (config.npcReplacements || []).forEach(item => {
      const parsed = parseReplacement(item);
      if (parsed) map.set(parsed.from, parsed.to);
    });
    return map;
  }, [config.npcReplacements]);

  const spawnMultipliersMap = useMemo(() => {
    const map = new Map<string, SpawnWeightParsed>();
    (config.dinoSpawnWeightMultipliers || []).forEach(item => {
      const parsed = parseSpawnWeight(item);
      if (parsed) map.set(parsed.tag, parsed);
    });
    return map;
  }, [config.dinoSpawnWeightMultipliers]);

  const wildDamageMap = useMemo(() => {
    const map = new Map<string, number>();
    (config.dinoClassDamageMultipliers || []).forEach(item => {
      const parsed = parseClassMultiplier(item);
      if (parsed) map.set(parsed.className, parsed.multiplier);
    });
    return map;
  }, [config.dinoClassDamageMultipliers]);

  const wildResistanceMap = useMemo(() => {
    const map = new Map<string, number>();
    (config.dinoClassResistanceMultipliers || []).forEach(item => {
      const parsed = parseClassMultiplier(item);
      if (parsed) map.set(parsed.className, parsed.multiplier);
    });
    return map;
  }, [config.dinoClassResistanceMultipliers]);

  const tamedDamageMap = useMemo(() => {
    const map = new Map<string, number>();
    (config.tamedDinoClassDamageMultipliers || []).forEach(item => {
      const parsed = parseClassMultiplier(item);
      if (parsed) map.set(parsed.className, parsed.multiplier);
    });
    return map;
  }, [config.tamedDinoClassDamageMultipliers]);

  const tamedResistanceMap = useMemo(() => {
    const map = new Map<string, number>();
    (config.tamedDinoClassResistanceMultipliers || []).forEach(item => {
      const parsed = parseClassMultiplier(item);
      if (parsed) map.set(parsed.className, parsed.multiplier);
    });
    return map;
  }, [config.tamedDinoClassResistanceMultipliers]);

  // Statistics counters
  const stats = useMemo(() => {
    let spawnable = 0;
    let tameable = 0;
    let breedable = 0;
    
    allCreatures.forEach(c => {
      if (!excludedSpawns.has(c.className)) spawnable++;
      if (!preventedTaming.has(c.className)) tameable++;
      if (c.breedable) breedable++;
    });

    return {
      total: allCreatures.length,
      spawnable,
      tameable,
      breedable,
      replacements: activeReplacementsMap.size
    };
  }, [allCreatures, excludedSpawns, preventedTaming, activeReplacementsMap]);

  // Filtered Creature list
  const filteredCreatures = useMemo(() => {
    return allCreatures.filter(c => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesClass = c.className.toLowerCase().includes(query);
        const matchesExpansion = c.expansion.toLowerCase().includes(query);
        const matchesTag = c.tag.toLowerCase().includes(query);
        if (!matchesName && !matchesClass && !matchesExpansion && !matchesTag) return false;
      }

      // Mod/DLC Filter
      if (modFilter !== 'All') {
        const isVanillaMap = ['The Island', 'Scorched Earth', 'Aberration', 'Extinction', 'Genesis Part 1', 'Genesis Part 2', 'Ragnarok', 'Valguero', 'Crystal Isles', 'Lost Island', 'Fjordur', 'The Center'].includes(c.expansion);
        if (modFilter === 'Vanilla' && c.expansion !== 'The Island') return false;
        if (modFilter === 'DLC' && (!isVanillaMap || c.expansion === 'The Island')) return false;
        if (modFilter === 'Mods' && isVanillaMap) return false;
      }

      // Type Filter
      if (typeFilter !== 'All') {
        if (typeFilter === 'Flyer' && !c.isFlyer) return false;
        if (typeFilter === 'Water' && !c.isWater) return false;
        if (typeFilter === 'Boss' && !c.isBoss) return false;
        if (typeFilter === 'Tek' && !c.isTek) return false;
        if (typeFilter === 'Aberrant' && !c.isAberrant) return false;
        if (typeFilter === 'Corrupted' && !c.isCorrupted) return false;
        if (typeFilter === 'X' && !c.isXVariant) return false;
        if (typeFilter === 'R' && !c.isRVariant) return false;
      }

      // Aggression Filter
      if (aggressionFilter !== 'All' && c.aggression !== aggressionFilter) return false;

      // Diet Filter
      if (dietFilter !== 'All' && c.diet !== dietFilter) return false;

      return true;
    });
  }, [allCreatures, searchQuery, modFilter, typeFilter, aggressionFilter, dietFilter]);

  // Scroll Virtualization
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(480);
  
  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight || 480);
    }
  }, [containerRef, activeTab]);

  const { visibleItems, totalHeight, onScroll } = useVirtualList({
    items: filteredCreatures,
    itemHeight: 68,
    containerHeight,
    overscan: 8
  });

  const wrapInQuotes = (cls: string) => {
    const cleaned = cls.replace(/^"+|"+$/g, '').trim();
    return `"${cleaned}"`;
  };

  // Event handlers for modifying config
  const toggleSpawnable = (className: string, currentVal: boolean) => {
    let replacements = [...(config.npcReplacements || [])];
    const cleanCls = cleanClassName(className);
    
    // Remove existing replacement entry for this class
    replacements = replacements.filter(item => {
      const parsed = parseReplacement(item);
      return parsed ? parsed.from !== cleanCls : true;
    });

    if (currentVal) {
      // Currently spawnable -> click means prevent spawning (replace with "")
      replacements.push(stringifyReplacement(cleanCls, ''));
    }

    onChange({
      ...config,
      npcReplacements: replacements
    });
  };

  const toggleTameable = (className: string, currentVal: boolean) => {
    let nextArr = (config.preventDinoTameClassNames || []).map(cleanClassName);
    const cleanCls = cleanClassName(className);
    if (currentVal) {
      // Currently tameable -> disable taming
      if (!nextArr.includes(cleanCls)) {
        nextArr.push(cleanCls);
      }
    } else {
      // Untameable -> make tameable
      nextArr = nextArr.filter(c => c !== cleanCls);
    }
    onChange({
      ...config,
      preventDinoTameClassNames: nextArr.map(wrapInQuotes)
    });
  };

  const setReplacement = (fromClass: string, toClass: string) => {
    let replacements = [...(config.npcReplacements || [])];
    // Remove existing replacement for this class if present
    replacements = replacements.filter(item => {
      const parsed = parseReplacement(item);
      return parsed ? parsed.from !== fromClass : true;
    });

    if (toClass === '__disabled__') {
      replacements.push(stringifyReplacement(fromClass, ''));
    } else if (toClass !== '__none__' && toClass !== '') {
      replacements.push(stringifyReplacement(fromClass, toClass));
    }

    onChange({
      ...config,
      npcReplacements: replacements
    });
  };

  const setSpawnWeightOverride = (tag: string, weight: number, limit: number, override: boolean) => {
    let weights = [...(config.dinoSpawnWeightMultipliers || [])];
    weights = weights.filter(item => {
      const parsed = parseSpawnWeight(item);
      return parsed ? parsed.tag !== tag : true;
    });

    // Only append if it deviates from defaults (weight: 1.0, limit: 1.0, override: false)
    if (weight !== 1.0 || limit !== 1.0 || override) {
      weights.push(stringifySpawnWeight({ tag, weight, limit, override }));
    }

    onChange({
      ...config,
      dinoSpawnWeightMultipliers: weights
    });
  };

  const setClassMultiplierValue = (
    className: string, 
    value: number, 
    configKey: 'dinoClassDamageMultipliers' | 'dinoClassResistanceMultipliers' | 'tamedDinoClassDamageMultipliers' | 'tamedDinoClassResistanceMultipliers'
  ) => {
    let arr = [...(config[configKey] || [])];
    arr = arr.filter(item => {
      const parsed = parseClassMultiplier(item);
      return parsed ? parsed.className !== className : true;
    });

    // Save override if value is not 1.0
    if (value !== 1.0) {
      arr.push(stringifyClassMultiplier(className, value));
    }

    onChange({
      ...config,
      [configKey]: arr
    });
  };

  // Bulk operations
  const handleBulkToggleSpawn = (enable: boolean) => {
    const targets = selectedClasses.size > 0 
      ? Array.from(selectedClasses) 
      : filteredCreatures.map(c => c.className);
      
    let replacements = [...(config.npcReplacements || [])];
    targets.forEach(clsName => {
      const cleanCls = cleanClassName(clsName);
      
      // Remove existing replacement for this class
      replacements = replacements.filter(item => {
        const parsed = parseReplacement(item);
        return parsed ? parsed.from !== cleanCls : true;
      });

      if (!enable) {
        // disable -> replace with empty string
        replacements.push(stringifyReplacement(cleanCls, ''));
      }
    });

    onChange({
      ...config,
      npcReplacements: replacements
    });
    toast.success(`Updated spawn settings for ${targets.length} creatures`);
  };

  const handleBulkToggleTame = (enable: boolean) => {
    const targets = selectedClasses.size > 0 
      ? Array.from(selectedClasses) 
      : filteredCreatures.map(c => c.className);

    let nextArr = (config.preventDinoTameClassNames || []).map(cleanClassName);
    targets.forEach(clsName => {
      const cleanCls = cleanClassName(clsName);
      if (enable) {
        nextArr = nextArr.filter(c => c !== cleanCls);
      } else {
        if (!nextArr.includes(cleanCls)) nextArr.push(cleanCls);
      }
    });

    onChange({
      ...config,
      preventDinoTameClassNames: nextArr.map(wrapInQuotes)
    });
    toast.success(`Updated taming settings for ${targets.length} creatures`);
  };

  const handleSaveSpawnContainer = () => {
    if (!containerDinoClass) {
      toast.error('Please select a dino class');
      return;
    }
    const finalContainer = containerClass === 'Custom' ? customContainerClass.trim() : containerClass;
    if (!finalContainer) {
      toast.error('Please enter a container class name');
      return;
    }
    const cleanEntryName = containerEntryName.trim() || 'CustomEntry';

    const entryData: SpawnContainerParsed = {
      containerClass: finalContainer,
      entryName: cleanEntryName,
      entryWeight: containerEntryWeight,
      dinoClass: containerDinoClass,
      maxLimit: containerMaxLimit
    };

    const newString = stringifySpawnContainer(entryData);

    const configKey = containerAction === 'add' 
      ? 'configAddNpcSpawnEntriesContainer' 
      : 'configOverrideNpcSpawnEntriesContainer';

    let currentList = [...(config[configKey] || [])];

    if (editingContainerIndex !== null && editingContainerAction === containerAction) {
      // Editing existing entry in the same list
      currentList[editingContainerIndex] = newString;
    } else {
      // Adding new entry, or moving between lists (add vs override)
      if (editingContainerIndex !== null && editingContainerAction !== null) {
        // Remove from old list
        const oldKey = editingContainerAction === 'add' 
          ? 'configAddNpcSpawnEntriesContainer' 
          : 'configOverrideNpcSpawnEntriesContainer';
        const oldList = [...(config[oldKey] || [])].filter((_, idx) => idx !== editingContainerIndex);
        onChange({
          ...config,
          [oldKey]: oldList,
          [configKey]: [...currentList, newString]
        });
        resetSpawnContainerForm();
        toast.success('Spawn container entry updated');
        return;
      } else {
        currentList.push(newString);
      }
    }

    onChange({
      ...config,
      [configKey]: currentList
    });

    resetSpawnContainerForm();
    toast.success('Spawn container entry saved');
  };

  const handleDeleteSpawnContainer = (action: 'add' | 'override', index: number) => {
    const configKey = action === 'add' 
      ? 'configAddNpcSpawnEntriesContainer' 
      : 'configOverrideNpcSpawnEntriesContainer';
    const list = [...(config[configKey] || [])].filter((_, idx) => idx !== index);
    onChange({
      ...config,
      [configKey]: list
    });
    toast.success('Spawn container entry deleted');
  };

  const handleEditSpawnContainer = (action: 'add' | 'override', index: number, data: SpawnContainerParsed) => {
    setContainerAction(action);
    if (['DinoSpawnEntriesBeach_C', 'DinoSpawnEntriesGrassland_C', 'DinoSpawnEntriesMountain_C', 'DinoSpawnEntriesPlains_C', 'DinoSpawnEntriesRedwood_C', 'DinoSpawnEntriesWater_C', 'DinoSpawnEntriesTundra_C', 'DinoSpawnEntriesJungle_C', 'DinoSpawnEntriesSwamp_C', 'DinoSpawnEntriesCave_C', 'DinoSpawnEntriesMonsterIsland_C', 'DinoSpawnEntriesDunes_C', 'DinoSpawnEntriesCanyon_C', 'DinoSpawnEntriesAberration_C', 'DinoSpawnEntriesAberration_Red_C', 'DinoSpawnEntriesAberration_Blue_C', 'DinoSpawnEntriesExtinction_C'].includes(data.containerClass)) {
      setContainerClass(data.containerClass);
      setCustomContainerClass('');
    } else {
      setContainerClass('Custom');
      setCustomContainerClass(data.containerClass);
    }
    setContainerDinoClass(data.dinoClass);
    setContainerEntryName(data.entryName);
    setContainerEntryWeight(data.entryWeight);
    setContainerMaxLimit(data.maxLimit);
    setEditingContainerIndex(index);
    setEditingContainerAction(action);
  };

  const resetSpawnContainerForm = () => {
    setContainerClass('DinoSpawnEntriesBeach_C');
    setCustomContainerClass('');
    setContainerDinoClass('Dodo_Character_BP_C');
    setContainerEntryName('DodoCustom');
    setContainerEntryWeight(1.0);
    setContainerMaxLimit(0.1);
    setEditingContainerIndex(null);
    setEditingContainerAction(null);
  };

  const handleResetFiltersAndSelections = () => {
    setSelectedClasses(new Set());
    setSearchQuery('');
    setModFilter('All');
    setTypeFilter('All');
    setAggressionFilter('All');
    setDietFilter('All');
    toast.success('Filters and selections reset');
  };

  // Add a Custom Mod Creature
  const handleAddCustomCreature = () => {
    if (!newCustomName || !newCustomClass) {
      toast.error('Please enter Name and Class Name');
      return;
    }
    const cleanClass = newCustomClass.trim();
    const cleanName = newCustomName.trim();
    const cleanTag = newCustomTag.trim() || cleanClass.replace(/_Character_BP_C$/i, '');

    // Check duplicate
    if (allCreatures.some(c => c.className === cleanClass)) {
      toast.error('Creature with this Class Name already exists');
      return;
    }

    const newCreature: CreatureData = {
      name: cleanName,
      className: cleanClass,
      tag: cleanTag,
      expansion: newCustomMod,
      breedable: true,
      tameable: true
    };

    setCustomCreatures(prev => [...prev, newCreature]);
    setIsCustomModalOpen(false);
    setNewCustomName('');
    setNewCustomClass('');
    setNewCustomTag('');
    toast.success(`Custom creature "${cleanName}" added`);
  };

  // Export / Import logic
  const handleExportConfig = () => {
    const data = {
      excludeDinoClasses: config.excludeDinoClasses || [],
      preventDinoTameClassNames: config.preventDinoTameClassNames || [],
      npcReplacements: config.npcReplacements || [],
      dinoSpawnWeightMultipliers: config.dinoSpawnWeightMultipliers || [],
      dinoClassDamageMultipliers: config.dinoClassDamageMultipliers || [],
      dinoClassResistanceMultipliers: config.dinoClassResistanceMultipliers || [],
      tamedDinoClassDamageMultipliers: config.tamedDinoClassDamageMultipliers || [],
      tamedDinoClassResistanceMultipliers: config.tamedDinoClassResistanceMultipliers || []
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success('Creature configuration exported (JSON copied to clipboard)');
  };

  const handleImportConfig = () => {
    try {
      const parsed = JSON.parse(importString);
      onChange({
        ...config,
        excludeDinoClasses: parsed.excludeDinoClasses || config.excludeDinoClasses || [],
        preventDinoTameClassNames: parsed.preventDinoTameClassNames || config.preventDinoTameClassNames || [],
        npcReplacements: parsed.npcReplacements || config.npcReplacements || [],
        dinoSpawnWeightMultipliers: parsed.dinoSpawnWeightMultipliers || config.dinoSpawnWeightMultipliers || [],
        dinoClassDamageMultipliers: parsed.dinoClassDamageMultipliers || config.dinoClassDamageMultipliers || [],
        dinoClassResistanceMultipliers: parsed.dinoClassResistanceMultipliers || config.dinoClassResistanceMultipliers || [],
        tamedDinoClassDamageMultipliers: parsed.tamedDinoClassDamageMultipliers || config.tamedDinoClassDamageMultipliers || [],
        tamedDinoClassResistanceMultipliers: parsed.tamedDinoClassResistanceMultipliers || config.tamedDinoClassResistanceMultipliers || []
      });
      setIsImportModalOpen(false);
      setImportString('');
      toast.success('Configurations imported successfully!');
    } catch {
      toast.error('Invalid JSON structure. Please check and try again.');
    }
  };

  // Bulk actions row selection helpers
  const handleRowSelect = (className: string) => {
    const next = new Set(selectedClasses);
    if (next.has(className)) {
      next.delete(className);
    } else {
      next.add(className);
    }
    setSelectedClasses(next);
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedClasses);
    const allFiltered = filteredCreatures.map(c => c.className);
    const areAllSelected = allFiltered.every(cls => next.has(cls));
    
    if (areAllSelected) {
      allFiltered.forEach(cls => next.delete(cls));
    } else {
      allFiltered.forEach(cls => next.add(cls));
    }
    setSelectedClasses(next);
  };



  return (
    <div className="flex flex-col gap-6 text-left relative min-h-[600px]">
      
      {/* Redesigned Hero Page Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 bg-slate-950/40 p-6 rounded-3xl border border-slate-800/60 shadow-lg">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            🦖 Creature Spawn Control
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 max-w-xl leading-relaxed">
            Manage every ARK creature from one place. Configure spawning, taming, breeding, damage multipliers, resistance, and NPC replacements.
          </p>
        </div>
        
        {/* Statistics Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full lg:w-auto shrink-0">
          {[
            { label: 'Total', count: stats.total, color: 'text-slate-200 border-slate-800 bg-slate-900/10' },
            { label: 'Spawnable', count: stats.spawnable, color: 'text-emerald-400 border-emerald-500/10 bg-emerald-500/5' },
            { label: 'Tameable', count: stats.tameable, color: 'text-sky-400 border-sky-500/10 bg-sky-500/5' },
            { label: 'Breedable', count: stats.breedable, color: 'text-rose-400 border-rose-500/10 bg-rose-500/5' },
            { label: 'Replacements', count: stats.replacements, color: 'text-purple-400 border-purple-500/10 bg-purple-500/5' },
          ].map(stat => (
            <div key={stat.label} className={cn("px-4 py-3 rounded-2xl border flex flex-col items-center justify-center min-w-[90px] shadow-sm", stat.color)}>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{stat.label}</span>
              <span className="text-lg font-black mt-1 leading-none">{stat.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modern Tabs Navigation */}
      <div className="flex flex-wrap gap-1.5 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-900">
        {[
          { id: 'spawn', label: 'Creature List' },
          { id: 'multipliers', label: 'Spawn Multipliers' },
          { id: 'spawn_containers', label: 'Spawn Containers' },
          { id: 'tamed_damage', label: 'Tamed Damage' },
          { id: 'tamed_resistance', label: 'Tamed Resistance' },
          { id: 'wild_damage', label: 'Wild Damage' },
          { id: 'wild_resistance', label: 'Wild Resistance' },
          { id: 'replacements', label: 'NPC Replacements' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300",
              activeTab === tab.id
                ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 shadow-md"
                : "bg-transparent border border-transparent text-slate-400 hover:text-slate-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar / Search bar / Advanced filters */}
      {activeTab !== 'spawn_containers' && (
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-slate-950/20 p-4 rounded-2xl border border-slate-800/40 animate-fadeIn">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search creature name, class name, expansion..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500/50 transition-all shadow-inner"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={modFilter}
              onChange={e => setModFilter(e.target.value)}
              className="appearance-none bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="All">All Mods/DLCs</option>
              <option value="Vanilla">Vanilla (The Island)</option>
              <option value="DLC">DLC Expansions</option>
              <option value="Mods">Custom Mods</option>
            </select>

            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="appearance-none bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="All">All Types</option>
              <option value="Flyer">Flyers</option>
              <option value="Water">Water Creatures</option>
              <option value="Boss">Bosses</option>
              <option value="Tek">Tek Variants</option>
              <option value="Aberrant">Aberrant Variants</option>
              <option value="Corrupted">Corrupted Variants</option>
              <option value="X">X Variants</option>
              <option value="R">R Variants</option>
            </select>

            <button
              onClick={() => setIsCustomModalOpen(true)}
              className="px-3.5 py-2 bg-[#1a1a2e] hover:bg-[#252542] border border-[#2d2d44] hover:border-amber-500/50 rounded-xl text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Custom Mod Entry
            </button>

            <button
              onClick={handleExportConfig}
              className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition-all"
              title="Export settings"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition-all"
              title="Import settings"
            >
              <Upload className="w-4 h-4" />
            </button>

            <button
              onClick={handleResetFiltersAndSelections}
              className="px-3.5 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-xl text-xs font-bold transition-all"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Bulk actions floating bar */}
      {activeTab !== 'spawn_containers' && (selectedClasses.size > 0 || searchQuery) && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 border border-slate-800 px-6 py-3.5 rounded-2xl shadow-xl animate-slideIn">
          <div className="text-xs font-semibold text-slate-400">
            {selectedClasses.size > 0 ? (
              <span>Selected <strong className="text-white">{selectedClasses.size}</strong> creatures</span>
            ) : (
              <span>All <strong className="text-white">{filteredCreatures.length}</strong> filtered creatures</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkToggleSpawn(true)}
              className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg transition-all"
            >
              Enable Spawn
            </button>
            <button
              onClick={() => handleBulkToggleSpawn(false)}
              className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg transition-all"
            >
              Disable Spawn
            </button>
            <button
              onClick={() => handleBulkToggleTame(true)}
              className="px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 text-sky-400 text-xs font-bold rounded-lg transition-all"
            >
              Enable Tame
            </button>
            <button
              onClick={() => handleBulkToggleTame(false)}
              className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 text-orange-400 text-xs font-bold rounded-lg transition-all"
            >
              Disable Tame
            </button>
            <button
              onClick={() => setSelectedClasses(new Set())}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold rounded-lg transition-all"
            >
              Clear Selected
            </button>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        {activeTab === 'spawn_containers' ? (
          <div className="xl:col-span-2 flex flex-col bg-slate-950/40 rounded-3xl border border-slate-800/80 overflow-hidden shadow-lg min-h-[480px]">
            {/* Spawn Containers visual editor */}
            <div className="p-6 flex flex-col gap-6 text-left animate-fadeIn">
              <div className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-5 flex flex-col gap-4 shadow-inner">
                <h3 className="text-xs font-black text-amber-500 uppercase tracking-wider">
                  {editingContainerIndex !== null ? 'Edit Spawn Entry' : 'Add Custom Spawn Entry'}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Spawn Container Dropdown */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500">Spawn Container</label>
                    <select
                      value={containerClass}
                      onChange={e => setContainerClass(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl px-3 py-2 text-slate-355 focus:outline-none focus:border-amber-500/50"
                    >
                      {SPAWN_CONTAINERS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Custom Container Class input if Custom selected */}
                  {containerClass === 'Custom' && (
                    <div className="flex flex-col gap-1.5 animate-slideIn">
                      <label className="text-[10px] font-black uppercase text-slate-500">Custom Container Class String</label>
                      <input
                        type="text"
                        placeholder="e.g. DinoSpawnEntriesGrassland_C"
                        value={customContainerClass}
                        onChange={e => setCustomContainerClass(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  )}

                  {/* Config Action Add vs Override */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500">Action Type</label>
                    <select
                      value={containerAction}
                      onChange={e => setContainerAction(e.target.value as 'add' | 'override')}
                      className="w-full bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl px-3 py-2 text-slate-355 focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="add">Add Spawns (Append to existing)</option>
                      <option value="override">Override Spawns (Replace container contents)</option>
                    </select>
                  </div>

                  {/* Creature Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500">Target Creature</label>
                    <select
                      value={containerDinoClass}
                      onChange={e => {
                        setContainerDinoClass(e.target.value);
                        const cr = allCreatures.find(c => c.className === e.target.value);
                        if (cr) {
                          setContainerEntryName(cr.name.replace(/\s+/g, '') + 'Custom');
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl px-3 py-2 text-slate-355 focus:outline-none focus:border-amber-500/50"
                    >
                      {allCreatures.map(cr => (
                        <option key={cr.className} value={cr.className}>{cr.name} ({cr.className})</option>
                      ))}
                    </select>
                  </div>

                  {/* Unique Entry Name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500">Unique Entry Name</label>
                    <input
                      type="text"
                      placeholder="e.g. RaptorCustom"
                      value={containerEntryName}
                      onChange={e => setContainerEntryName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {/* Entry Weight */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500">Entry Weight ({containerEntryWeight.toFixed(2)})</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.01"
                        max="10.0"
                        step="0.05"
                        value={containerEntryWeight}
                        onChange={e => setContainerEntryWeight(parseFloat(e.target.value))}
                        className="flex-1 accent-amber-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min="0.01"
                        value={containerEntryWeight}
                        onChange={e => setContainerEntryWeight(parseFloat(e.target.value) || 1.0)}
                        className="w-16 bg-slate-950 border border-slate-800 text-center text-xs font-bold text-slate-355 rounded-lg py-1 focus:border-amber-500/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Spawn Limit Percentage */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500">Spawn Limit ({containerMaxLimit.toFixed(2)} / {(containerMaxLimit * 100).toFixed(0)}%)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.00"
                        max="1.0"
                        step="0.01"
                        value={containerMaxLimit}
                        onChange={e => setContainerMaxLimit(parseFloat(e.target.value))}
                        className="flex-1 accent-amber-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0.00"
                        max="1.0"
                        value={containerMaxLimit}
                        onChange={e => setContainerMaxLimit(parseFloat(e.target.value) || 0.0)}
                        className="w-16 bg-slate-950 border border-slate-800 text-center text-xs font-bold text-slate-355 rounded-lg py-1 focus:border-amber-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 mt-3 pt-3 border-t border-white/5">
                  {editingContainerIndex !== null && (
                    <button
                      onClick={resetSpawnContainerForm}
                      className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition-all"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    onClick={handleSaveSpawnContainer}
                    className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-400 hover:to-orange-400 rounded-xl text-xs font-extrabold transition-all"
                  >
                    {editingContainerIndex !== null ? 'Update Entry' : 'Add Entry'}
                  </button>
                </div>
              </div>

              {/* List of active entries */}
              <div className="flex flex-col gap-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Active Spawn Container Rules ({addSpawnContainersList.length + overrideSpawnContainersList.length})
                </h4>
                
                {(addSpawnContainersList.length === 0 && overrideSpawnContainersList.length === 0) ? (
                  <div className="text-slate-500 text-xs italic py-10 text-center bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
                    No custom spawn container overrides configured. Use the form above to add one.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
                    {/* Render Add Entries */}
                    {addSpawnContainersList.map((item) => {
                      const dino = allCreatures.find(cr => cr.className === item.dinoClass);
                      return (
                        <div key={`add-${item.index}`} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/60 border border-slate-850 hover:border-slate-800 transition-all duration-300">
                          <div className="flex flex-col min-w-0 gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-[8px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">ADD</span>
                              <span className="text-xs font-bold text-amber-500 truncate max-w-[180px]" title={item.containerClass}>
                                {item.containerClass.replace(/_C$/i, '')}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                              <span className="text-xs font-bold text-sky-400 truncate max-w-[180px]">
                                {dino?.name || item.dinoClass.replace(/_Character_BP_C$/i, '')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
                              <span>Entry Name: <strong className="text-slate-350">{item.entryName}</strong></span>
                              <span>Weight: <strong className="text-slate-350">{item.entryWeight.toFixed(2)}</strong></span>
                              <span>Limit: <strong className="text-slate-350">{(item.maxLimit * 100).toFixed(0)}%</strong></span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleEditSpawnContainer('add', item.index, item)}
                              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white transition-all"
                              title="Edit spawn entry"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteSpawnContainer('add', item.index)}
                              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/10 hover:border-rose-500/30 text-rose-400 transition-all"
                              title="Delete entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Render Override Entries */}
                    {overrideSpawnContainersList.map((item) => {
                      const dino = allCreatures.find(cr => cr.className === item.dinoClass);
                      return (
                        <div key={`override-${item.index}`} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/60 border border-slate-850 hover:border-slate-800 transition-all duration-300">
                          <div className="flex flex-col min-w-0 gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">OVERRIDE</span>
                              <span className="text-xs font-bold text-amber-500 truncate max-w-[180px]" title={item.containerClass}>
                                {item.containerClass.replace(/_C$/i, '')}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                              <span className="text-xs font-bold text-sky-400 truncate max-w-[180px]">
                                {dino?.name || item.dinoClass.replace(/_Character_BP_C$/i, '')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
                              <span>Entry Name: <strong className="text-slate-350">{item.entryName}</strong></span>
                              <span>Weight: <strong className="text-slate-350">{item.entryWeight.toFixed(2)}</strong></span>
                              <span>Limit: <strong className="text-slate-350">{(item.maxLimit * 100).toFixed(0)}%</strong></span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleEditSpawnContainer('override', item.index, item)}
                              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white transition-all"
                              title="Edit spawn entry"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteSpawnContainer('override', item.index)}
                              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/10 hover:border-rose-500/30 text-rose-400 transition-all"
                              title="Delete entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="xl:col-span-2 flex flex-col bg-slate-950/40 rounded-3xl border border-slate-800/80 overflow-hidden shadow-lg min-h-[480px]">
            
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-2 px-6 py-3.5 bg-slate-950 border-b border-slate-900 text-[10px] font-black text-slate-550 uppercase tracking-wider items-center select-none text-left">
              {activeTab === 'spawn' && (
                <div className="col-span-1 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={filteredCreatures.length > 0 && filteredCreatures.every(c => selectedClasses.has(c.className))}
                    onChange={handleSelectAllFiltered}
                    className="w-3.5 h-3.5 accent-amber-500 rounded border-slate-700 bg-slate-950"
                  />
                </div>
              )}
              <div className={cn(
                activeTab === 'spawn' ? "col-span-3" :
                activeTab === 'multipliers' ? "col-span-4" :
                "col-span-3"
              )}>Creature Name</div>
              <div className="col-span-2">Expansion / Mod</div>
              
              {activeTab === 'spawn' && (
                <>
                  <div className="col-span-1 text-center">Spawn</div>
                  <div className="col-span-1 text-center">Tame</div>
                  <div className="col-span-1 text-center">Breed</div>
                  <div className="col-span-3">Replace With</div>
                </>
              )}
              {activeTab === 'multipliers' && (
                <>
                  <div className="col-span-2 text-center">Spawn Weight</div>
                  <div className="col-span-2 text-center">Spawn Limit %</div>
                  <div className="col-span-2 text-center">Override</div>
                </>
              )}
              {['tamed_damage', 'tamed_resistance', 'wild_damage', 'wild_resistance'].includes(activeTab) && (
                <div className="col-span-7 text-right pr-6">Multiplier Value</div>
              )}
            </div>

            {/* Virtualized Rows Container */}
            <div 
              ref={containerRef}
              onScroll={onScroll}
              className="flex-1 overflow-y-auto min-h-[350px] max-h-[500px] relative custom-scrollbar bg-slate-950/20"
            >
              {filteredCreatures.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-slate-500 gap-2">
                  <Info className="w-8 h-8 text-slate-750" />
                  <span className="text-xs font-bold">No creatures found</span>
                  <span className="text-[10px] text-slate-650">Try adjusting your filters or search query</span>
                </div>
              ) : (
                <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
                  {visibleItems.map(({ item: c, style, index }) => {
                    const isSelected = selectedClasses.has(c.className);
                    return (
                      <div
                        key={c.className}
                        style={style}
                        onClick={() => setSelectedCreature(c)}
                        className={cn(
                          "grid grid-cols-12 gap-2 px-6 py-2.5 items-center border-b border-slate-900/50 hover:bg-slate-900/20 transition-all cursor-pointer",
                          index % 2 === 0 ? "bg-slate-950/10" : "bg-transparent",
                          selectedCreature?.className === c.className ? "bg-amber-500/5 border-l-2 border-l-amber-500" : ""
                        )}
                      >
                        {/* Checkbox selector column */}
                        {activeTab === 'spawn' && (
                          <div className="col-span-1 flex items-center justify-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleRowSelect(c.className)}
                              className="w-3.5 h-3.5 accent-amber-500 rounded border-slate-700 bg-slate-950"
                            />
                          </div>
                        )}

                        {/* Icon & Name */}
                        <div className={cn(
                          "flex items-center gap-3 text-left",
                          activeTab === 'spawn' ? "col-span-3" :
                          activeTab === 'multipliers' ? "col-span-4" :
                          "col-span-3"
                        )}>
                          {/* Placeholder Icon with letter and random gradient */}
                          <div className={cn(
                            "w-8 h-8 rounded-full border border-white/5 shadow-inner flex items-center justify-center text-[10px] font-black text-white shrink-0 select-none uppercase",
                            c.isTek ? "bg-gradient-to-br from-cyan-600 to-blue-800" :
                            c.isAberrant ? "bg-gradient-to-br from-purple-600 to-indigo-800" :
                            c.isCorrupted ? "bg-gradient-to-br from-red-600 to-orange-850" :
                            "bg-gradient-to-br from-slate-750 to-slate-900"
                          )}>
                            {c.name.substring(0, 2)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-slate-100 truncate">{c.name}</span>
                            <span className="text-[9px] font-mono text-slate-500 truncate" title={c.className}>{c.className}</span>
                          </div>
                        </div>

                        {/* Expansion Badge */}
                        <div className="col-span-2 text-left">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border border-white/5",
                            c.expansion === 'The Island' ? "bg-emerald-500/10 text-emerald-400" :
                            c.expansion === 'Custom Mod' || c.expansion === 'Custom Added' ? "bg-purple-500/10 text-purple-400" :
                            "bg-amber-500/10 text-amber-400"
                          )}>
                            {c.expansion.replace('Genesis ', 'Gen ')}
                          </span>
                        </div>

                        {/* SPAWN TAB COLUMNS */}
                        {activeTab === 'spawn' && (
                          <>
                            <div className="col-span-1 flex justify-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={!excludedSpawns.has(cleanClassName(c.className))}
                                onChange={e => toggleSpawnable(c.className, e.target.checked)}
                                className="w-3.5 h-3.5 accent-emerald-500 rounded border-slate-700 bg-slate-950"
                              />
                            </div>
                            <div className="col-span-1 flex justify-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={!preventedTaming.has(cleanClassName(c.className))}
                                onChange={e => toggleTameable(c.className, e.target.checked)}
                                className="w-3.5 h-3.5 accent-sky-500 rounded border-slate-700 bg-slate-950"
                              />
                            </div>
                            <div className="col-span-1 flex justify-center">
                              <span className={c.breedable ? "text-rose-400 font-extrabold text-[10px]" : "text-slate-600 text-[10px]"}>
                                {c.breedable ? 'YES' : 'NO'}
                              </span>
                            </div>
                            <div className="col-span-3 flex items-center pr-2" onClick={e => e.stopPropagation()}>
                              <select
                                value={activeReplacementsMap.get(c.className) || '__none__'}
                                onChange={e => setReplacement(c.className, e.target.value)}
                                className="w-full bg-slate-950 border border-slate-900 rounded-lg py-1 px-2 text-[10px] font-bold text-slate-350 focus:outline-none focus:border-amber-500/50"
                              >
                                <option value="__none__">No Replacement</option>
                                <option value="__disabled__">Disabled (Remove Spawns)</option>
                                {allCreatures
                                  .filter(other => other.className !== c.className)
                                  .map(other => (
                                    <option key={other.className} value={other.className}>Replace with {other.name}</option>
                                  ))}
                              </select>
                            </div>
                          </>
                        )}

                      {/* MULTIPLIERS TAB COLUMNS */}
                      {activeTab === 'multipliers' && (
                        <>
                          <div className="col-span-2 flex items-center gap-1.5 px-1 justify-center">
                            <input
                              type="number"
                              step="0.01"
                              value={spawnMultipliersMap.get(c.tag)?.weight ?? 1.0}
                              onChange={e => {
                                const weightVal = parseFloat(e.target.value) || 0;
                                const parsedObj = spawnMultipliersMap.get(c.tag) || { tag: c.tag, weight: 1.0, limit: 1.0, override: false };
                                setSpawnWeightOverride(c.tag, weightVal, parsedObj.limit, parsedObj.override);
                              }}
                              className="w-16 bg-slate-950 border border-slate-800 text-center text-xs font-bold text-slate-300 rounded-lg py-0.5"
                            />
                          </div>

                          <div className="col-span-2 flex items-center gap-1.5 px-1 justify-center">
                            <input
                              type="number"
                              step="0.01"
                              value={spawnMultipliersMap.get(c.tag)?.limit ?? 1.0}
                              onChange={e => {
                                const limitVal = parseFloat(e.target.value) || 0;
                                const parsedObj = spawnMultipliersMap.get(c.tag) || { tag: c.tag, weight: 1.0, limit: 1.0, override: false };
                                setSpawnWeightOverride(c.tag, parsedObj.weight, limitVal, parsedObj.override);
                              }}
                              className="w-16 bg-slate-950 border border-slate-800 text-center text-xs font-bold text-slate-300 rounded-lg py-0.5"
                            />
                          </div>

                          <div className="col-span-2 flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={spawnMultipliersMap.get(c.tag)?.override ?? false}
                              onChange={e => {
                                const overrideVal = e.target.checked;
                                const parsedObj = spawnMultipliersMap.get(c.tag) || { tag: c.tag, weight: 1.0, limit: 1.0, override: false };
                                setSpawnWeightOverride(c.tag, parsedObj.weight, parsedObj.limit, overrideVal);
                              }}
                              className="w-4 h-4 accent-amber-500 rounded border-slate-700 bg-slate-950"
                            />
                          </div>
                        </>
                      )}

                      {/* DAMAGE/RESISTANCE TABS COLUMNS */}
                      {['tamed_damage', 'tamed_resistance', 'wild_damage', 'wild_resistance'].includes(activeTab) && (
                        (() => {
                          const configKey = 
                            activeTab === 'tamed_damage' ? 'tamedDinoClassDamageMultipliers' :
                            activeTab === 'tamed_resistance' ? 'tamedDinoClassResistanceMultipliers' :
                            activeTab === 'wild_damage' ? 'dinoClassDamageMultipliers' :
                            'dinoClassResistanceMultipliers';
                          
                          const targetMap = 
                            activeTab === 'tamed_damage' ? tamedDamageMap :
                            activeTab === 'tamed_resistance' ? tamedResistanceMap :
                            activeTab === 'wild_damage' ? wildDamageMap :
                            wildResistanceMap;
                          
                          const val = targetMap.get(c.className) ?? 1.0;

                          return (
                            <div className="col-span-7 flex items-center justify-end gap-3 pr-4">
                              <input
                                type="range"
                                min="0.0"
                                max="5.0"
                                step="0.05"
                                value={val}
                                onChange={e => setClassMultiplierValue(c.className, parseFloat(e.target.value), configKey)}
                                className="w-28 accent-amber-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                              />
                              <input
                                type="number"
                                step="0.1"
                                min="0.0"
                                value={val}
                                onChange={e => setClassMultiplierValue(c.className, parseFloat(e.target.value) || 0, configKey)}
                                className="w-16 bg-slate-950 border border-slate-800 text-center text-xs font-bold text-slate-350 rounded-lg py-0.5 focus:border-amber-500/50 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={val === 1.0}
                                onClick={() => setClassMultiplierValue(c.className, 1.0, configKey)}
                                className="text-[10px] text-slate-500 hover:text-rose-400 font-black disabled:opacity-30 disabled:hover:text-slate-500 px-1 uppercase"
                              >
                                Reset
                              </button>
                            </div>
                          );
                        })()
                      )}

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer of Table */}
          <div className="px-6 py-3 bg-slate-950 border-t border-slate-900 flex justify-between items-center text-[10px] font-bold text-slate-500 select-none uppercase">
            <div>
              Showing {filteredCreatures.length} of {allCreatures.length} Creatures
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
              <span>Dino Configs Active</span>
            </div>
          </div>
        </div>
        )}

        {/* Side Panels: Info & Replacement Details */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          
          {activeTab === 'spawn_containers' ? (
            <div className="bg-slate-950/40 rounded-3xl border border-slate-800/80 p-5 shadow-lg flex flex-col gap-4 text-left animate-fadeIn">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center justify-between pb-2.5 border-b border-white/5">
                <span>Spawn Containers Help</span>
                <span className="text-[9px] bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20 px-2 py-0.5 rounded-full">Guides</span>
              </h3>
              <div className="text-xs font-medium text-slate-450 space-y-3.5 leading-relaxed">
                <p>
                  <strong className="text-slate-200">ConfigAddNPCSpawnEntriesContainer</strong> appends new dinosaur spawn rules to the existing entries of a spawn container.
                </p>
                <p>
                  <strong className="text-slate-200">ConfigOverrideNPCSpawnEntriesContainer</strong> completely clears the spawn container and sets only your custom entries as the spawning creatures.
                </p>
                <p>
                  <strong className="text-slate-200">Entry Weight</strong>: Higher values make this creature spawn more frequently relative to other creatures in the same container.
                </p>
                <p>
                  <strong className="text-slate-200 font-bold">Spawn Limit</strong>: The maximum percentage of the total spawns in the container that can be of this creature class (e.g. 0.10 means max 10% of the area's spawns will be this dino).
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Replacement Rules Summary Panel */}
              <div className="bg-slate-950/40 rounded-3xl border border-slate-800/80 p-5 shadow-lg flex flex-col gap-4 text-left">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center justify-between pb-2.5 border-b border-white/5">
              <span>Active Replacements ({activeReplacementsMap.size})</span>
              <span className="text-[9px] bg-purple-500/10 text-purple-400 font-bold border border-purple-500/20 px-2 py-0.5 rounded-full">Game.ini</span>
            </h3>
            
            {activeReplacementsMap.size === 0 ? (
              <div className="text-slate-500 text-xs italic py-6 text-center">
                No active replacements or overrides configured.
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                {Array.from(activeReplacementsMap.entries()).map(([fromClass, toClass]) => {
                  const fromDino = allCreatures.find(cr => cr.className === fromClass);
                  const toDino = allCreatures.find(cr => cr.className === toClass);
                  
                  return (
                    <div key={fromClass} className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-850 hover:border-slate-800 transition-all duration-300">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <span className="truncate max-w-[100px] text-amber-500">{fromDino?.name || fromClass.replace(/_Character_BP_C$/i, '')}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate max-w-[100px] text-sky-400">
                            {(toClass === 'Disabled' || toClass === '') ? <strong className="text-rose-500">Disabled</strong> : (toDino?.name || toClass.replace(/_Character_BP_C$/i, ''))}
                          </span>
                        </div>
                        <span className="text-[8px] font-mono text-slate-650 truncate mt-0.5">{fromClass}</span>
                      </div>
                      <button
                        onClick={() => setReplacement(fromClass, '')}
                        className="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/10 hover:border-rose-500/30 text-rose-400 transition-all"
                        title="Remove replacement override"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Creature Info Detail Panel */}
          {selectedCreature ? (
            <div className="bg-slate-950/40 rounded-3xl border border-amber-500/25 p-5 shadow-lg flex flex-col gap-4 text-left animate-slideIn">
              <div className="flex items-start justify-between pb-2 border-b border-white/5">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    {selectedCreature.name}
                  </h3>
                  <span className="text-[8px] font-mono text-slate-500 block mt-0.5">{selectedCreature.className}</span>
                </div>
                <button
                  onClick={() => setSelectedCreature(null)}
                  className="p-1 text-slate-500 hover:text-white hover:bg-slate-900 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stats & Properties */}
              <div className="grid grid-cols-2 gap-2.5 text-[10px] font-semibold text-slate-400">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-550 block mb-0.5">Expansion</span>
                  <strong className="text-slate-200">{selectedCreature.expansion}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-550 block mb-0.5">Dino Tag</span>
                  <strong className="text-slate-200 font-mono">{selectedCreature.tag}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-550 block mb-0.5">Diet</span>
                  <strong className="text-slate-200">{selectedCreature.diet || 'Omnivore'}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900/80">
                  <span className="text-[9px] uppercase tracking-wider text-slate-550 block mb-0.5">Aggression</span>
                  <strong className="text-slate-200">{selectedCreature.aggression || 'Neutral'}</strong>
                </div>
              </div>

              {/* Behavior Flags List */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Flyer', active: selectedCreature.isFlyer },
                  { label: 'Water', active: selectedCreature.isWater },
                  { label: 'Boss', active: selectedCreature.isBoss },
                  { label: 'Tek Variant', active: selectedCreature.isTek },
                  { label: 'Aberrant', active: selectedCreature.isAberrant },
                  { label: 'Corrupted', active: selectedCreature.isCorrupted },
                  { label: 'X-Variant', active: selectedCreature.isXVariant },
                  { label: 'R-Variant', active: selectedCreature.isRVariant },
                  { label: 'Breedable', active: selectedCreature.breedable }
                ]
                  .filter(f => f.active)
                  .map(f => (
                    <span key={f.label} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[8px] font-bold uppercase tracking-wider text-amber-400">
                      {f.label}
                    </span>
                  ))}
              </div>

              {/* Spawn Multiplier Override Status */}
              <div className="text-xs text-slate-400 bg-slate-950/30 p-3 rounded-2xl border border-slate-900 flex flex-col gap-1">
                <span className="text-[9px] font-black text-slate-550 uppercase tracking-widest">Active Overrides</span>
                <div className="flex justify-between items-center text-[10px] mt-1">
                  <span>Excluded From Spawning:</span>
                  <strong className={excludedSpawns.has(selectedCreature.className) ? "text-rose-400" : "text-emerald-400"}>
                    {excludedSpawns.has(selectedCreature.className) ? "Yes" : "No"}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span>Taming Disabled:</span>
                  <strong className={preventedTaming.has(selectedCreature.className) ? "text-rose-400" : "text-emerald-400"}>
                    {preventedTaming.has(selectedCreature.className) ? "Yes" : "No"}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span>Custom Spawn Multiplier:</span>
                  <strong className={spawnMultipliersMap.has(selectedCreature.tag) ? "text-amber-400" : "text-slate-500"}>
                    {spawnMultipliersMap.has(selectedCreature.tag) ? "Yes" : "No (Default)"}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/20 rounded-3xl border border-slate-850 p-6 flex flex-col items-center justify-center text-center gap-2.5 h-[230px] border-dashed">
              <Info className="w-7 h-7 text-slate-600" />
              <div className="text-xs font-bold text-slate-400">Select a creature</div>
              <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed">
                Click any creature row to view detailed class properties, variants, biomes, and override status.
              </p>
            </div>
          )}
          </>
          )}
        </div>

      </div>

      {/* Custom Creature Creation Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-md p-6 flex flex-col gap-4 text-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Add Custom Modded Creature</h3>
              <button onClick={() => setIsCustomModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500">Creature Name</label>
                <input
                  type="text"
                  placeholder="e.g. Modded Raptor"
                  value={newCustomName}
                  onChange={e => setNewCustomName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500">Blueprint Class Name</label>
                <input
                  type="text"
                  placeholder="e.g. CustomRaptor_Character_BP_C"
                  value={newCustomClass}
                  onChange={e => setNewCustomClass(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500">Dino Name Tag (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. CustomRaptor"
                  value={newCustomTag}
                  onChange={e => setNewCustomTag(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase text-slate-500">Mod Source Name</label>
                <input
                  type="text"
                  placeholder="e.g. Primal Fear"
                  value={newCustomMod}
                  onChange={e => setNewCustomMod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-4 pt-3 border-t border-white/5">
              <button
                onClick={() => setIsCustomModalOpen(false)}
                className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomCreature}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-400 hover:to-orange-400 rounded-xl text-xs font-extrabold transition-all"
              >
                Add Creature
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Config Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-lg p-6 flex flex-col gap-4 text-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Import Creature Configs</h3>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase text-slate-500">Paste JSON Configuration String</label>
              <textarea
                rows={10}
                placeholder='{ "excludeDinoClasses": [...], "preventDinoTameClassNames": [...] }'
                value={importString}
                onChange={e => setImportString(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500/50 resize-none shadow-inner"
              />
            </div>

            <div className="flex justify-end gap-2.5 mt-2 pt-3 border-t border-white/5">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfig}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-400 hover:to-orange-400 rounded-xl text-xs font-extrabold transition-all"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
