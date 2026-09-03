// Server Preset & Template Types for ARK: Survival Ascended & Evolved

export interface ArkServerPreset {
    schemaVersion: '1.0';
    id: string;
    name: string;
    description: string;
    author: string;
    serverType: 'ASA' | 'ASE';
    targetMap?: string;
    tags: string[];
    createdAt: string;

    // Server Settings & Launch parameters
    serverSettings: {
        maxPlayers?: number;
        pveMode?: boolean;
        crossplay?: boolean;
        battleye?: boolean;
        customArgs?: string;
        processPriority?: number | string;
        autoStart?: boolean;
    };

    // Full or Curated INI Configurations
    configs: {
        gameUserSettings?: string;
        gameIni?: string;
    };

    // Installed Mods Specification & Load Order
    mods: Array<{
        id: string;
        name: string;
        version?: string;
        author?: string;
        loadOrder: number;
        enabled: boolean;
    }>;

    // High-level rates metadata for instant UI display & badge rendering
    ratesSummary?: {
        xpMultiplier: number;
        tamingSpeedMultiplier: number;
        harvestAmountMultiplier: number;
        babyMatureSpeedMultiplier: number;
        eggHatchSpeedMultiplier: number;
        matingIntervalMultiplier: number;
    };
}

export interface PresetExportOptions {
    includeGameUserSettings: boolean;
    includeGameIni: boolean;
    includeMods: boolean;
    includeLaunchArgs: boolean;
    includeServerSettings: boolean;
    includePasswords: boolean;
}

export interface PresetImportOptions {
    applyConfigs: boolean;
    applyMods: boolean;
    applyServerSettings: boolean;
    applyLaunchArgs: boolean;
    createBackupFirst: boolean;
}
