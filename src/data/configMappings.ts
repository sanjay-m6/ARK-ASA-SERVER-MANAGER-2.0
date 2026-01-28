// Configuration schema types and mappings for ARK Server settings
// Enhanced with sliders, dropdowns, and categories for Visual Settings Manager

export type FieldType = 'text' | 'number' | 'boolean' | 'slider' | 'dropdown' | 'array' | 'textarea';

export interface ConfigField {
    section: string;
    key: string;
    label: string;
    type: FieldType;
    defaultValue?: string;
    description?: string;
    wikiLink?: string;
    // Slider properties
    min?: number;
    max?: number;
    step?: number;
    // Dropdown options
    options?: { value: string; label: string; group?: string }[];
    // Array properties
    template?: Record<string, { label: string; placeholder: string }>;
}

export interface ConfigGroup {
    title: string;
    description?: string;
    category: 'server' | 'gameplay' | 'player' | 'dino' | 'breeding' | 'structure' | 'pvp' | 'rules' | 'chat' | 'transfers' | 'advanced';
    icon?: string;
    source?: 'GameUserSettings' | 'Game';
    fields: ConfigField[];
}

// Category metadata for UI
// Category metadata for UI
export const CATEGORY_INFO: Record<string, { label: string; icon: string; color: string }> = {
    server: { label: 'Server', icon: '🖥️', color: 'from-blue-500 to-cyan-500' },
    gameplay: { label: 'Gameplay', icon: '🎮', color: 'from-purple-500 to-pink-500' },
    rules: { label: 'Rules', icon: '📜', color: 'from-rose-500 to-red-500' },
    chat: { label: 'Chat & HUD', icon: '💬', color: 'from-green-500 to-teal-500' },
    transfers: { label: 'Transfers', icon: '☁️', color: 'from-sky-500 to-blue-500' },
    player: { label: 'Player', icon: '👤', color: 'from-indigo-500 to-violet-500' },
    dino: { label: 'Dinosaurs', icon: '🦖', color: 'from-orange-500 to-amber-500' },
    breeding: { label: 'Breeding', icon: '🥚', color: 'from-pink-500 to-rose-500' },
    structure: { label: 'Structures', icon: '🏠', color: 'from-slate-500 to-gray-500' },
    pvp: { label: 'PvP/PvE', icon: '⚔️', color: 'from-red-600 to-orange-600' },
    advanced: { label: 'Advanced', icon: '⚙️', color: 'from-slate-600 to-gray-600' },
};

// GameUserSettings.ini schema - Enhanced with sliders and categories
export const GAME_USER_SETTINGS_SCHEMA: ConfigGroup[] = [
    {
        title: 'Server Identity',
        description: 'Basic server configuration',
        category: 'server',
        fields: [
            {
                section: 'ServerSettings',
                key: 'ServerName',
                label: 'Server Name',
                type: 'text',
                defaultValue: 'ARK Server',
                description: 'The name of your server'
            },
            {
                section: 'MessageOfTheDay',
                key: 'Message',
                label: 'Message of the Day',
                type: 'textarea',
                defaultValue: '',
                description: 'Message shown to players when they join. Use \\n for new lines.'
            },
            {
                section: 'ServerSettings',
                key: 'ServerPassword',
                label: 'Server Password',
                type: 'text',
                defaultValue: '',
                description: 'Password required to join'
            },
            {
                section: 'ServerSettings',
                key: 'ServerAdminPassword',
                label: 'Admin Password',
                type: 'text',
                defaultValue: '',
                description: 'Password for admin access'
            },
            {
                section: 'ServerSettings',
                key: 'MaxPlayers',
                label: 'Max Players',
                type: 'slider',
                defaultValue: '70',
                min: 1,
                max: 127,
                step: 1,
                description: 'Maximum number of players'
            },
            {
                section: 'ServerSettings',
                key: 'MapName',
                label: 'Map',
                type: 'dropdown',
                defaultValue: 'TheIsland_WP',
                options: [
                    // Released Maps
                    { value: 'TheIsland_WP', label: '🏝️ The Island', group: 'released' },
                    { value: 'ScorchedEarth_WP', label: '🏜️ Scorched Earth', group: 'released' },
                    { value: 'TheCenter_WP', label: '🌊 The Center', group: 'released' },
                    { value: 'Aberration_WP', label: '🍄 Aberration', group: 'released' },
                    { value: 'Extinction_WP', label: '🏚️ Extinction', group: 'released' },
                    { value: 'Ragnarok_WP', label: '⚔️ Ragnarok', group: 'released' },
                    { value: 'Valguero_WP', label: '🦖 Valguero', group: 'released' },
                    { value: 'LostColony_WP', label: '🚀 Lost Colony', group: 'released' },
                    // Premium Mod Maps
                    { value: 'Astraeos_WP', label: '✨ Astraeos', group: 'premium' },
                    { value: 'Forglar_WP', label: '🌿 Forglar', group: 'premium' },
                    // Coming 2026
                    { value: 'Genesis_WP', label: '🧬 Genesis Part 1', group: 'upcoming' },
                    { value: 'Genesis2_WP', label: '🛸 Genesis Part 2', group: 'upcoming' },
                    { value: 'CrystalIsles_WP', label: '💎 Crystal Isles', group: 'upcoming' },
                    { value: 'LostIsland_WP', label: '🗿 Lost Island', group: 'upcoming' },
                    { value: 'Fjordur_WP', label: '❄️ Fjordur', group: 'upcoming' }
                ],
                description: 'The map to load'
            },
            {
                section: 'ServerSettings',
                key: 'IPAddress',
                label: 'Server IP Address',
                type: 'text',
                defaultValue: '',
                description: 'Bind server to specific IP address (leave empty for all interfaces)'
            },
            {
                section: 'ServerSettings',
                key: 'RCONEnabled',
                label: 'RCON Enabled',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Enable remote console access for server management'
            },
            {
                section: 'URL',
                key: 'Port',
                label: 'Game Port',
                type: 'slider',
                defaultValue: '7777',
                min: 1,
                max: 65535,
                step: 1,
                description: 'Main game port for player connections (default: 7777)',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#URL'
            },
            {
                section: 'URL',
                key: 'QueryPort',
                label: 'Query Port',
                type: 'slider',
                defaultValue: '27015',
                min: 1,
                max: 65535,
                step: 1,
                description: 'Port for server browser queries (default: 27015)',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#URL'
            },
            {
                section: 'ServerSettings',
                key: 'RCONPort',
                label: 'RCON Port',
                type: 'slider',
                defaultValue: '27020',
                min: 1,
                max: 65535,
                step: 1,
                description: 'Port for RCON connections (default: 27020)'
            },
            {
                section: 'ServerSettings',
                key: 'ServerCrossplay',
                label: 'Enable Crossplay',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow Xbox, PlayStation, and PC (Epic/Steam) players to join together. Requires the server to use Epic/Xbox crossplay binaries.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#ServerSettings'
            }
        ]
    },
    {
        title: 'XP & Progression',
        description: 'Experience and leveling settings',
        category: 'gameplay',
        fields: [
            {
                section: 'ServerSettings',
                key: 'XPMultiplier',
                label: 'XP Multiplier',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Global XP gain rate from all sources',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#ServerSettings'
            },
            {
                section: 'ServerSettings',
                key: 'DifficultyOffset',
                label: 'Difficulty',
                type: 'slider',
                defaultValue: '1.0',
                min: 0,
                max: 1,
                step: 0.1,
                description: 'Server difficulty (affects max wild dino level)'
            },
            {
                section: 'ServerSettings',
                key: 'OverrideOfficialDifficulty',
                label: 'Override Max Difficulty',
                type: 'slider',
                defaultValue: '5.0',
                min: 1,
                max: 15,
                step: 0.5,
                description: 'Override max wild dino level (5.0 = level 150)'
            }
        ]
    },
    {
        title: 'Harvesting',
        description: 'Resource gathering rates',
        category: 'gameplay',
        fields: [
            {
                section: 'ServerSettings',
                key: 'HarvestAmountMultiplier',
                label: 'Harvest Amount',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Resource harvest amount multiplier'
            },
            {
                section: 'ServerSettings',
                key: 'HarvestHealthMultiplier',
                label: 'Harvest Health',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Resource node health multiplier'
            },
            {
                section: 'ServerSettings',
                key: 'ResourcesRespawnPeriodMultiplier',
                label: 'Resource Respawn',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Resource respawn rate (lower = faster)'
            }
        ]
    },
    {
        title: 'Taming',
        description: 'Creature taming settings',
        category: 'dino',
        fields: [
            {
                section: 'ServerSettings',
                key: 'TamingSpeedMultiplier',
                label: 'Taming Speed',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 20,
                step: 0.5,
                description: 'How fast creatures are tamed'
            },
            {
                section: 'ServerSettings',
                key: 'DinoCharacterFoodDrainMultiplier',
                label: 'Dino Food Drain',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Dino food consumption rate'
            }
        ]
    },
    {
        title: 'Dino Stats',
        description: 'Dinosaur stat multipliers',
        category: 'dino',
        fields: [
            {
                section: 'ServerSettings',
                key: 'DinoCountMultiplier',
                label: 'Wild Dino Count',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 3,
                step: 0.1,
                description: 'Wild dino spawn density'
            },
            {
                section: 'ServerSettings',
                key: 'DinoDamageMultiplier',
                label: 'Dino Damage',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Dino damage output'
            },
            {
                section: 'ServerSettings',
                key: 'DinoResistanceMultiplier',
                label: 'Dino Resistance',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Dino damage resistance'
            }
        ]
    },
    {
        title: 'Player Stats',
        description: 'Player stat multipliers',
        category: 'player',
        fields: [
            {
                section: 'ServerSettings',
                key: 'PlayerDamageMultiplier',
                label: 'Player Damage',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Player damage output'
            },
            {
                section: 'ServerSettings',
                key: 'PlayerResistanceMultiplier',
                label: 'Player Resistance',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Player damage resistance'
            },
            {
                section: 'ServerSettings',
                key: 'PlayerCharacterWaterDrainMultiplier',
                label: 'Water Drain',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 3,
                step: 0.1,
                description: 'Water consumption rate'
            },
            {
                section: 'ServerSettings',
                key: 'PlayerCharacterFoodDrainMultiplier',
                label: 'Food Drain',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 3,
                step: 0.1,
                description: 'Food consumption rate'
            },
            {
                section: 'ServerSettings',
                key: 'PlayerCharacterStaminaDrainMultiplier',
                label: 'Stamina Drain',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 3,
                step: 0.1,
                description: 'Stamina consumption rate'
            },
            {
                section: 'ServerSettings',
                key: 'PlayerCharacterHealthRecoveryMultiplier',
                label: 'Health Recovery',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Health regeneration rate'
            }
        ]
    },
    {
        title: 'Structure Settings',
        description: 'Building and decay options',
        category: 'structure',
        fields: [
            {
                section: 'ServerSettings',
                key: 'StructureResistanceMultiplier',
                label: 'Structure Resistance',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Structure damage resistance'
            },
            {
                section: 'ServerSettings',
                key: 'StructureDamageMultiplier',
                label: 'Structure Damage',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Damage to structures'
            },
            {
                section: 'ServerSettings',
                key: 'PvEStructureDecayPeriodMultiplier',
                label: 'Structure Decay Rate',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Structure decay period'
            },
            {
                section: 'ServerSettings',
                key: 'AlwaysAllowStructurePickup',
                label: 'Allow Structure Pickup',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow picking up placed structures'
            }
        ]
    },
    {
        title: 'Day/Night Cycle',
        description: 'Time and lighting settings',
        category: 'gameplay',
        fields: [
            {
                section: 'ServerSettings',
                key: 'DayTimeSpeedScale',
                label: 'Day Speed',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Daytime speed multiplier'
            },
            {
                section: 'ServerSettings',
                key: 'NightTimeSpeedScale',
                label: 'Night Speed',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Nighttime speed multiplier'
            },
            {
                section: 'ServerSettings',
                key: 'DayCycleSpeedScale',
                label: 'Day Cycle Speed',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Overall day/night cycle speed'
            }
        ]
    },
    {
        title: 'PvP / PvE Mode',
        description: 'Player vs Player settings',
        category: 'pvp',
        fields: [
            {
                section: 'ServerSettings',
                key: 'serverPVE',
                label: 'PvE Mode',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Enable PvE mode (no player damage)'
            },
            {
                section: 'ServerSettings',
                key: 'AllowCaveBuildingPvE',
                label: 'Allow Cave Building',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow building inside caves'
            },
            {
                section: 'ServerSettings',
                key: 'PreventTribeAlliances',
                label: 'Prevent Alliances',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent tribe alliances'
            },
            {
                section: 'ServerSettings',
                key: 'AllowFlyerCarryPvE',
                label: 'Allow Flyer Carry',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow flyers to carry players'
            },
            {
                section: 'ServerSettings',
                key: 'EnablePvPGamma',
                label: 'Enable PvP Gamma',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow gamma adjustment in PvP'
            },
            {
                section: 'ServerSettings',
                key: 'DisableFriendlyFire',
                label: 'Disable Friendly Fire',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent tribe members hurting each other'
            }
        ]
    },
    {
        title: 'Chat & HUD',
        description: 'Communication and display settings',
        category: 'chat',
        fields: [
            {
                section: 'ServerSettings',
                key: 'GlobalVoiceChat',
                label: 'Global Voice Chat',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Voice chat is heard by everyone'
            },
            {
                section: 'ServerSettings',
                key: 'ProximityChat',
                label: 'Proximity Text Chat',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Text chat only visible to nearby players'
            },
            {
                section: 'ServerSettings',
                key: 'AlwaysNotifyPlayerLeft',
                label: 'Notify Player Left',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Show message when player leaves'
            },
            {
                section: 'ServerSettings',
                key: 'AlwaysNotifyPlayerJoined',
                label: 'Notify Player Joined',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Show message when player joins'
            },
            {
                section: 'ServerSettings',
                key: 'ServerCrosshair',
                label: 'Enable Crosshair',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Show crosshair'
            },
            {
                section: 'ServerSettings',
                key: 'ShowMapPlayerLocation',
                label: 'Map Player Location',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Show player position on map'
            },
            {
                section: 'ServerSettings',
                key: 'ShowFloatingDamageText',
                label: 'Floating Damage Text',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Show damage numbers'
            }
        ]
    },
    {
        title: 'Rules & Prevention',
        description: 'Server rules and restrictions',
        category: 'rules',
        fields: [
            {
                section: 'ServerSettings',
                key: 'AllowThirdPersonPlayer',
                label: 'Allow Third Person',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Allow 3rd person camera'
            },
            {
                section: 'ServerSettings',
                key: 'PreventDiseases',
                label: 'Prevent Diseases',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Disable disease system'
            },
            {
                section: 'ServerSettings',
                key: 'NonPermanentDiseases',
                label: 'Non-Permanent Diseases',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Diseases cure on death'
            },
            {
                section: 'ServerSettings',
                key: 'ForceAllStructureLocking',
                label: 'Force Lock Structures',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Auto-lock all containers'
            },
            {
                section: 'ServerSettings',
                key: 'AllowCrateSpawnsOnTopOfStructures',
                label: 'Crates on Structures',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Allow supply crates on buildings'
            }
        ]
    },
    {
        title: 'Transfers',
        description: 'Cross-ARK download settings',
        category: 'transfers',
        fields: [
            {
                section: 'ServerSettings',
                key: 'NoTributeDownloads',
                label: 'Disable Downloads',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Disable all downloads'
            },
            {
                section: 'ServerSettings',
                key: 'PreventDownloadSurvivors',
                label: 'Block Survivor Downloads',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent downloading characters'
            },
            {
                section: 'ServerSettings',
                key: 'PreventDownloadItems',
                label: 'Block Item Downloads',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent downloading items'
            },
            {
                section: 'ServerSettings',
                key: 'PreventDownloadDinos',
                label: 'Block Dino Downloads',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent downloading dinos'
            },
            {
                section: 'ServerSettings',
                key: 'CrossARKAllowForeignDinoDownloads',
                label: 'Allow Foreign Dinos',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow dinos from other maps'
            }
        ]
    },
    {
        title: 'Breeding & Imprinting',
        description: 'Baby care and imprinting mechanics',
        category: 'breeding',
        fields: [
            {
                section: 'ServerSettings',
                key: 'AllowAnyoneBabyImprintCuddle',
                label: 'Anyone Can Imprint',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow any tribe member to imprint babies'
            },
            {
                section: 'ServerSettings',
                key: 'DisableImprintDinoBuff',
                label: 'Disable Imprint Bonus',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Remove stat bonuses from imprinting'
            },
            {
                section: 'ServerSettings',
                key: 'AllowRaidDinoFeeding',
                label: 'Allow Raid Dino Feeding',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Enable feeding for tamed raid dinos'
            },
            {
                section: 'ServerSettings',
                key: 'DisableDinoDecayPvE',
                label: 'Disable Dino Decay (PvE)',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent unclaimed dinos from decaying in PvE'
            },
            {
                section: 'ServerSettings',
                key: 'AutoDestroyDecayedDinos',
                label: 'Auto-Destroy Decayed Dinos',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Automatically remove fully decayed dinos'
            }
        ]
    },
    {
        title: 'Structure Decay',
        description: 'Building decay and auto-destruction',
        category: 'structure',
        fields: [
            {
                section: 'ServerSettings',
                key: 'DisableStructureDecayPvE',
                label: 'Disable Structure Decay',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent structures from decaying'
            },
            {
                section: 'ServerSettings',
                key: 'AutoDestroyOldStructuresMultiplier',
                label: 'Auto-Destroy Multiplier',
                type: 'slider',
                defaultValue: '0',
                min: 0,
                max: 10,
                step: 0.1,
                description: 'Auto-destroy abandoned structures (0=off)'
            },
            {
                section: 'ServerSettings',
                key: 'FastDecayUnsnappedCoreStructures',
                label: 'Fast Decay Unsnapped',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Unsnapped foundations decay faster'
            },
            {
                section: 'ServerSettings',
                key: 'OnlyDecayUnsnappedCoreStructures',
                label: 'Only Decay Unsnapped',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Only unsnapped structures decay'
            },
            {
                section: 'ServerSettings',
                key: 'OnlyAutoDestroyCoreStructures',
                label: 'Only Auto-Destroy Core',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Only destroy foundations/pillars'
            },
            {
                section: 'ServerSettings',
                key: 'DestroyUnconnectedWaterPipes',
                label: 'Destroy Unconnected Pipes',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Remove pipes not connected to water'
            }
        ]
    },
    {
        title: 'Combat & PvP',
        description: 'Combat mechanics and PvP settings',
        category: 'pvp',
        fields: [
            {
                section: 'ServerSettings',
                key: 'AllowHitMarkers',
                label: 'Allow Hit Markers',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Show damage hit markers'
            },
            {
                section: 'ServerSettings',
                key: 'AllowHideDamageSourceFromLogs',
                label: 'Hide Damage Source',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Hide damage source in tribe logs'
            },
            {
                section: 'ServerSettings',
                key: 'AllowMultipleAttachedC4',
                label: 'Multiple C4',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow multiple C4 on same structure'
            },
            {
                section: 'ServerSettings',
                key: 'DisablePvEGamma',
                label: 'Disable PvE Gamma',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Block gamma command in PvE'
            },
            {
                section: 'ServerSettings',
                key: 'DisableWeatherFog',
                label: 'Disable Weather Fog',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Remove fog weather effects'
            }
        ]
    },
    {
        title: 'Server Limits',
        description: 'Tame limits and restrictions',
        category: 'advanced',
        fields: [
            {
                section: 'ServerSettings',
                key: 'MaxTamedDinos',
                label: 'Max Tamed Dinos',
                type: 'slider',
                defaultValue: '5000',
                min: 0,
                max: 10000,
                step: 100,
                description: 'Server-wide tame limit'
            },
            {
                section: 'ServerSettings',
                key: 'MaxPersonalTamedDinos',
                label: 'Max Personal Dinos',
                type: 'slider',
                defaultValue: '0',
                min: 0,
                max: 1000,
                step: 10,
                description: 'Per-player tame limit (0=unlimited)'
            },
            {
                section: 'ServerSettings',
                key: 'MaxPlatformSaddleStructureLimit',
                label: 'Platform Saddle Limit',
                type: 'slider',
                defaultValue: '75',
                min: 0,
                max: 500,
                step: 5,
                description: 'Max structures on platform saddles'
            },
            {
                section: 'ServerSettings',
                key: 'PerPlatformMaxStructuresMultiplier',
                label: 'Platform Structure Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier for platform structure limits'
            },
            {
                section: 'ServerSettings',
                key: 'MaxTributeItems',
                label: 'Max Tribute Items',
                type: 'slider',
                defaultValue: '50',
                min: 0,
                max: 500,
                step: 10,
                description: 'Max items in tribute inventory'
            },
            {
                section: 'ServerSettings',
                key: 'MaxTributeDinos',
                label: 'Max Tribute Dinos',
                type: 'slider',
                defaultValue: '20',
                min: 0,
                max: 100,
                step: 5,
                description: 'Max dinos in tribute inventory'
            },
            {
                section: 'ServerSettings',
                key: 'MaxTributeCharacters',
                label: 'Max Tribute Characters',
                type: 'slider',
                defaultValue: '10',
                min: 0,
                max: 50,
                step: 5,
                description: 'Max characters in tribute inventory'
            },
            {
                section: 'ServerSettings',
                key: 'KickIdlePlayersPeriod',
                label: 'Kick Idle After (seconds)',
                type: 'slider',
                defaultValue: '3600',
                min: 0,
                max: 7200,
                step: 300,
                description: 'Kick players after idle time (0=disabled)'
            }
        ]
    },
    {
        title: 'Quality of Life',
        description: 'Convenience and gameplay features',
        category: 'gameplay',
        fields: [
            {
                section: 'ServerSettings',
                key: 'AlwaysAllowStructurePickup',
                label: 'Always Allow Pickup',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Always allow structure pickup (no timer)'
            },
            {
                section: 'ServerSettings',
                key: 'OverrideStructurePlatformPrevention',
                label: 'Override Platform Prevention',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow structures anywhere on platforms'
            },
            {
                section: 'ServerSettings',
                key: 'AllowIntegratedSPlusStructures',
                label: 'Allow S+ Structures',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Enable Structures Plus features'
            },
            {
                section: 'ServerSettings',
                key: 'ClampResourceHarvestDamage',
                label: 'Clamp Harvest Damage',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Limit harvest damage multipliers'
            },
            {
                section: 'ServerSettings',
                key: 'ClampItemSpoilingTimes',
                label: 'Clamp Spoiling Times',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Limit spoiling time changes'
            },
            {
                section: 'ServerSettings',
                key: 'ClampItemStats',
                label: 'Clamp Item Stats',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Limit item stat improvements'
            },
            {
                section: 'ServerSettings',
                key: 'AutoSavePeriodMinutes',
                label: 'Auto-Save Interval (minutes)',
                type: 'slider',
                defaultValue: '15',
                min: 5,
                max: 60,
                step: 5,
                description: 'How often to auto-save'
            },
            {
                section: 'ServerSettings',
                key: 'ItemStackSizeMultiplier',
                label: 'Stack Size Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiply item stack sizes'
            }
        ]
    }
];

// Game.ini schema - Enhanced with sliders and categories
export const GAME_INI_SCHEMA: ConfigGroup[] = [
    {
        title: 'XP & Progression',
        description: 'Experience and leveling multipliers',
        category: 'gameplay',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'KillXPMultiplier',
                label: 'Kill XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'XP gained from killing creatures'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'HarvestXPMultiplier',
                label: 'Harvest XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'XP gained from harvesting resources'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CraftXPMultiplier',
                label: 'Craft XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'XP gained from crafting items'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'GenericXPMultiplier',
                label: 'Generic XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for all other XP sources'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'SpecialXPMultiplier',
                label: 'Special XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for special events'
            }
        ]
    },
    {
        title: 'Breeding Speed',
        description: 'Egg hatching and baby maturation',
        category: 'breeding',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'EggHatchSpeedMultiplier',
                label: 'Egg Hatch Speed',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 100,
                step: 1,
                description: 'How fast eggs hatch'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyMatureSpeedMultiplier',
                label: 'Baby Mature Speed',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 100,
                step: 1,
                description: 'How fast babies mature'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyFoodConsumptionSpeedMultiplier',
                label: 'Baby Food Consumption',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 5,
                step: 0.1,
                description: 'Baby food consumption rate'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyCuddleIntervalMultiplier',
                label: 'Cuddle Interval Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.01,
                max: 10,
                step: 0.01,
                description: 'Time between cuddle requests'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyCuddleGracePeriodMultiplier',
                label: 'Cuddle Grace Period',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Extra time to complete cuddle'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyCuddleLoseImprintQualitySpeedMultiplier',
                label: 'Lose Imprint Speed',
                type: 'slider',
                defaultValue: '1',
                min: 0,
                max: 10,
                step: 0.1,
                description: 'How fast imprint quality degrades if missed'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyImprintAmountMultiplier',
                label: 'Imprint Amount Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Amount of imprint per cuddle'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyImprintingStatScaleMultiplier',
                label: 'Imprint Stat Bonus',
                type: 'slider',
                defaultValue: '1',
                min: 0,
                max: 10,
                step: 0.1,
                description: 'Stat bonus from imprinting'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'LayEggIntervalMultiplier',
                label: 'Lay Egg Interval',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Time between egg laying'
            }
        ]
    },
    {
        title: 'Spoiling & Decay',
        description: 'Item and corpse decay times',
        category: 'advanced',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'GlobalSpoilingTimeMultiplier',
                label: 'Spoiling Time Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'How fast items spoil'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'GlobalItemDecompositionTimeMultiplier',
                label: 'Item Decomposition Time',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'How fast dropped items despawn'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'GlobalCorpseDecompositionTimeMultiplier',
                label: 'Corpse Decomposition Time',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'How fast corpses disappear'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CropGrowthSpeedMultiplier',
                label: 'Crop Growth Speed',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'How fast crops grow'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CropDecaySpeedMultiplier',
                label: 'Crop Decay Speed',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'How fast crops decay'
            }
        ]
    },
    {
        title: 'Advanced Gameplay',
        description: 'Advanced server mechanics',
        category: 'advanced',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAutoUnlockAllEngrams',
                label: 'Auto-Unlock All Engrams',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Automatically unlock all engrams for players'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowFlyerSpeedLeveling',
                label: 'Allow Flyer Speed Leveling',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow leveling movement speed on flyers (ASE only)'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowUnlimitedRespecs',
                label: 'Unlimited Respecs',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Remove Mindwipe Tonic cooldown'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bDisableDinoTaming',
                label: 'Disable Taming',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent all dino taming'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bDisableDinoRiding',
                label: 'Disable Riding',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent riding tamed dinos'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bDisableDinoBreeding',
                label: 'Disable Breeding',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent dino breeding'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bUseSingleplayerSettings',
                label: 'Use Singleplayer Settings',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Apply singleplayer balancing adjustments'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bPvEDisableFriendlyFire',
                label: 'PvE Disable Friendly Fire',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Prevent tribe members from hurting each other'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bUseCorpseLocator',
                label: 'Use Corpse Locator',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Show death marker on map'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowCustomRecipes',
                label: 'Allow Custom Recipes',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Enable custom recipe creation'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'MaxNumberOfPlayersInTribe',
                label: 'Max Tribe Members',
                type: 'slider',
                defaultValue: '0',
                min: 0,
                max: 100,
                step: 1,
                description: 'Maximum players per tribe (0=unlimited)'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'MaxTribeLogs',
                label: 'Max Tribe Logs',
                type: 'slider',
                defaultValue: '400',
                min: 100,
                max: 10000,
                step: 100,
                description: 'Maximum tribe log entries'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'DinoTurretDamageMultiplier',
                label: 'Dino Turret Damage',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Damage dinos take from turrets'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'DinoHarvestingDamageMultiplier',
                label: 'Dino Harvesting Damage',
                type: 'slider',
                defaultValue: '3.2',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Harvesting damage multiplier for dinos'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'FishingLootQualityMultiplier',
                label: 'Fishing Loot Quality',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Quality of fishing loot'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CraftingSkillBonusMultiplier',
                label: 'Crafting Speed Bonus',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Bonus to crafting speed (ASA)'
            }
        ]
    },
    {
        title: 'Mating & Imprinting',
        description: 'Mating intervals and imprinting settings',
        category: 'breeding',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'MatingIntervalMultiplier',
                label: 'Mating Interval',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.01,
                max: 1,
                step: 0.01,
                description: 'Time between matings (lower = faster)'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyCuddleIntervalMultiplier',
                label: 'Cuddle Interval',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.01,
                max: 1,
                step: 0.01,
                description: 'Time between imprint cuddles (lower = faster)'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyCuddleGracePeriodMultiplier',
                label: 'Cuddle Grace Period',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 10,
                step: 0.5,
                description: 'Grace period for imprinting'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BabyImprintAmountMultiplier',
                label: 'Imprint Amount',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 10,
                step: 0.5,
                description: 'Imprint percentage per cuddle'
            }
        ]
    },
    {
        title: 'Tribe Settings',
        description: 'Tribe size and governance',
        category: 'advanced',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'MaxNumberOfPlayersInTribe',
                label: 'Max Tribe Size',
                type: 'slider',
                defaultValue: '70',
                min: 1,
                max: 500,
                step: 1,
                description: 'Maximum players per tribe'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'MaxAlliancesPerTribe',
                label: 'Max Alliances',
                type: 'slider',
                defaultValue: '10',
                min: 0,
                max: 50,
                step: 1,
                description: 'Maximum alliances per tribe'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'MaxTribesPerAlliance',
                label: 'Max Tribes Per Alliance',
                type: 'slider',
                defaultValue: '10',
                min: 2,
                max: 50,
                step: 1,
                description: 'Maximum tribes in an alliance'
            }
        ]
    },
    {
        title: 'Level & XP Overrides',
        description: 'Advanced leveling configuration',
        category: 'advanced',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'OverrideMaxExperiencePointsPlayer',
                label: 'Max Player XP',
                type: 'number',
                defaultValue: '0',
                description: 'Total XP required for max level'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'LevelExperienceRampOverrides',
                label: 'XP Ramp Override',
                type: 'text',
                defaultValue: '',
                description: 'Custom XP curve (array)'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'OverridePlayerLevelEngramPoints',
                label: 'Engram Points Per Level',
                type: 'textarea',
                defaultValue: '',
                description: 'Engram points granted for each level up. Enter one value per line.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#OverridePlayerLevelEngramPoints'
            }
        ]
    },
    {
        title: 'Loot Quality',
        description: 'Supply crate and loot settings',
        category: 'gameplay',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'SupplyCrateLootQualityMultiplier',
                label: 'Supply Crate Quality',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 10,
                step: 0.5,
                description: 'Supply crate loot quality'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'FishingLootQualityMultiplier',
                label: 'Fishing Loot Quality',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 10,
                step: 0.5,
                description: 'Fishing loot quality'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CraftingSkillBonusMultiplier',
                label: 'Crafting Speed Bonus',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 10,
                step: 0.5,
                description: 'Bonus to crafting speed (ASA)'
            }
        ]
    },
    {
        title: 'Advanced Options',
        description: 'Advanced gameplay tweaks',
        category: 'advanced',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'PerDinoClassResistanceMultipliers',
                label: 'Dino Resistance Multipliers',
                type: 'array',
                defaultValue: '',
                description: 'Adjust resistance for specific dino classes (lower = more resistant)',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#PerDinoClassResistanceMultipliers',
                template: {
                    ClassName: { label: 'Dino Class Name', placeholder: 'DinoCharacterBP_C' },
                    Multiplier: { label: 'Resistance Multiplier', placeholder: '0.5' }
                }
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowUnlimitedRespecs',
                label: 'Unlimited Mindwipes',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow unlimited mindwipe tonics'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bDisableDinoDecayPvE',
                label: 'Disable Dino Decay',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Disable dino decay in PvE'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bPassiveDefensesDamageRiderlessDinos',
                label: 'Spike Walls Damage Riderless Dinos',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Spike walls and passive defenses damage riderless/wild dinos. Does NOT affect turrets.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bUseSingleplayerSettings',
                label: 'Singleplayer Settings',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Use singleplayer-like rates'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bDisableStructurePlacementCollision',
                label: 'Disable Placement Collision',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow overlapping structures'
            }
        ]
    }
];

// Helper to get all config groups for a specific category
export function getGroupsByCategory(category: string) {
    return [
        ...GAME_USER_SETTINGS_SCHEMA.filter(g => g.category === category).map(g => ({ ...g, source: 'GameUserSettings' as const })),
        ...GAME_INI_SCHEMA.filter(g => g.category === category).map(g => ({ ...g, source: 'Game' as const }))
    ];
}

// Helper to get all categories with their groups
export function getAllCategories(): { category: string; info: typeof CATEGORY_INFO[string]; groups: ConfigGroup[] }[] {
    return Object.entries(CATEGORY_INFO).map(([category, info]) => ({
        category,
        info,
        groups: getGroupsByCategory(category)
    })).filter(c => c.groups.length > 0);
}

// Parse INI content into key-value map
// Handles duplicate keys by joining values with \n
export function parseIniContent(content: string): Map<string, Map<string, string>> {
    const sections = new Map<string, Map<string, string>>();
    let currentSection = '';

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSection = trimmed.slice(1, -1);
            if (!sections.has(currentSection)) {
                sections.set(currentSection, new Map());
            }
        } else if (trimmed.includes('=') && currentSection) {
            const [key, ...valueParts] = trimmed.split('=');
            const cleanKey = key.trim();
            const value = valueParts.join('='); // Rejoin value in case it contained =
            const cleanValue = value.trim();

            const sectionMap = sections.get(currentSection);
            if (sectionMap) {
                if (sectionMap.has(cleanKey)) {
                    // Key already exists, this is a duplicate (multiline)
                    const existingValue = sectionMap.get(cleanKey);
                    sectionMap.set(cleanKey, existingValue + '\n' + cleanValue);
                } else {
                    sectionMap.set(cleanKey, cleanValue);
                }
            }
        }
    }

    return sections;
}

// Generate INI content from sections map
// Handles multiline values (containing \n) by splitting into duplicate keys
export function generateIniContent(sections: Map<string, Map<string, string>>): string {
    let content = '';

    for (const [section, values] of sections) {
        content += `[${section}]\n`;
        for (const [key, value] of values) {
            if (value.includes('\n')) {
                // Handle multiline values as duplicates
                const parts = value.split('\n');
                for (const part of parts) {
                    if (part.trim()) {
                        content += `${key}=${part.trim()}\n`;
                    }
                }
            } else {
                content += `${key}=${value}\n`;
            }
        }
        content += '\n';
    }

    return content;
}
