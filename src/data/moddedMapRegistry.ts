export interface ModdedMapPreset {
  id: string;                    // Unique key (e.g. 'ase_island_reforged')
  serverType: 'ASE' | 'ASA';
  name: string;                  // "The Island Reforged"
  author: string;                // "Nekatus"
  description: string;
  icon: string;                  // Emoji icon
  color: string;                 // Theme color hex
  mapArgument: string;           // The map name for server args (e.g. 'TheIsland' for ASE, 'ScorchedEarthRM_WP' for ASA)
  mapModId?: string;             // Workshop/CurseForge mod ID (e.g. '1460513')
  requiredMods?: string[];       // Mod IDs that must be in -mods= arg
  additionalArgs?: string[];     // Any other required launch args
  dlcType: string;               // 'Workshop Mod' | 'CurseForge Mod' etc.
  size: string;
}

export const MODDED_MAP_PRESETS: ModdedMapPreset[] = [
  {
    id: 'ase_island_reforged',
    serverType: 'ASE',
    name: 'The Island Reforged',
    author: 'Nekatus',
    description: 'An updated, beautiful and expanded version of the classic Island map by Nekatus for ASE.',
    icon: '🏝️',
    color: '#10b981',
    mapArgument: 'TheIsland',
    mapModId: '1460513',
    dlcType: 'Workshop Mod',
    size: 'Large (~8 GB)'
  },
  {
    id: 'asa_scorched_reborn',
    serverType: 'ASA',
    name: 'Scorched Earth Reborn',
    author: 'armangamer & tweee',
    description: 'Modded expansion of the Scorched Earth desert with custom biomes and expansions.',
    icon: '🔥',
    color: '#f97316',
    mapArgument: 'ScorchedEarthRM_WP',
    mapModId: '1465909',
    dlcType: 'Modded Expansion',
    size: 'Large (~6 GB)'
  },
  {
    id: 'asa_island_reforged',
    serverType: 'ASA',
    name: 'The Island Reforged',
    author: 'Nekatus',
    description: 'An updated, beautiful and expanded version of the classic Island map by Nekatus for ASA.',
    icon: '🏝️',
    color: '#10b981',
    mapArgument: 'TheIsland',
    mapModId: '1460513',
    dlcType: 'CurseForge Mod',
    size: 'Large (~8 GB)'
  },
  {
    id: 'asa_bjarnheim',
    serverType: 'ASA',
    name: 'Bjarnheim',
    author: 'Nekatus',
    description: 'A 144km² Nordic fantasy map by Nekatus inspired by Skyrim, featuring harsh snowy biomes, Fimbulwinter, custom bosses (Duneyrr), merchant NPCs, and wild Griffin nests.',
    icon: '❄️',
    color: '#38bdf8',
    mapArgument: 'Bjarnheim_WP',
    mapModId: '1376189',
    dlcType: 'CurseForge Mod',
    size: 'Large (~12 GB)'
  },
  {
    id: 'asa_svartalfheim',
    serverType: 'ASA',
    name: 'Svartalfheim',
    author: 'Nekatus',
    description: 'Dwarven realm inspired premium mod map featuring custom dwarven creatures, gold mining, and rich ruins.',
    icon: '⛰️',
    color: '#0284c7',
    mapArgument: 'Svartalfheim_WP',
    mapModId: '928623',
    dlcType: 'CurseForge Mod',
    size: 'Large (~10 GB)'
  },
  {
    id: 'asa_amissa',
    serverType: 'ASA',
    name: 'Amissa',
    author: 'Sicco0803',
    description: 'Lush tropical and temperate mod map featuring ancient overgrown ruins, custom caves, and scenic vistas.',
    icon: '🍃',
    color: '#16a34a',
    mapArgument: 'Amissa_WP',
    mapModId: '940428',
    dlcType: 'CurseForge Mod',
    size: 'Large (~9 GB)'
  },
  {
    id: 'asa_insaluna',
    serverType: 'ASA',
    name: 'Insaluna',
    author: 'CyrusCreates',
    description: 'Lunar and extraterrestrial themed mod map featuring low-gravity regions and bioluminescent caves.',
    icon: '🌙',
    color: '#818cf8',
    mapArgument: 'Insaluna_WP',
    mapModId: '954203',
    dlcType: 'CurseForge Mod',
    size: 'Large (~7 GB)'
  },
  {
    id: 'asa_forglar',
    serverType: 'ASA',
    name: 'Forglar',
    author: 'TheRealGiga',
    description: 'Massive fantasy RPG mod map with diverse biomes, dungeons, and unique magical aesthetics.',
    icon: '🌲',
    color: '#059669',
    mapArgument: 'Forglar_WP',
    mapModId: '947113',
    dlcType: 'CurseForge Mod',
    size: 'Large (~11 GB)'
  },
  {
    id: 'asa_astraeos',
    serverType: 'ASA',
    name: 'Astraeos',
    author: 'SNOW',
    description: 'Expansive high-fantasy map with floating islands, mystical groves, and unique elemental creatures.',
    icon: '✨',
    color: '#6366f1',
    mapArgument: 'Astraeos_WP',
    mapModId: '960144',
    dlcType: 'CurseForge Mod',
    size: 'Large (~12 GB)'
  },
  {
    id: 'asa_temptress',
    serverType: 'ASA',
    name: 'Temptress Lagoon',
    author: 'Mave',
    description: 'Vibrant oceanic and tropical island paradise with vast coral reefs and sunken shipwrecks.',
    icon: '🏝️',
    color: '#0ea5e9',
    mapArgument: 'TemptressLagoon_WP',
    mapModId: '963842',
    dlcType: 'CurseForge Mod',
    size: 'Large (~8 GB)'
  },
  {
    id: 'asa_reverence',
    serverType: 'ASA',
    name: 'Reverence',
    author: 'Veritas',
    description: 'Ancient greco-roman monumental map with grand aqueducts, marble temples, and mythical challenges.',
    icon: '🏛️',
    color: '#d97706',
    mapArgument: 'Reverence_WP',
    mapModId: '973412',
    dlcType: 'CurseForge Mod',
    size: 'Large (~8 GB)'
  },
  {
    id: 'asa_lost_colony',
    serverType: 'ASA',
    name: 'Lost Colony',
    author: 'Nekatus',
    description: 'Futuristic sci-fi wasteland map featuring overgrown colonies, subterranean vaults, and bio-domes.',
    icon: '🌌',
    color: '#8b5cf6',
    mapArgument: 'LostColony_WP',
    mapModId: '982315',
    dlcType: 'CurseForge Mod',
    size: 'Large (~14 GB)'
  },
  {
    id: 'asa_club_ark',
    serverType: 'ASA',
    name: 'Club ARK',
    author: 'Studio Wildcard',
    description: 'Official social hub and minigame resort map.',
    icon: '🎰',
    color: '#ec4899',
    mapArgument: 'ClubARK_WP',
    mapModId: '980421',
    dlcType: 'CurseForge Mod',
    size: 'Small (~2 GB)'
  },
  {
    id: 'asa_althemia',
    serverType: 'ASA',
    name: 'ALTHEMIA',
    author: 'Sandik',
    description: 'Ancient magical realm featuring floating obelisks, crystal caverns, and custom creatures.',
    icon: '🔮',
    color: '#a855f7',
    mapArgument: 'Althemia_WP',
    mapModId: '952873',
    dlcType: 'CurseForge Mod',
    size: 'Large (~9 GB)'
  },
  {
    id: 'asa_tharat',
    serverType: 'ASA',
    name: 'THARAT',
    author: 'TharatTeam',
    description: 'Lore-rich ancient civilization world with colossal pyramids, sunken temples, and custom ruins.',
    icon: '🏛️',
    color: '#eab308',
    mapArgument: 'Tharat_WP',
    mapModId: '953158',
    dlcType: 'CurseForge Mod',
    size: 'Large (~10 GB)'
  }
];

export const ASA_MODDED_MAP_PRESETS: ModdedMapPreset[] = MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASA');
export const ASE_MODDED_MAP_PRESETS: ModdedMapPreset[] = MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASE');

export function getModdedMapPreset(id: string): ModdedMapPreset | undefined {
  return MODDED_MAP_PRESETS.find(p => p.id === id);
}

export function getModdedMapsByServerType(type: 'ASE' | 'ASA'): ModdedMapPreset[] {
  return MODDED_MAP_PRESETS.filter(p => p.serverType === type);
}

export function getModdedMapByMapArg(arg: string, type: 'ASE' | 'ASA'): ModdedMapPreset | undefined {
  return MODDED_MAP_PRESETS.find(p => p.mapArgument === arg && p.serverType === type);
}

export function getModdedMapByModId(modId: string, type: 'ASE' | 'ASA'): ModdedMapPreset | undefined {
  return MODDED_MAP_PRESETS.find(p => p.mapModId === modId && p.serverType === type);
}

export function getModdedMapDisplayName(mapArg: string, type: 'ASE' | 'ASA'): string {
  const preset = getModdedMapByMapArg(mapArg, type);
  return preset ? preset.name : mapArg;
}

/**
 * Detect if an installed mod is likely a map
 */
export function isModLikelyMap(mod: { id?: string; name: string; description?: string }): boolean {
  if (!mod.name) return false;
  // Match known presets
  if (mod.id && MODDED_MAP_PRESETS.some(p => p.mapModId === String(mod.id))) return true;
  if (MODDED_MAP_PRESETS.some(p => p.name.toLowerCase() === mod.name.toLowerCase())) return true;
  
  const text = `${mod.name} ${mod.description || ''}`.toLowerCase();
  // Name or description explicitly mentions map, expansion, _wp, etc.
  if (/\b(map|custom map|mod map|_wp)\b/i.test(text)) return true;
  if (mod.name.includes('_WP') || mod.name.endsWith('_WP')) return true;
  return false;
}

/**
 * Detect or generate the mapArgument launch parameter from an installed mod
 */
export function detectMapArgumentFromMod(mod: { id?: string; name: string; description?: string }): string {
  // 1. Check known presets by mod ID
  if (mod.id) {
    const byId = MODDED_MAP_PRESETS.find(p => p.mapModId === String(mod.id));
    if (byId) return byId.mapArgument;
  }
  // 2. Check known presets by name
  const byName = MODDED_MAP_PRESETS.find(p => p.name.toLowerCase() === mod.name.toLowerCase());
  if (byName) return byName.mapArgument;

  // 3. Look for an explicit map argument pattern in description or name (e.g. ScorchedEarthRM_WP, Amissa_WP)
  const wpMatch = `${mod.name} ${mod.description || ''}`.match(/\b([A-Za-z0-9_]+_WP)\b/);
  if (wpMatch) return wpMatch[1];

  // 4. If mod name already has _WP, return sanitized
  if (mod.name.includes('_WP')) {
    return mod.name.replace(/[^A-Za-z0-9_]/g, '');
  }

  // 5. Default heuristic: sanitized name + _WP
  const sanitized = mod.name.replace(/[^A-Za-z0-9]/g, '');
  return `${sanitized}_WP`;
}

export function buildLaunchArgs(preset: ModdedMapPreset | { mapModId?: string }, currentArgs = ''): string {
  let args = currentArgs.trim();
  const modId = preset.mapModId;
  if (!modId || modId === '') return args;

  const mapModIdRegex = /-MapModID=([^\s]+)/i;
  const modsRegex = /-mods=([^\s]+)/i;

  // Update or insert -MapModID
  if (mapModIdRegex.test(args)) {
    args = args.replace(mapModIdRegex, `-MapModID=${modId}`);
  } else {
    args = args ? `${args} -MapModID=${modId}` : `-MapModID=${modId}`;
  }

  // Update or insert -mods
  const matchMods = args.match(modsRegex);
  if (matchMods) {
    const existingMods = matchMods[1].split(',');
    if (!existingMods.includes(modId)) {
      existingMods.push(modId);
    }
    args = args.replace(modsRegex, `-mods=${existingMods.join(',')}`);
  } else {
    args = `${args} -mods=${modId}`;
  }

  return args;
}
