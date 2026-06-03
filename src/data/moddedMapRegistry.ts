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
  }
];

export function getModdedMapPreset(id: string): ModdedMapPreset | undefined {
  return MODDED_MAP_PRESETS.find(p => p.id === id);
}

export function getModdedMapsByServerType(type: 'ASE' | 'ASA'): ModdedMapPreset[] {
  return MODDED_MAP_PRESETS.filter(p => p.serverType === type);
}

export function getModdedMapByMapArg(arg: string, type: 'ASE' | 'ASA'): ModdedMapPreset | undefined {
  return MODDED_MAP_PRESETS.find(p => p.mapArgument === arg && p.serverType === type);
}

export function getModdedMapDisplayName(mapArg: string, type: 'ASE' | 'ASA'): string {
  const preset = getModdedMapByMapArg(mapArg, type);
  return preset ? preset.name : mapArg;
}

export function buildLaunchArgs(preset: ModdedMapPreset, currentArgs = ''): string {
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
