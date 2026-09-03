import { ArkServerPreset, PresetExportOptions, PresetImportOptions } from '../types/preset.types';
import { Server } from '../types';
import {
    readConfig,
    saveConfig,
    getInstalledMods,
    installMod,
    updateServerSettings,
    saveFileDialog,
    selectFile,
    readFileContent,
    writeFileContent,
    createBackup,
} from '../utils/tauri';
import {
    readAseIniRaw,
    writeAseIniRaw,
    getInstalledAseMods,
    downloadWorkshopMod,
    createAseConfigBackup,
} from '../ase/utils/aseCommands';

// ============================================================================
// Multiplier & Parser Helpers
// ============================================================================

export function parseIniNumber(content: string, key: string, defaultValue: number): number {
    const regex = new RegExp(`^\\s*${key}\\s*=\\s*([0-9.]+)\\s*$`, 'mi');
    const match = content.match(regex);
    if (match && match[1]) {
        const val = parseFloat(match[1]);
        return isNaN(val) ? defaultValue : val;
    }
    return defaultValue;
}

export function extractRatesSummary(gusContent: string, gameIniContent: string) {
    return {
        xpMultiplier: parseIniNumber(gusContent, 'XPMultiplier', 1),
        tamingSpeedMultiplier: parseIniNumber(gusContent, 'TamingSpeedMultiplier', 1),
        harvestAmountMultiplier: parseIniNumber(gusContent, 'HarvestAmountMultiplier', 1),
        babyMatureSpeedMultiplier: parseIniNumber(gameIniContent, 'BabyMatureSpeedMultiplier', 1),
        eggHatchSpeedMultiplier: parseIniNumber(gameIniContent, 'EggHatchSpeedMultiplier', 1),
        matingIntervalMultiplier: parseIniNumber(gameIniContent, 'MatingIntervalMultiplier', 1),
    };
}

export function sanitizeIniForExport(content: string, includePasswords: boolean): string {
    if (includePasswords || !content) return content;

    return content
        .split(/\r?\n/)
        .map(line => {
            const trimmed = line.trim();
            if (
                trimmed.startsWith('ServerPassword=') ||
                trimmed.startsWith('ServerAdminPassword=') ||
                trimmed.startsWith('RCONPassword=') ||
                trimmed.startsWith('SpectatorPassword=')
            ) {
                const key = trimmed.split('=')[0];
                return `${key}=`;
            }
            return line;
        })
        .join('\r\n');
}

// ============================================================================
// Export Logic
// ============================================================================

export async function exportServerToPreset(
    server: Server,
    options: PresetExportOptions,
    metadata: {
        name: string;
        description: string;
        author: string;
        tags: string[];
    }
): Promise<ArkServerPreset> {
    const isAse = server.serverType === 'ASE';
    let gus = '';
    let gameIni = '';
    let modsList: ArkServerPreset['mods'] = [];

    // 1. Read INI configurations
    try {
        if (options.includeGameUserSettings) {
            gus = isAse
                ? (await readAseIniRaw(server.id, 'GameUserSettings')) || ''
                : (await readConfig(server.id, 'GameUserSettings')) || '';
            gus = sanitizeIniForExport(gus, options.includePasswords);
        }
    } catch (e) {
        console.warn('Could not read GameUserSettings.ini during preset export:', e);
    }

    try {
        if (options.includeGameIni) {
            gameIni = isAse
                ? (await readAseIniRaw(server.id, 'Game')) || ''
                : (await readConfig(server.id, 'Game')) || '';
            gameIni = sanitizeIniForExport(gameIni, options.includePasswords);
        }
    } catch (e) {
        console.warn('Could not read Game.ini during preset export:', e);
    }

    // 2. Read Installed Mods
    if (options.includeMods) {
        try {
            if (isAse) {
                const aseMods = await getInstalledAseMods(server.id);
                modsList = (aseMods || []).map((m: any, idx: number) => ({
                    id: String(m.modId || m.id),
                    name: m.name || `Mod ${m.modId || m.id}`,
                    version: m.version,
                    author: m.author,
                    loadOrder: idx,
                    enabled: m.enabled ?? true,
                }));
            } else {
                const asaMods = await getInstalledMods(server.id);
                modsList = (asaMods || []).map((m: any, idx: number) => ({
                    id: String(m.id || m.modId),
                    name: m.name || `Mod ${m.id}`,
                    version: m.version,
                    author: m.author,
                    loadOrder: m.loadOrder ?? idx,
                    enabled: m.enabled ?? true,
                }));
            }
        } catch (e) {
            console.warn('Could not read installed mods during preset export:', e);
        }
    }

    // 3. Extract Rates Summary
    const ratesSummary = extractRatesSummary(gus, gameIni);

    const preset: ArkServerPreset = {
        schemaVersion: '1.0',
        id: `preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: metadata.name.trim() || `${server.name} Template`,
        description: metadata.description.trim() || `Configured from server ${server.name}`,
        author: metadata.author.trim() || 'Server Admin',
        serverType: isAse ? 'ASE' : 'ASA',
        targetMap: server.config?.mapName,
        tags: metadata.tags.length > 0 ? metadata.tags : ['Custom', server.serverType],
        createdAt: new Date().toISOString(),
        serverSettings: {
            maxPlayers: options.includeServerSettings ? server.config?.maxPlayers : undefined,
            pveMode: options.includeServerSettings ? server.config?.pve_mode : undefined,
            crossplay: undefined,
            battleye: options.includeServerSettings ? server.battleye : undefined,
            customArgs: options.includeLaunchArgs ? (server.config?.customArgs || server.config?.custom_args) : undefined,
            processPriority: server.startupPriority,
            autoStart: server.autoStart,
        },
        configs: {
            gameUserSettings: options.includeGameUserSettings ? gus : undefined,
            gameIni: options.includeGameIni ? gameIni : undefined,
        },
        mods: modsList,
        ratesSummary,
    };

    return preset;
}

// ============================================================================
// File Operations
// ============================================================================

export async function savePresetToFile(preset: ArkServerPreset): Promise<boolean> {
    const jsonContent = JSON.stringify(preset, null, 2);
    const sanitizedFilename = `${preset.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.arkpreset`;

    try {
        const filePath = await saveFileDialog(
            'Save Server Template Preset',
            sanitizedFilename,
            ['arkpreset', 'json']
        );
        if (filePath) {
            await writeFileContent(filePath, jsonContent);
            return true;
        }
        return false;
    } catch (err) {
        console.warn('Native save dialog failed or was cancelled, falling back to browser download:', err);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sanitizedFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }
}

export async function loadPresetFromFile(): Promise<ArkServerPreset | null> {
    try {
        const filePath = await selectFile('Select Server Preset File', ['arkpreset', 'json']);
        if (!filePath) return null;

        const content = await readFileContent(filePath);
        return parsePresetJson(content);
    } catch (err: any) {
        throw new Error(`Failed to load preset file: ${err?.message || err}`);
    }
}

export function parsePresetJson(jsonString: string): ArkServerPreset {
    try {
        const data = JSON.parse(jsonString);

        if (!data || typeof data !== 'object') {
            throw new Error('Invalid format: file content is not a JSON object.');
        }

        if (!data.name || typeof data.name !== 'string') {
            throw new Error('Invalid preset: missing "name" field.');
        }

        // Schema normalizations & fallbacks
        return {
            schemaVersion: data.schemaVersion || '1.0',
            id: data.id || `preset_${Date.now()}`,
            name: data.name,
            description: data.description || '',
            author: data.author || 'Unknown Author',
            serverType: data.serverType === 'ASE' ? 'ASE' : 'ASA',
            targetMap: data.targetMap,
            tags: Array.isArray(data.tags) ? data.tags : ['Imported'],
            createdAt: data.createdAt || new Date().toISOString(),
            serverSettings: data.serverSettings || {},
            configs: data.configs || {},
            mods: Array.isArray(data.mods) ? data.mods : [],
            ratesSummary: data.ratesSummary || extractRatesSummary(
                data.configs?.gameUserSettings || '',
                data.configs?.gameIni || ''
            ),
        };
    } catch (err: any) {
        throw new Error(`Invalid preset file: ${err.message}`);
    }
}

// ============================================================================
// Apply Preset to Server
// ============================================================================

export async function applyPresetToServer(
    server: Server,
    preset: ArkServerPreset,
    options: PresetImportOptions
): Promise<{ success: boolean; appliedModsCount: number; backupCreated: boolean }> {
    const isAse = server.serverType === 'ASE';
    let backupCreated = false;
    let appliedModsCount = 0;

    // 1. Create safety backup of existing INI configs
    if (options.createBackupFirst) {
        try {
            if (isAse) {
                await createAseConfigBackup(server.id);
            } else {
                await createBackup(server.id, 'manual');
            }
            backupCreated = true;
        } catch (e) {
            console.warn('Automatic pre-apply config backup failed, proceeding with caution:', e);
        }
    }

    // 2. Apply INI configurations
    if (options.applyConfigs) {
        if (preset.configs.gameUserSettings) {
            if (isAse) {
                await writeAseIniRaw(server.id, 'GameUserSettings', preset.configs.gameUserSettings);
            } else {
                await saveConfig(server.id, 'GameUserSettings', preset.configs.gameUserSettings);
            }
        }

        if (preset.configs.gameIni) {
            if (isAse) {
                await writeAseIniRaw(server.id, 'Game', preset.configs.gameIni);
            } else {
                await saveConfig(server.id, 'Game', preset.configs.gameIni);
            }
        }
    }

    // 3. Apply Server Settings & Launch Arguments
    const updatedSettings: any = {};
    if (options.applyServerSettings && preset.serverSettings) {
        if (preset.serverSettings.maxPlayers !== undefined) {
            updatedSettings.maxPlayers = preset.serverSettings.maxPlayers;
        }
        if (preset.serverSettings.customArgs !== undefined) {
            updatedSettings.customArgs = preset.serverSettings.customArgs;
        }
    }

    if (options.applyLaunchArgs && preset.serverSettings?.customArgs !== undefined) {
        updatedSettings.customArgs = preset.serverSettings.customArgs;
    }

    if (Object.keys(updatedSettings).length > 0) {
        try {
            await updateServerSettings({
                serverId: server.id,
                ...updatedSettings,
            });
        } catch (e) {
            console.warn('Could not update server settings:', e);
        }
    }

    // 4. Install & Register Missing Mods
    if (options.applyMods && preset.mods && preset.mods.length > 0) {
        for (const mod of preset.mods) {
            try {
                if (isAse) {
                    await downloadWorkshopMod(server.id, mod.id, mod.name || `Mod-${mod.id}`);
                } else {
                    await installMod(server.id, {
                        id: mod.id,
                        name: mod.name || `Mod-${mod.id}`,
                        serverType: 'ASA',
                    });
                }
                appliedModsCount++;
            } catch (err) {
                console.warn(`Could not install preset mod ${mod.name} (${mod.id}):`, err);
            }
        }
    }

    return {
        success: true,
        appliedModsCount,
        backupCreated,
    };
}

// ============================================================================
// Built-in Starter Templates & Community Presets
// ============================================================================

export const BUILT_IN_STARTER_PRESETS: ArkServerPreset[] = [
    {
        schemaVersion: '1.0',
        id: 'starter_official_vanilla',
        name: 'Official Vanilla (1x Rates)',
        description: 'Standard Wildcard official rules and unmodified 1x rates. Pure unassisted survival challenge.',
        author: 'Wildcard Standard',
        serverType: 'ASA',
        tags: ['Vanilla', 'Official', '1x Rates', 'Standard'],
        createdAt: '2026-01-01T00:00:00Z',
        serverSettings: {
            maxPlayers: 70,
            pveMode: true,
            crossplay: true,
            battleye: true,
        },
        configs: {
            gameUserSettings: `[ServerSettings]
DifficultyOffset=1.000000
OverrideOfficialDifficulty=5.000000
XPMultiplier=1.000000
TamingSpeedMultiplier=1.000000
HarvestAmountMultiplier=1.000000
ServerPVE=True
AllowFlyerSpeedLeveling=False
DisableStructureDecayPvE=False
EnablePvPGamma=True
DayTimeSpeedScale=1.000000
NightTimeSpeedScale=1.000000
ResourcesRespawnPeriodMultiplier=1.000000`,
            gameIni: `[/Script/ShooterGame.ShooterGameMode]
BabyMatureSpeedMultiplier=1.000000
EggHatchSpeedMultiplier=1.000000
MatingIntervalMultiplier=1.000000
CropGrowthSpeedMultiplier=1.000000
GlobalSpoilingTimeMultiplier=1.000000`,
        },
        mods: [],
        ratesSummary: {
            xpMultiplier: 1,
            tamingSpeedMultiplier: 1,
            harvestAmountMultiplier: 1,
            babyMatureSpeedMultiplier: 1,
            eggHatchSpeedMultiplier: 1,
            matingIntervalMultiplier: 1,
        },
    },
    {
        schemaVersion: '1.0',
        id: 'starter_casual_small_tribes',
        name: 'Casual Small Tribes (3x Rates)',
        description: 'Balanced for working adults and small friend groups. Accelerated taming and breeding without breaking gameplay progression.',
        author: 'Community Favorite',
        serverType: 'ASA',
        tags: ['Small Tribes', 'Balanced', '3x Rates', 'Fast Breeding'],
        createdAt: '2026-01-01T00:00:00Z',
        serverSettings: {
            maxPlayers: 50,
            pveMode: true,
            crossplay: true,
            battleye: true,
        },
        configs: {
            gameUserSettings: `[ServerSettings]
DifficultyOffset=1.000000
OverrideOfficialDifficulty=5.000000
XPMultiplier=3.000000
TamingSpeedMultiplier=4.000000
HarvestAmountMultiplier=3.000000
ServerPVE=True
AllowFlyerSpeedLeveling=True
DisableStructureDecayPvE=True
EnablePvPGamma=True
DayTimeSpeedScale=0.800000
NightTimeSpeedScale=2.000000
ResourcesRespawnPeriodMultiplier=0.500000`,
            gameIni: `[/Script/ShooterGame.ShooterGameMode]
BabyMatureSpeedMultiplier=10.000000
EggHatchSpeedMultiplier=10.000000
MatingIntervalMultiplier=0.200000
BabyCuddleIntervalMultiplier=0.200000
CropGrowthSpeedMultiplier=3.000000
GlobalSpoilingTimeMultiplier=2.000000`,
        },
        mods: [],
        ratesSummary: {
            xpMultiplier: 3,
            tamingSpeedMultiplier: 4,
            harvestAmountMultiplier: 3,
            babyMatureSpeedMultiplier: 10,
            eggHatchSpeedMultiplier: 10,
            matingIntervalMultiplier: 0.2,
        },
    },
    {
        schemaVersion: '1.0',
        id: 'starter_mega_boosted_5x',
        name: 'High-Rate Mega Boost (5x Rates)',
        description: 'Fast-paced, action-oriented rates. High resource yields, rapid breeding cycles, and quick leveling.',
        author: 'Action PvP/PvE',
        serverType: 'ASA',
        tags: ['Boosted', '5x Rates', 'Rapid Taming', 'PvP Ready'],
        createdAt: '2026-01-01T00:00:00Z',
        serverSettings: {
            maxPlayers: 70,
            pveMode: false,
            crossplay: true,
            battleye: true,
        },
        configs: {
            gameUserSettings: `[ServerSettings]
DifficultyOffset=1.000000
OverrideOfficialDifficulty=6.000000
XPMultiplier=5.000000
TamingSpeedMultiplier=8.000000
HarvestAmountMultiplier=5.000000
ServerPVE=False
AllowFlyerSpeedLeveling=True
DisableStructureDecayPvE=True
EnablePvPGamma=True
DayTimeSpeedScale=0.700000
NightTimeSpeedScale=3.000000
ResourcesRespawnPeriodMultiplier=0.300000`,
            gameIni: `[/Script/ShooterGame.ShooterGameMode]
BabyMatureSpeedMultiplier=25.000000
EggHatchSpeedMultiplier=25.000000
MatingIntervalMultiplier=0.100000
BabyCuddleIntervalMultiplier=0.100000
CropGrowthSpeedMultiplier=5.000000
GlobalSpoilingTimeMultiplier=3.000000`,
        },
        mods: [],
        ratesSummary: {
            xpMultiplier: 5,
            tamingSpeedMultiplier: 8,
            harvestAmountMultiplier: 5,
            babyMatureSpeedMultiplier: 25,
            eggHatchSpeedMultiplier: 25,
            matingIntervalMultiplier: 0.1,
        },
    },
    {
        schemaVersion: '1.0',
        id: 'starter_ultra_sandbox_10x',
        name: 'Ultra Sandbox & Building (10x Rates)',
        description: 'Instant taming, virtually instant baby maturation, and massive harvest quantities. Built for builders and chill players.',
        author: 'Builder Suite',
        serverType: 'ASA',
        tags: ['Sandbox', '10x Rates', 'Instant Tame', 'Building'],
        createdAt: '2026-01-01T00:00:00Z',
        serverSettings: {
            maxPlayers: 32,
            pveMode: true,
            crossplay: true,
            battleye: false,
        },
        configs: {
            gameUserSettings: `[ServerSettings]
DifficultyOffset=1.000000
OverrideOfficialDifficulty=5.000000
XPMultiplier=10.000000
TamingSpeedMultiplier=20.000000
HarvestAmountMultiplier=10.000000
ServerPVE=True
AllowFlyerSpeedLeveling=True
DisableStructureDecayPvE=True
EnablePvPGamma=True
DayTimeSpeedScale=0.500000
NightTimeSpeedScale=4.000000
ResourcesRespawnPeriodMultiplier=0.100000`,
            gameIni: `[/Script/ShooterGame.ShooterGameMode]
BabyMatureSpeedMultiplier=50.000000
EggHatchSpeedMultiplier=50.000000
MatingIntervalMultiplier=0.050000
BabyCuddleIntervalMultiplier=0.050000
CropGrowthSpeedMultiplier=10.000000
GlobalSpoilingTimeMultiplier=5.000000`,
        },
        mods: [],
        ratesSummary: {
            xpMultiplier: 10,
            tamingSpeedMultiplier: 20,
            harvestAmountMultiplier: 10,
            babyMatureSpeedMultiplier: 50,
            eggHatchSpeedMultiplier: 50,
            matingIntervalMultiplier: 0.05,
        },
    },
    {
        schemaVersion: '1.0',
        id: 'starter_hardcore_survival',
        name: 'Hardcore Survival (0.5x Rates)',
        description: 'Ruthless survival difficulty: low resource yields, slow leveling, and punishing creature damage.',
        author: 'Survivalist',
        serverType: 'ASA',
        tags: ['Hardcore', 'Difficult', '0.5x Rates', 'Immersive'],
        createdAt: '2026-01-01T00:00:00Z',
        serverSettings: {
            maxPlayers: 50,
            pveMode: false,
            crossplay: true,
            battleye: true,
        },
        configs: {
            gameUserSettings: `[ServerSettings]
DifficultyOffset=1.000000
OverrideOfficialDifficulty=5.000000
XPMultiplier=0.500000
TamingSpeedMultiplier=0.750000
HarvestAmountMultiplier=0.500000
ServerPVE=False
AllowFlyerSpeedLeveling=False
DisableStructureDecayPvE=False
EnablePvPGamma=False
DayTimeSpeedScale=1.200000
NightTimeSpeedScale=0.800000
ResourcesRespawnPeriodMultiplier=1.500000`,
            gameIni: `[/Script/ShooterGame.ShooterGameMode]
BabyMatureSpeedMultiplier=0.800000
EggHatchSpeedMultiplier=0.800000
MatingIntervalMultiplier=1.500000
CropGrowthSpeedMultiplier=0.500000
GlobalSpoilingTimeMultiplier=0.750000`,
        },
        mods: [],
        ratesSummary: {
            xpMultiplier: 0.5,
            tamingSpeedMultiplier: 0.75,
            harvestAmountMultiplier: 0.5,
            babyMatureSpeedMultiplier: 0.8,
            eggHatchSpeedMultiplier: 0.8,
            matingIntervalMultiplier: 1.5,
        },
    },
    {
        schemaVersion: '1.0',
        id: 'starter_fibercraft_pvp_100x',
        name: 'Fibercraft & Instant PvP (100x Rates)',
        description: 'Instant taming, massive harvesting, and hyper breeding. Crafted for high-octane PvP skirmishes and instant action.',
        author: 'Community PvP',
        serverType: 'ASA',
        tags: ['Fibercraft', '100x Rates', 'Instant PvP', 'Hyper Boosted'],
        createdAt: '2026-01-01T00:00:00Z',
        serverSettings: {
            maxPlayers: 70,
            pveMode: false,
            crossplay: true,
            battleye: true,
        },
        configs: {
            gameUserSettings: `[ServerSettings]
DifficultyOffset=1.000000
OverrideOfficialDifficulty=10.000000
XPMultiplier=100.000000
TamingSpeedMultiplier=100.000000
HarvestAmountMultiplier=100.000000
ServerPVE=False
AllowFlyerSpeedLeveling=True
DisableStructureDecayPvE=True
EnablePvPGamma=True
DayTimeSpeedScale=0.500000
NightTimeSpeedScale=5.000000
ResourcesRespawnPeriodMultiplier=0.050000`,
            gameIni: `[/Script/ShooterGame.ShooterGameMode]
BabyMatureSpeedMultiplier=100.000000
EggHatchSpeedMultiplier=100.000000
MatingIntervalMultiplier=0.010000
BabyCuddleIntervalMultiplier=0.010000
CropGrowthSpeedMultiplier=25.000000
GlobalSpoilingTimeMultiplier=10.000000`,
        },
        mods: [],
        ratesSummary: {
            xpMultiplier: 100,
            tamingSpeedMultiplier: 100,
            harvestAmountMultiplier: 100,
            babyMatureSpeedMultiplier: 100,
            eggHatchSpeedMultiplier: 100,
            matingIntervalMultiplier: 0.01,
        },
    },
];

// ============================================================================
// Local Presets Library (Stored in localStorage)
// ============================================================================

const LOCAL_STORAGE_KEY = 'ark_custom_server_presets_v1';

export function getLocalPresets(): ArkServerPreset[] {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('Failed to load local presets from storage:', e);
        return [];
    }
}

export function saveLocalPreset(preset: ArkServerPreset): void {
    const existing = getLocalPresets();
    const filtered = existing.filter(p => p.id !== preset.id);
    filtered.unshift(preset);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
}

export function deleteLocalPreset(presetId: string): void {
    const existing = getLocalPresets();
    const updated = existing.filter(p => p.id !== presetId);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
}
