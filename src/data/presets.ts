// Preset configurations for quick server setup
export interface ConfigPreset {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    settings: {
        GameUserSettings: Record<string, string>;
        Game: Record<string, string>;
    };
}

export const PRESETS: ConfigPreset[] = [
    {
        id: 'official',
        name: 'Official',
        description: 'Vanilla ARK settings (1x rates)',
        icon: '⚖️',
        color: 'from-slate-500 to-slate-600',
        settings: {
            GameUserSettings: {
                'XPMultiplier': '1',
                'TamingSpeedMultiplier': '1',
                'HarvestAmountMultiplier': '1',
                'HarvestHealthMultiplier': '1',
                'DayTimeSpeedScale': '1',
                'NightTimeSpeedScale': '1',
                'DinoDamageMultiplier': '1',
                'PlayerDamageMultiplier': '1',
                'StructureDamageMultiplier': '1',
                'PlayerResistanceMultiplier': '1',
                'DinoResistanceMultiplier': '1',
                'ResourcesRespawnPeriodMultiplier': '1'
            },
            Game: {
                'EggHatchSpeedMultiplier': '1',
                'BabyMatureSpeedMultiplier': '1',
                'MatingIntervalMultiplier': '1',
                'KillXPMultiplier': '1',
                'HarvestXPMultiplier': '1',
                'CraftXPMultiplier': '1',
                'GenericXPMultiplier': '1',
                'GlobalSpoilingTimeMultiplier': '1',
                'CropGrowthSpeedMultiplier': '1'
            }
        }
    },
    {
        id: 'boosted_2x',
        name: 'Boosted 2x',
        description: 'Slightly faster progression (2x rates)',
        icon: '⚡',
        color: 'from-blue-500 to-cyan-500',
        settings: {
            GameUserSettings: {
                'XPMultiplier': '2',
                'TamingSpeedMultiplier': '2',
                'HarvestAmountMultiplier': '2',
                'HarvestHealthMultiplier': '2',
                'DayTimeSpeedScale': '1',
                'NightTimeSpeedScale': '2',
                'ResourcesRespawnPeriodMultiplier': '0.5'
            },
            Game: {
                'EggHatchSpeedMultiplier': '2',
                'BabyMatureSpeedMultiplier': '2',
                'MatingIntervalMultiplier': '0.5',
                'KillXPMultiplier': '2',
                'HarvestXPMultiplier': '2',
                'CraftXPMultiplier': '2',
                'GenericXPMultiplier': '2',
                'GlobalSpoilingTimeMultiplier': '2',
                'CropGrowthSpeedMultiplier': '2'
            }
        }
    },
    {
        id: 'boosted_5x',
        name: 'Boosted 5x',
        description: 'Fast-paced gameplay (5x rates)',
        icon: '🚀',
        color: 'from-purple-500 to-pink-500',
        settings: {
            GameUserSettings: {
                'XPMultiplier': '5',
                'TamingSpeedMultiplier': '5',
                'HarvestAmountMultiplier': '5',
                'HarvestHealthMultiplier': '5',
                'DayTimeSpeedScale': '1',
                'NightTimeSpeedScale': '3',
                'ResourcesRespawnPeriodMultiplier': '0.3'
            },
            Game: {
                'EggHatchSpeedMultiplier': '5',
                'BabyMatureSpeedMultiplier': '5',
                'MatingIntervalMultiplier': '0.2',
                'KillXPMultiplier': '5',
                'HarvestXPMultiplier': '5',
                'CraftXPMultiplier': '5',
                'GenericXPMultiplier': '5',
                'GlobalSpoilingTimeMultiplier': '3',
                'CropGrowthSpeedMultiplier': '5'
            }
        }
    },
    {
        id: 'boosted_10x',
        name: 'Boosted 10x',
        description: 'Ultra-fast progression (10x rates)',
        icon: '⚡',
        color: 'from-orange-500 to-red-500',
        settings: {
            GameUserSettings: {
                'XPMultiplier': '10',
                'TamingSpeedMultiplier': '10',
                'HarvestAmountMultiplier': '10',
                'HarvestHealthMultiplier': '10',
                'DayTimeSpeedScale': '1',
                'NightTimeSpeedScale': '5',
                'ResourcesRespawnPeriodMultiplier': '0.1'
            },
            Game: {
                'EggHatchSpeedMultiplier': '10',
                'BabyMatureSpeedMultiplier': '10',
                'MatingIntervalMultiplier': '0.1',
                'KillXPMultiplier': '10',
                'HarvestXPMultiplier': '10',
                'CraftXPMultiplier': '10',
                'GenericXPMultiplier': '10',
                'GlobalSpoilingTimeMultiplier': '5',
                'CropGrowthSpeedMultiplier': '10'
            }
        }
    },
    {
        id: 'pvp_balanced',
        name: 'PvP Balanced',
        description: 'Balanced rates for competitive PvP',
        icon: '⚔️',
        color: 'from-red-500 to-orange-500',
        settings: {
            GameUserSettings: {
                'XPMultiplier': '3',
                'TamingSpeedMultiplier': '3',
                'HarvestAmountMultiplier': '3',
                'HarvestHealthMultiplier': '2',
                'DayTimeSpeedScale': '1',
                'NightTimeSpeedScale': '2',
                'DinoDamageMultiplier': '1',
                'PlayerDamageMultiplier': '1',
                'StructureDamageMultiplier': '1',
                'ResourcesRespawnPeriodMultiplier': '0.5',
                'AllowHitMarkers': 'True',
                'EnablePvPGamma': 'False'
            },
            Game: {
                'EggHatchSpeedMultiplier': '3',
                'BabyMatureSpeedMultiplier': '3',
                'MatingIntervalMultiplier': '0.3',
                'KillXPMultiplier': '3',
                'HarvestXPMultiplier': '3',
                'CraftXPMultiplier': '3',
                'GenericXPMultiplier': '3'
            }
        }
    },
    {
        id: 'pve_casual',
        name: 'PvE Casual',
        description: 'Relaxed PvE with quality of life features',
        icon: '🏡',
        color: 'from-green-500 to-emerald-500',
        settings: {
            GameUserSettings: {
                'XPMultiplier': '3',
                'TamingSpeedMultiplier': '5',
                'HarvestAmountMultiplier': '3',
                'HarvestHealthMultiplier': '3',
                'DayTimeSpeedScale': '1',
                'NightTimeSpeedScale': '2',
                'DisableStructureDecayPvE': 'True',
                'DisableDinoDecayPvE': 'True',
                'AlwaysAllowStructurePickup': 'True',
                'AllowIntegratedSPlusStructures': 'True',
                'ResourcesRespawnPeriodMultiplier': '0.5'
            },
            Game: {
                'EggHatchSpeedMultiplier': '5',
                'BabyMatureSpeedMultiplier': '5',
                'MatingIntervalMultiplier': '0.2',
                'KillXPMultiplier': '3',
                'HarvestXPMultiplier': '3',
                'CraftXPMultiplier': '3',
                'GenericXPMultiplier': '3',
                'GlobalSpoilingTimeMultiplier': '2',
                'CropGrowthSpeedMultiplier': '3',
                'bAllowUnlimitedRespecs': 'True'
            }
        }
    }
];

// Helper to apply preset to current config
export function applyPreset(
    preset: ConfigPreset,
    currentConfigs: {
        GameUserSettings: Map<string, Map<string, string>>,
        Game: Map<string, Map<string, string>>
    }
): {
    GameUserSettings: Map<string, Map<string, string>>,
    Game: Map<string, Map<string, string>>
} {
    const newConfigs = {
        GameUserSettings: new Map(currentConfigs.GameUserSettings),
        Game: new Map(currentConfigs.Game)
    };

    // Apply GameUserSettings changes
    Object.entries(preset.settings.GameUserSettings).forEach(([key, value]) => {
        const section = 'ServerSettings';
        const sectionMap = new Map(newConfigs.GameUserSettings.get(section) || []);
        sectionMap.set(key, value);
        newConfigs.GameUserSettings.set(section, sectionMap);
    });

    // Apply Game.ini changes
    Object.entries(preset.settings.Game).forEach(([key, value]) => {
        const section = '/Script/ShooterGame.ShooterGameMode';
        const sectionMap = new Map(newConfigs.Game.get(section) || []);
        sectionMap.set(key, value);
        newConfigs.Game.set(section, sectionMap);
    });

    return newConfigs;
}

// ============================================================================
// Custom Preset Management (localStorage)
// ============================================================================

const CUSTOM_PRESETS_KEY = 'ark_sm_custom_presets';
const PRESET_EXPORT_VERSION = 1;

export interface ExportedPreset {
    version: number;
    preset: ConfigPreset;
    exportedAt: string;
    appVersion: string;
}

/** Save a custom preset to localStorage */
export function saveCustomPreset(preset: ConfigPreset): void {
    const existing = getCustomPresets();
    const idx = existing.findIndex(p => p.id === preset.id);
    if (idx >= 0) {
        existing[idx] = preset;
    } else {
        existing.push(preset);
    }
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(existing));
}

/** Load all custom presets from localStorage */
export function getCustomPresets(): ConfigPreset[] {
    try {
        const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as ConfigPreset[];
    } catch {
        return [];
    }
}

/** Delete a custom preset by ID */
export function deleteCustomPreset(presetId: string): void {
    const existing = getCustomPresets();
    const filtered = existing.filter(p => p.id !== presetId);
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(filtered));
}

/** Export current config state as a downloadable JSON preset */
export function exportPresetToJson(preset: ConfigPreset): void {
    const exported: ExportedPreset = {
        version: PRESET_EXPORT_VERSION,
        preset,
        exportedAt: new Date().toISOString(),
        appVersion: '2.4.0',
    };

    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ark-preset-${preset.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Import a preset from a JSON file. Returns the preset or throws. */
export function importPresetFromJson(jsonString: string): ConfigPreset {
    const data = JSON.parse(jsonString);

    // Validate structure
    if (!data.preset || !data.preset.id || !data.preset.name || !data.preset.settings) {
        throw new Error('Invalid preset file: missing required fields (id, name, settings)');
    }

    if (!data.preset.settings.GameUserSettings || !data.preset.settings.Game) {
        throw new Error('Invalid preset file: missing GameUserSettings or Game settings');
    }

    const preset: ConfigPreset = {
        id: `custom_${Date.now()}`,
        name: data.preset.name,
        description: data.preset.description || 'Imported preset',
        icon: data.preset.icon || '📦',
        color: data.preset.color || 'from-slate-500 to-slate-600',
        settings: data.preset.settings,
    };

    return preset;
}

/** Create a preset from current config state */
export function createPresetFromConfig(
    name: string,
    description: string,
    configs: {
        GameUserSettings: Map<string, Map<string, string>>;
        Game: Map<string, Map<string, string>>;
    }
): ConfigPreset {
    const gusSettings: Record<string, string> = {};
    const gameSettings: Record<string, string> = {};

    // Extract ServerSettings from GUS
    const serverSettings = configs.GameUserSettings.get('ServerSettings');
    if (serverSettings) {
        serverSettings.forEach((value, key) => {
            gusSettings[key] = value;
        });
    }

    // Extract ShooterGameMode from Game
    const gameMode = configs.Game.get('/Script/ShooterGame.ShooterGameMode');
    if (gameMode) {
        gameMode.forEach((value, key) => {
            gameSettings[key] = value;
        });
    }

    return {
        id: `custom_${Date.now()}`,
        name,
        description,
        icon: '⚙️',
        color: 'from-sky-500 to-blue-600',
        settings: {
            GameUserSettings: gusSettings,
            Game: gameSettings,
        },
    };
}
