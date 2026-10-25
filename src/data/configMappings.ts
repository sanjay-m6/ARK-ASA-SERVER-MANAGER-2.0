// Configuration schema types and mappings for ARK Server settings
// Enhanced with sliders, dropdowns, and categories for Visual Settings Manager

export type FieldType = 'text' | 'number' | 'boolean' | 'slider' | 'dropdown' | 'array' | 'textarea' | 'crafting_costs' | 'engram_entries' | 'loot_crates' | 'dino_spawns' | 'engram_points_per_level' | 'item_stack_overrides';

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
    category: 'server' | 'gameplay' | 'player' | 'dino' | 'breeding' | 'structure' | 'pvp' | 'rules' | 'chat' | 'transfers' | 'advanced' | 'engrams' | 'environment';
    icon?: string;
    source?: 'GameUserSettings' | 'Game';
    fields: ConfigField[];
}

export type ConfigCategory = {
    category: string;
    info: { label: string; icon: string; color: string };
    groups: ConfigGroup[];
};

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
    engrams: { label: 'Engrams & Crafting', icon: '🔨', color: 'from-yellow-500 to-amber-600' },
    environment: { label: 'World & Environment', icon: '🌍', color: 'from-green-600 to-emerald-500' },
};

// GameUserSettings.ini schema - Enhanced with sliders and categories
export const GAME_USER_SETTINGS_SCHEMA: ConfigGroup[] = [
    {
        title: 'Server Identity',
        description: 'Basic server configuration',
        category: 'server',
        fields: [
            {
                section: 'SessionSettings',
                key: 'SessionName',
                label: 'Server Name',
                type: 'text',
                defaultValue: 'ARK Server',
                description: 'The name of your server'
            },
            {
                section: 'ServerSettings',
                key: 'MapName',
                label: 'Map',
                type: 'dropdown',
                defaultValue: 'TheIsland_WP',
                description: 'The map to load on the server',
                options: [
                    // Official Release Maps
                    { value: 'TheIsland_WP', label: 'The Island', group: 'released' },
                    { value: 'ScorchedEarth_WP', label: 'Scorched Earth', group: 'released' },
                    { value: 'TheCenter_WP', label: 'The Center', group: 'released' },
                    { value: 'Aberration_WP', label: 'Aberration', group: 'released' },
                    { value: 'Extinction_WP', label: 'Extinction', group: 'released' },
                    { value: 'Astraeos_WP', label: 'Astraeos', group: 'released' },
                    { value: 'Ragnarok_WP', label: 'Ragnarok', group: 'released' },
                    { value: 'Valguero_WP', label: 'Valguero', group: 'released' },
                    { value: 'Genesis_WP', label: 'Genesis Part 1', group: 'released' },
                    { value: 'ClubARK_WP', label: 'Club ARK', group: 'released' },

                    // Premium Mod Maps
                    { value: 'LostColony_WP', label: 'Lost Colony', group: 'premium' },
                    { value: 'Forglar_WP', label: 'Forglar', group: 'premium' },
                    { value: 'TemptressLagoon_WP', label: 'Temptress Lagoon', group: 'premium' },
                    { value: 'Reverence_WP', label: 'Reverence', group: 'premium' },

                    // Modded Expansion Maps
                    { value: 'TheIslandReforged_WP', label: 'The Island Reforged', group: 'modded' },
                    { value: 'ScorchedEarthRM_WP', label: 'Scorched Earth Reborn', group: 'modded' },
                    { value: 'Svartalfheim_WP', label: 'Svartalfheim', group: 'modded' },
                    { value: 'Amissa_WP', label: 'Amissa', group: 'modded' },
                    { value: 'Insaluna_WP', label: 'Insaluna', group: 'modded' },
                    { value: 'Bjarnheim_WP', label: 'Bjarnheim', group: 'modded' },
                    { value: 'Althemia_WP', label: 'Althemia', group: 'modded' },
                    { value: 'Vanna_WP', label: 'Vanna', group: 'modded' },
                    { value: 'TaeniaStella_WP', label: 'TaeniaStella', group: 'modded' },

                    // Upcoming Official Maps (Roadmap)
                    { value: 'Genesis2_WP', label: 'Genesis Part 2', group: 'upcoming' },
                    { value: 'Fjordur_WP', label: 'Fjordur', group: 'upcoming' },
                    { value: 'CrystalIsles_WP', label: 'Crystal Isles', group: 'upcoming' },
                    { value: 'LostIsland_WP', label: 'Lost Island', group: 'upcoming' },

                    // Custom / Mod Map
                    { value: '__CUSTOM__', label: 'Custom Map / Mod Map...', group: 'custom' },
                ]
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
                section: 'MessageOfTheDay',
                key: 'Duration',
                label: 'MOTD Duration (seconds)',
                type: 'number',
                defaultValue: '20',
                description: 'How many seconds the Message of the Day stays on screen after a player joins.'
            },
            {
                section: 'ServerSettings',
                key: 'Port',
                label: 'Game Port',
                type: 'number',
                defaultValue: '7777',
                description: 'Main game port for player connections (default: 7777)'
            },
            {
                section: 'ServerSettings',
                key: 'QueryPort',
                label: 'Query Port',
                type: 'number',
                defaultValue: '27015',
                description: 'Port for server browser queries (default: 27015)'
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
                key: 'IPAddress',
                label: 'Server IP Address',
                type: 'text',
                defaultValue: '',
                description: 'Local network adapter IP to bind to (e.g., 192.168.1.50). Leave EMPTY for standard setups. Do NOT enter your Public WAN IP.'
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
                key: 'RCONServerGameLogBuffer',
                label: 'RCON Game Log Buffer',
                type: 'number',
                defaultValue: '600',
                description: 'Number of game log lines kept and sent through RCON.'
            },
            {
                section: 'ServerSettings',
                key: 'ServerCrossplay',
                label: 'Enable Crossplay',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow Xbox, PlayStation, and PC (Epic/Steam) players to join together. Requires the server to use Epic/Xbox crossplay binaries.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#ServerSettings'
            },
            {
                section: 'ServerSettings',
                key: 'Culture',
                label: 'Server Language (Culture)',
                type: 'dropdown',
                defaultValue: '',
                options: [
                    { value: '', label: 'Default (English)' },
                    { value: 'en', label: 'English' },
                    { value: 'zh-Hant', label: 'Traditional Chinese (繁體中文)' },
                    { value: 'zh-Hans', label: 'Simplified Chinese (简体中文)' },
                    { value: 'fr', label: 'French (Français)' },
                    { value: 'de', label: 'German (Deutsch)' },
                    { value: 'es', label: 'Spanish (Español)' },
                    { value: 'it', label: 'Italian (Italiano)' },
                    { value: 'ja', label: 'Japanese (日本語)' },
                    { value: 'ko', label: 'Korean (한국어)' },
                    { value: 'pt-BR', label: 'Portuguese-Brazil (Português-Brasil)' },
                    { value: 'ru', label: 'Russian (Русский)' },
                    { value: 'tr', label: 'Turkish (Türkçe)' }
                ],
                description: 'Sets the in-game language/culture for the server logs, messages, and elements (appends -culture launch argument)',
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
        title: 'Custom Dino Levels Mod',
        description: 'Configure dinosaur level distribution (for the Custom Dino Levels mod)',
        category: 'dino',
        fields: [
            {
                section: 'CustomLevelDistrib',
                key: 'WantsEqualLevels',
                label: 'Wants Equal Levels',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Gives every level an equal chance to spawn. Recommended for custom Min/Max ranges.'
            },
            {
                section: 'CustomLevelDistrib',
                key: 'WantsRagLevels',
                label: 'Wants Ragnarok Levels',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Mimics the Ragnarok level distribution (higher levels are more common than vanilla).'
            },
            {
                section: 'CustomLevelDistrib',
                key: 'WantsHighLevels',
                label: 'Wants High Levels',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Skew spawns heavily towards higher levels.'
            },
            {
                section: 'CustomLevelDistrib',
                key: 'MinLevel',
                label: 'Min Level (Base)',
                type: 'slider',
                defaultValue: '1.0',
                min: 1,
                max: 150,
                step: 1,
                description: 'Base minimum level. For standard level 150 servers (Difficulty 5), keep this at 1 to allow level 5 spawns (1 × 5 = 5). Set to 30 to only allow level 150 spawns (30 × 5 = 150).'
            },
            {
                section: 'CustomLevelDistrib',
                key: 'MaxLevel',
                label: 'Max Level (Base)',
                type: 'slider',
                defaultValue: '30.0',
                min: 1,
                max: 150,
                step: 1,
                description: 'Base maximum level. For standard level 150 servers (Difficulty 5), this MUST be 30 (30 × 5 = 150). Setting this directly to 150 with Difficulty 5 will scale wild dino levels up to 750!'
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
            },
            {
                section: 'ServerSettings',
                key: 'TheMaxStructuresInRange',
                label: 'Max Structures In Range',
                type: 'number',
                defaultValue: '10500',
                description: 'Maximum number of structures that can be built within the (hard-coded) range. Replaces NewMaxStructuresInRange.'
            },
            {
                section: 'ServerSettings',
                key: 'IgnoreLimitMaxStructuresInRangeTypeFlag',
                label: 'Ignore Decorative Structure Limit',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, removes the 150 limit for decorative structures (flags, signs, dermis, etc.).'
            },
            {
                section: 'ServerSettings',
                key: 'StructurePickupTimeAfterPlacement',
                label: 'Quick Pickup Window (seconds)',
                type: 'number',
                defaultValue: '30',
                description: 'How many seconds after placement a structure can still be quickly picked up.'
            },
            {
                section: 'ServerSettings',
                key: 'StructurePickupHoldDuration',
                label: 'Quick Pickup Hold Duration',
                type: 'slider',
                defaultValue: '0.5',
                min: 0,
                max: 10,
                step: 0.1,
                description: 'How long (seconds) the use key must be held to quick pick up a structure. 0 = instant.'
            },
            {
                section: 'ServerSettings',
                key: 'PlatformSaddleBuildAreaBoundsMultiplier',
                label: 'Platform Saddle Build Area',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Higher values allow structures to be placed farther away from platform saddles.'
            },
            {
                section: 'ServerSettings',
                key: 'StructurePreventResourceRadiusMultiplier',
                label: 'Structure Resource Prevention Radius',
                type: 'slider',
                defaultValue: '1',
                min: 0,
                max: 10,
                step: 0.1,
                description: 'Multiplier for the radius around structures where resources do not respawn (stacks with ResourceNoReplenishRadiusStructures in Game.ini).'
            },
            {
                section: 'ServerSettings',
                key: 'EnableExtraStructurePreventionVolumes',
                label: 'Extra Build Prevention Zones',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, disables building in specific resource-rich areas (e.g. around the major mountains on The Island).'
            }
        ]
    },
    {
        title: 'Cryopods & Stasis',
        description: 'Configure Cryopod stasis, fridge requirements, and cooldowns',
        category: 'gameplay',
        // Only keys documented for ASA on ark.wiki.gg (Server configuration). The previous entries
        // (DisableCryopodStasis, DisableCryopodStructureRequirement, DisableCryopods, CryopodCooldown,
        // AllowCryoCooldownOnPvE, EnableCryoSicknessPVP) are not real server options and had no effect.
        fields: [
            {
                section: 'ServerSettings',
                key: 'DisableCryopodFridgeRequirement',
                label: 'Use Cryopods Without a Cryofridge',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If True, cryopods can be used without being in range of a powered Cryofridge.'
            },
            {
                section: 'ServerSettings',
                key: 'DisableCryopodEnemyCheck',
                label: 'Disable Enemy Check',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If True, cryopods can be used while enemies are nearby.'
            },
            {
                section: 'ServerSettings',
                key: 'AllowCryoFridgeOnSaddle',
                label: 'Allow Cryofridge on Platform Saddles',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If True, Cryofridges can be built on platform saddles and rafts.'
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
        title: 'Spoilage & World Resources',
        description: 'Spoilage, decomposition, hair growth, and resource respawn radius',
        category: 'environment',
        fields: [
            {
                section: 'ServerSettings',
                key: 'HairGrowthSpeedMultiplier',
                label: 'Hair Growth Speed',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1, max: 10, step: 0.1,
                description: 'How fast player hair grows'
            },
            {
                section: 'ServerSettings',
                key: 'GlobalSpoilingTimeMultiplier',
                label: 'Global Spoiling Time',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1, max: 10, step: 0.1,
                description: 'Global multiplier for item spoilage time'
            },
            {
                section: 'ServerSettings',
                key: 'GlobalItemDecompositionTimeMultiplier',
                label: 'Item Decomp Time',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1, max: 10, step: 0.1,
                description: 'Global multiplier for item decomposition time on floor'
            },
            {
                section: 'ServerSettings',
                key: 'GlobalCorpseDecompositionTimeMultiplier',
                label: 'Corpse Decomp Time',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1, max: 10, step: 0.1,
                description: 'Global multiplier for corpse decomposition time on floor'
            },
            {
                section: 'ServerSettings',
                key: 'ResourceNoReplenishRadiusPlayers',
                label: 'Resource No Replenish (Players)',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1, max: 10, step: 0.1,
                description: 'Radius around players where resources do not respawn'
            },
            {
                section: 'ServerSettings',
                key: 'ResourceNoReplenishRadiusStructures',
                label: 'Resource No Replenish (Structures)',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1, max: 10, step: 0.1,
                description: 'Radius around structures where resources do not respawn'
            },
            {
                section: 'ServerSettings',
                key: 'GreaterRiftActivationMultiplier',
                label: 'Greater Rift Interval',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Scales the interval between Greater Rift activations. Lower = more frequent, higher = rarer.'
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
                key: 'ServerPVE',
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
                key: 'AllowCaveBuildingPvP',
                label: 'Allow Cave Building (PvP)',
                type: 'boolean',
                defaultValue: 'True',
                description: 'If disabled, prevents building in caves when PvP is enabled.'
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
            },
            {
                section: 'ServerSettings',
                key: 'PreventOfflinePvP',
                label: 'Prevent Offline PvP',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Protect structures and players when owners are offline. Great for weekday protection on PvP servers.'
            },
            {
                section: 'ServerSettings',
                key: 'PreventOfflinePvPInterval',
                label: 'Offline Protection Delay (seconds)',
                type: 'slider',
                defaultValue: '0',
                min: 0,
                max: 900,
                step: 60,
                description: 'Delay before offline protection activates (0 = immediate)'
            },
            {
                section: 'ServerSettings',
                key: 'PvPDinoDecay',
                label: 'PvP Dino Decay',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, tamed creatures decay in PvP while Offline Raid Prevention is active.'
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
                key: 'DontAlwaysNotifyPlayerJoined',
                label: 'Don\'t Notify Player Joined',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, globally disables the "player joined" notifications.'
            },
            {
                section: 'ServerSettings',
                key: 'AdminLogging',
                label: 'Admin Logging',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, all admin commands are logged to the in-game chat.'
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
                key: 'ServerForceNoHUD',
                label: 'Force No HUD',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, the HUD (floating names/info) is always hidden for non-tribe-owned NPCs.'
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
                defaultValue: 'False',
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
            },
            {
                section: 'ServerSettings',
                key: 'ServerHardcore',
                label: 'Hardcore Mode',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, characters are reset to level 1 when they die.'
            },
            {
                section: 'ServerSettings',
                key: 'PreventSpawnAnimations',
                label: 'Disable Spawn Animations',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, players respawn without the wake-up animation.'
            },
            {
                section: 'ServerSettings',
                key: 'RandomSupplyCratePoints',
                label: 'Random Supply Crate Locations',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, supply drops spawn at random locations. Can make some artifact caves inaccessible on certain maps.'
            },
            {
                section: 'ServerSettings',
                key: 'TribeNameChangeCooldown',
                label: 'Tribe Rename Cooldown (minutes)',
                type: 'number',
                defaultValue: '15',
                description: 'Minutes a tribe must wait between name changes.'
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
                key: 'PreventUploadSurvivors',
                label: 'Prevent Survivor Uploads',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, survivors cannot be uploaded to ARK Data (Obelisks/transmitters).'
            },
            {
                section: 'ServerSettings',
                key: 'PreventUploadItems',
                label: 'Prevent Item Uploads',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, items cannot be uploaded to ARK Data.'
            },
            {
                section: 'ServerSettings',
                key: 'PreventUploadDinos',
                label: 'Prevent Dino Uploads',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, tamed creatures cannot be uploaded to ARK Data.'
            },
            {
                section: 'ServerSettings',
                key: 'CrossARKAllowForeignDinoDownloads',
                label: 'Allow Foreign Dinos',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Allow non-native dinos to be downloaded (e.g. allowing foreign dinos on Aberration or Island). Set to False on Aberration to block foreign dino downloads.'
            }
        ]
    },
    {
        title: 'Dino Feeding & Decay Rules',
        description: 'Raid dino feeding and dino decay prevention',
        category: 'dino',
        fields: [
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
                key: 'PvEDinoDecayPeriodMultiplier',
                label: 'PvE Dino Decay Period',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier for how long tamed creatures take to decay in PvE (requires DisableDinoDecayPvE = false).'
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
            },
            {
                section: 'ServerSettings',
                key: 'ListenServerTetherDistanceMultiplier',
                label: 'Tether Distance (Non-Dedicated)',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Scales the tether distance between host and players. Only affects non-dedicated (hosted) sessions.'
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
    },
];

export const GAME_INI_SCHEMA: ConfigGroup[] = [
    {
        title: 'Engrams & Crafting',
        description: 'Modify engram requirements and item crafting costs',
        category: 'engrams',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAutoUnlockAllEngrams',
                label: 'Auto-Unlock All Engrams',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Automatically unlock all engrams for players as they level up.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowUnlimitedRespecs',
                label: 'Unlimited Respecs',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Removes the cooldown timer for the Mindwipe Tonic, allowing unlimited resets.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowCustomRecipes',
                label: 'Allow Custom Recipes',
                type: 'boolean',
                defaultValue: 'True',
                description: 'Allow players to create custom consumable recipes.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CraftingSkillBonusMultiplier',
                label: 'Crafting Skill Bonus Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier for crafting skill effects on custom recipe stats.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CustomRecipeEffectivenessMultiplier',
                label: 'Custom Recipe Effectiveness',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier for the effectiveness of custom recipes (food/drinks).'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CustomRecipeSkillMultiplier',
                label: 'Custom Recipe Skill',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier for the effect of the Crafting Skill stat in the custom recipe formula.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'OverrideNamedEngramEntries',
                label: 'Engram Overrides',
                type: 'engram_entries',
                defaultValue: '',
                description: 'Override engram level requirements, point costs, or hide them entirely.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'ConfigOverrideItemCraftingCosts',
                label: 'Crafting Cost Overrides',
                type: 'crafting_costs',
                defaultValue: '',
                description: 'Override the resource costs to craft specific items.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'ConfigOverrideItemMaxQuantity',
                label: 'Item Stack Size Overrides',
                type: 'item_stack_overrides',
                defaultValue: '',
                description: 'Set the max stack size of specific items (e.g. raw meat 40 → 200), optionally ignoring the global ItemStackSizeMultiplier.'
            }
        ]
    },
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
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'ExplorerNoteXPMultiplier',
                label: 'Explorer Note XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for XP gained from collecting explorer notes.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'BossKillXPMultiplier',
                label: 'Boss Kill XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for XP gained from killing bosses.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'AlphaKillXPMultiplier',
                label: 'Alpha Kill XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for XP gained from killing alpha creatures.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'WildKillXPMultiplier',
                label: 'Wild Kill XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for XP gained from killing wild creatures.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'CaveKillXPMultiplier',
                label: 'Cave Kill XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for XP gained from killing creatures inside caves.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'TamedKillXPMultiplier',
                label: 'Tamed Kill XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for XP gained from killing tamed creatures.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'UnclaimedKillXPMultiplier',
                label: 'Unclaimed Kill XP Multiplier',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 100,
                step: 0.1,
                description: 'Multiplier for XP gained from killing unclaimed creatures.'
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
            },
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
                key: 'MatingSpeedMultiplier',
                label: 'Mating Speed',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'How fast tamed creatures mate (fill the mating bar). Higher = faster.'
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
                key: 'AllowAnyoneBabyImprintCuddle',
                label: 'Anyone Can Imprint',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow any tribe member to imprint babies'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'DisableImprintDinoBuff',
                label: 'Disable Imprint Bonus',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Remove stat bonuses from imprinting'
            }
        ]
    },
    {
        title: 'Player Settings',
        description: 'Player customization and behavior in Game.ini',
        category: 'player',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowSpeedLeveling',
                label: 'Allow Speed Leveling',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow leveling movement speed for players and land dinos (ASA/ASE)'
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
                key: 'PlayerHarvestingDamageMultiplier',
                label: 'Player Harvesting Damage',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier for the damage players deal to harvestable resources. Higher = faster gathering.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bDisablePhotoMode',
                label: 'Disable Photo Mode',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, players cannot use Photo Mode.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'PhotoModeRangeLimit',
                label: 'Photo Mode Range Limit',
                type: 'number',
                defaultValue: '3000',
                description: 'Maximum distance (Unreal units) the Photo Mode camera can move away from the player.'
            }
        ]
    },
    {
        title: 'Dino Settings',
        description: 'Dino customization and behavior in Game.ini',
        category: 'dino',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAllowFlyerSpeedLeveling',
                label: 'Allow Flyer Speed Leveling',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow leveling movement speed on flyers (ASA/ASE)'
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
                key: 'bUseDinoLevelUpAnimations',
                label: 'Dino Level-Up Animations',
                type: 'boolean',
                defaultValue: 'True',
                description: 'If disabled, tamed creatures skip the level-up animation.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bFlyerPlatformAllowUnalignedDinoBasing',
                label: 'Allow Unaligned Dinos on Flying Platforms',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, any non-allied tamed creature can stand on a Quetzal platform saddle while it is flying.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'DestroyTamesOverLevelClamp',
                label: 'Destroy Tames Over Level',
                type: 'number',
                defaultValue: '0',
                description: 'Tamed creatures above this level are deleted when the server starts. 0 = disabled (official servers use 450).'
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
                key: 'DinoSpawnWeightMultipliers',
                label: 'Dino Spawn Weight Multipliers',
                type: 'array',
                defaultValue: '',
                description: 'Customize the spawn rate and limits for specific dino classes.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#DinoSpawnWeightMultipliers',
                template: {
                    DinoNameTag: { label: 'Dino Tag/Name', placeholder: 'Dodo' },
                    SpawnLimitPercentage: { label: 'Spawn Limit %', placeholder: '1.0' },
                    SpawnWeightMultiplier: { label: 'Spawn Weight Mult', placeholder: '1.0' },
                    OverrideSpawnLimitPercentage: { label: 'Override Limit % (True/False)', placeholder: 'True' }
                }
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'DinoClassDamageMultipliers',
                label: 'Wild Dino Damage Multipliers',
                type: 'array',
                defaultValue: '',
                description: 'Adjust damage dealt by specific wild dino classes.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#DinoClassDamageMultipliers',
                template: {
                    ClassName: { label: 'Dino Class Name', placeholder: 'DinoCharacterBP_C' },
                    Multiplier: { label: 'Damage Multiplier', placeholder: '1.0' }
                }
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'DinoClassResistanceMultipliers',
                label: 'Wild Dino Resistance Multipliers',
                type: 'array',
                defaultValue: '',
                description: 'Adjust resistance (damage taken) for specific wild dino classes (lower = more resistant).',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#DinoClassResistanceMultipliers',
                template: {
                    ClassName: { label: 'Dino Class Name', placeholder: 'DinoCharacterBP_C' },
                    Multiplier: { label: 'Resistance Multiplier', placeholder: '1.0' }
                }
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'TamedDinoClassDamageMultipliers',
                label: 'Tamed Dino Damage Multipliers',
                type: 'array',
                defaultValue: '',
                description: 'Adjust damage dealt by specific tamed dino classes.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#TamedDinoClassDamageMultipliers',
                template: {
                    ClassName: { label: 'Dino Class Name', placeholder: 'DinoCharacterBP_C' },
                    Multiplier: { label: 'Damage Multiplier', placeholder: '1.0' }
                }
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'TamedDinoClassResistanceMultipliers',
                label: 'Tamed Dino Resistance Multipliers',
                type: 'array',
                defaultValue: '',
                description: 'Adjust resistance (damage taken) for specific tamed dino classes (lower = more resistant).',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#TamedDinoClassResistanceMultipliers',
                template: {
                    ClassName: { label: 'Dino Class Name', placeholder: 'DinoCharacterBP_C' },
                    Multiplier: { label: 'Resistance Multiplier', placeholder: '1.0' }
                }
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'NPCReplacements',
                label: 'NPC Replacements',
                type: 'array',
                defaultValue: '',
                description: 'Replace or disable specific dinosaur spawn classes.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#NPCReplacements',
                template: {
                    FromClassName: { label: 'From Class Name', placeholder: 'DinoCharacterBP_C' },
                    ToClassName: { label: 'To Class Name (Empty to disable)', placeholder: 'Saber_Character_BP_C' }
                }
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'PreventDinoTameClassNames',
                label: 'Prevent Dino Taming Classes',
                type: 'textarea',
                defaultValue: '',
                description: 'List of dino class names that cannot be tamed. Enter one class name per line.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#PreventDinoTameClassNames'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'ExcludeDinoClasses',
                label: 'Exclude Dino Spawn Classes',
                type: 'textarea',
                defaultValue: '',
                description: 'List of dino class names to prevent from spawning entirely. Enter one class name per line.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#ExcludeDinoClasses'
            }
        ]
    },
    {
        title: 'PvP/PvE Settings',
        description: 'Combat settings in Game.ini',
        category: 'pvp',
        fields: [
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
                key: 'bDisableFriendlyFire',
                label: 'Disable Friendly Fire (PvP)',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, prevents friendly-fire damage among tribemates, their tames and structures.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bPvEAllowTribeWar',
                label: 'Allow Tribe Wars (PvE)',
                type: 'boolean',
                defaultValue: 'True',
                description: 'If disabled, tribes cannot declare war on each other on PvE servers.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bPvEAllowTribeWarCancel',
                label: 'Allow Cancelling Tribe Wars (PvE)',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, an agreed tribe war can be cancelled before it starts.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bIncreasePvPRespawnInterval',
                label: 'Increase PvP Respawn Interval',
                type: 'boolean',
                defaultValue: 'True',
                description: 'If enabled, players killed repeatedly by enemies in PvP get an extra respawn wait time.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'IncreasePvPRespawnIntervalCheckPeriod',
                label: 'PvP Respawn Check Period (seconds)',
                type: 'number',
                defaultValue: '300',
                description: 'Time window (seconds) in which repeated deaths increase the respawn interval.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'IncreasePvPRespawnIntervalMultiplier',
                label: 'PvP Respawn Interval Multiplier',
                type: 'slider',
                defaultValue: '2',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier applied to the extra PvP respawn time on each repeated death.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'IncreasePvPRespawnIntervalBaseAmount',
                label: 'PvP Respawn Base Amount (seconds)',
                type: 'number',
                defaultValue: '60',
                description: 'Base extra respawn time (seconds) added in PvP.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAutoPvETimer',
                label: 'Scheduled PvE Mode',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, the server switches to PvE during the configured time window (PvPvE servers).'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bAutoPvEUseSystemTime',
                label: 'Scheduled PvE Uses System Time',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, the PvE schedule uses the server system time instead of the in-game time.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'AutoPvEStartTimeSeconds',
                label: 'Scheduled PvE Start (seconds)',
                type: 'slider',
                defaultValue: '0',
                min: 0,
                max: 86400,
                step: 60,
                description: 'Time of day (seconds since midnight, 0-86400) when PvE mode starts.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'AutoPvEStopTimeSeconds',
                label: 'Scheduled PvE Stop (seconds)',
                type: 'slider',
                defaultValue: '0',
                min: 0,
                max: 86400,
                step: 60,
                description: 'Time of day (seconds since midnight, 0-86400) when PvE mode ends.'
            }
        ]
    },
    {
        title: 'Structure Settings',
        description: 'Structure and building tweaks in Game.ini',
        category: 'structure',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bDisableStructurePlacementCollision',
                label: 'Disable Placement Collision',
                type: 'boolean',
                defaultValue: 'False',
                description: 'Allow overlapping structures'
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
                key: 'bAllowPlatformSaddleMultiFloors',
                label: 'Allow Multi-Floor Platform Saddles',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, multiple floors can be built on platform saddles.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bIgnoreStructuresPreventionVolumes',
                label: 'Ignore Build Prevention Zones',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, allows building in areas where it is normally blocked (e.g. around Obelisks, in some caves).'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'StructureDamageRepairCooldown',
                label: 'Structure Repair Cooldown (seconds)',
                type: 'number',
                defaultValue: '180',
                description: 'Seconds a structure must wait after taking damage before it can be repaired. 0 = no cooldown.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'PvPZoneStructureDamageMultiplier',
                label: 'Cave Structure Damage (PvP)',
                type: 'slider',
                defaultValue: '6',
                min: 0,
                max: 20,
                step: 0.1,
                description: 'Multiplier for the damage structures take inside caves (PvP zones). Lower = less damage.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bLimitTurretsInRange',
                label: 'Limit Turrets In Range',
                type: 'boolean',
                defaultValue: 'True',
                description: 'If enabled, limits how many turrets can be placed within a given range.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bHardLimitTurretsInRange',
                label: 'Hard Turret Limit',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, the turret limit is enforced retroactively (turrets over the limit are disabled).'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'LimitTurretsRange',
                label: 'Turret Limit Range',
                type: 'number',
                defaultValue: '10000',
                description: 'Radius (Unreal units) in which turrets count toward the limit.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'LimitTurretsNum',
                label: 'Max Turrets In Range',
                type: 'number',
                defaultValue: '100',
                description: 'Maximum number of turrets allowed within the turret limit range.'
            }
        ]
    },
    {
        title: 'Gameplay Rules',
        description: 'Server gameplay rules in Game.ini',
        category: 'rules',
        fields: [
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
                key: 'bDisableLootCrates',
                label: 'Disable Loot Crates',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, loot crates (beacons) no longer spawn. Artifact crates still spawn.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'FuelConsumptionIntervalMultiplier',
                label: 'Fuel Consumption Interval',
                type: 'slider',
                defaultValue: '1',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'Multiplier for the interval between fuel consumption. Higher = fuel lasts longer.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'bShowCreativeMode',
                label: 'Show Creative Mode Button',
                type: 'boolean',
                defaultValue: 'False',
                description: 'If enabled, adds a button to the pause menu to toggle creative mode.'
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
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'PoopIntervalMultiplier',
                label: 'Poop Interval',
                type: 'slider',
                defaultValue: '1.0',
                min: 0.1,
                max: 10,
                step: 0.1,
                description: 'How often dinos and players poop'
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
                key: 'OverrideMaxExperiencePointsDino',
                label: 'Max Dino XP',
                type: 'number',
                defaultValue: '',
                description: 'Overrides the maximum XP cap for tamed creatures (exact value). Leave empty for the game default.'
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
                type: 'engram_points_per_level',
                defaultValue: '',
                description: 'Engram points granted for each level up. Configures repeated OverridePlayerLevelEngramPoints entries in Game.ini.',
                wikiLink: 'https://ark.wiki.gg/wiki/Server_configuration#OverridePlayerLevelEngramPoints'
            }
        ]
    },
    {
        title: 'World Overrides',
        description: 'Configure custom loot crates and dino spawns',
        category: 'environment',
        fields: [
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'ConfigOverrideSupplyCrateItems',
                label: 'Loot Crate Overrides',
                type: 'loot_crates',
                description: 'Override the contents of supply drops and loot crates.'
            },
            {
                section: '/Script/ShooterGame.ShooterGameMode',
                key: 'NPCReplacements',
                label: 'Dino Spawn Replacements',
                type: 'dino_spawns',
                description: 'Replace or remove specific dinosaurs from spawning.'
            }
        ]
    },
    {
        title: 'Loot Quality',
        description: 'Supply crate and fishing loot quality in Game.ini',
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
                description: 'Supply crate loot quality. WARNING: Values above 2.0 can glitch beaver dams (no cementing paste), alphas (no loot), wyverns (no milk), and cause drops to despawn.'
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
                description: 'Fishing loot quality. WARNING: High values can cause item requirements to overflow and break loot tables.'
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

// Helper to check if a key belongs to a textarea field
export function isTextareaField(key: string): boolean {
    const allGroups = [...GAME_USER_SETTINGS_SCHEMA, ...GAME_INI_SCHEMA];
    for (const group of allGroups) {
        for (const field of group.fields) {
            if (field.key === key && field.type === 'textarea') {
                return true;
            }
        }
    }
    return false;
}

// Helper to get all categories with their groups
export function getAllCategories(): { category: string; info: typeof CATEGORY_INFO[string]; groups: ConfigGroup[] }[] {
    return Object.entries(CATEGORY_INFO).map(([category, info]) => ({
        category,
        info,
        groups: getGroupsByCategory(category)
    })).filter(c => c.groups.length > 0);
}

// Build canonical lookup dictionaries for known sections and keys
const CANONICAL_SECTIONS = new Map<string, string>();
const CANONICAL_KEYS = new Map<string, string>();

function registerCanonicalName(section: string, key?: string) {
    if (section) {
        CANONICAL_SECTIONS.set(section.toLowerCase(), section);
    }
    if (key) {
        CANONICAL_KEYS.set(key.toLowerCase(), key);
        if (section) {
            CANONICAL_KEYS.set(`${section.toLowerCase()}.${key.toLowerCase()}`, key);
        }
    }
}

// Pre-register well-known section names
['ServerSettings', 'SessionSettings', '/Script/ShooterGame.ShooterGameMode', 'URL', 'Multipliers', 'MessageOfTheDay', '/Script/Engine.GameSession', '/Script/ShooterGame.ShooterGameUserSettings', 'RCON'].forEach(s => registerCanonicalName(s));

// Pre-register all sections and keys from schemas
[...GAME_USER_SETTINGS_SCHEMA, ...GAME_INI_SCHEMA].forEach(group => {
    group.fields.forEach(field => {
        registerCanonicalName(field.section, field.key);
    });
});

export function getCanonicalSectionName(section: string): string {
    const trimmed = section.trim();
    return CANONICAL_SECTIONS.get(trimmed.toLowerCase()) || trimmed;
}

// Known legacy or incorrect key aliases mapped to official ARK keys
const KEY_ALIASES = new Map<string, string>([
    ['disablecryopodstructurerequirement', 'DisableCryopodFridgeRequirement'],
    ['serversettings.disablecryopodstructurerequirement', 'DisableCryopodFridgeRequirement'],
    ['disablecryopodstasis', 'DisableCryopodFridgeRequirement'],
    ['serversettings.disablecryopodstasis', 'DisableCryopodFridgeRequirement'],
]);

export function getCanonicalKeyName(section: string, key: string): string {
    const trimmedKey = key.trim();
    const trimmedSec = section.trim();
    const alias = KEY_ALIASES.get(`${trimmedSec.toLowerCase()}.${trimmedKey.toLowerCase()}`)
        || KEY_ALIASES.get(trimmedKey.toLowerCase());
    if (alias) return alias;
    return CANONICAL_KEYS.get(`${trimmedSec.toLowerCase()}.${trimmedKey.toLowerCase()}`)
        || CANONICAL_KEYS.get(trimmedKey.toLowerCase())
        || trimmedKey;
}

/**
 * Map implementation with case-insensitive string keys while preserving canonical/insertion casing.
 */
export class CaseInsensitiveMap<T> extends Map<string, T> {
    private keyCaseMap = new Map<string, string>();

    constructor(entries?: Iterable<readonly [string, T]> | Map<string, T> | null) {
        super();
        if (entries) {
            const iter = entries instanceof Map ? entries.entries() : entries;
            for (const [k, v] of iter) {
                this.set(k, v);
            }
        }
    }

    clone(): CaseInsensitiveMap<T> {
        const copy = new CaseInsensitiveMap<T>();
        for (const [k, v] of this.entries()) {
            copy.set(k, v);
        }
        return copy;
    }

    set(key: string, value: T): this {
        const lower = key.toLowerCase();
        const existingKey = this.keyCaseMap.get(lower);
        if (existingKey && existingKey !== key) {
            super.delete(existingKey);
        }
        this.keyCaseMap.set(lower, key);
        super.set(key, value);
        return this;
    }

    get(key: string): T | undefined {
        const lower = key.toLowerCase();
        const actualKey = this.keyCaseMap.get(lower);
        return actualKey ? super.get(actualKey) : super.get(key);
    }

    has(key: string): boolean {
        const lower = key.toLowerCase();
        return this.keyCaseMap.has(lower) || super.has(key);
    }

    delete(key: string): boolean {
        const lower = key.toLowerCase();
        const actualKey = this.keyCaseMap.get(lower);
        if (actualKey) {
            this.keyCaseMap.delete(lower);
            return super.delete(actualKey);
        }
        return super.delete(key);
    }

    clear(): void {
        this.keyCaseMap.clear();
        super.clear();
    }
}

// Parse INI content into key-value map
// Handles duplicate keys by joining values with \n
// Case-insensitive lookups and automatic section/key canonicalization
export function parseIniContent(content: string): CaseInsensitiveMap<CaseInsensitiveMap<string>> {
    const sections = new CaseInsensitiveMap<CaseInsensitiveMap<string>>();
    if (!content) return sections;

    // Normalize BOM, smart quotes, non-breaking spaces
    const normalized = content
        .replace(/^\uFEFF/, '')
        .replace(/[\u201C\u201D\u201E\u201F«»]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u00A0/g, ' ');

    let currentSection = '__global__';

    for (const rawLine of normalized.split(/\r?\n/)) {
        const trimmed = rawLine.trim();
        // Skip empty lines and full line comments
        if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('//')) {
            continue;
        }

        // Section header: [SectionName] with optional inline comment or whitespace
        if (trimmed.startsWith('[')) {
            const endBracket = trimmed.indexOf(']');
            if (endBracket !== -1) {
                const rawSection = trimmed.slice(1, endBracket).trim();
                if (rawSection) {
                    currentSection = getCanonicalSectionName(rawSection);
                    if (!sections.has(currentSection)) {
                        sections.set(currentSection, new CaseInsensitiveMap<string>());
                    }
                    continue;
                }
            }
        }

        // Key=Value pair
        const equalsIdx = trimmed.indexOf('=');
        if (equalsIdx !== -1) {
            const rawKey = trimmed.slice(0, equalsIdx).trim();
            let rawValue = trimmed.slice(equalsIdx + 1).trim();

            if (!rawKey) continue;

            const cleanKey = getCanonicalKeyName(currentSection, rawKey);

            // Strip inline comments if not inside quotes and not an array/struct/JSON block
            if (!rawValue.startsWith('"') && !rawValue.startsWith('(') && !rawValue.startsWith('{')) {
                const commentIdx = rawValue.search(/\s+[;#]/);
                if (commentIdx !== -1) {
                    rawValue = rawValue.slice(0, commentIdx).trim();
                }
            }

            let finalValue = rawValue;
            if (isTextareaField(cleanKey)) {
                finalValue = rawValue.replace(/\\n/g, '\n');
            }

            let sectionMap = sections.get(currentSection);
            if (!sectionMap) {
                sectionMap = new CaseInsensitiveMap<string>();
                sections.set(currentSection, sectionMap);
            }

            if (sectionMap.has(cleanKey)) {
                const existing = sectionMap.get(cleanKey);
                sectionMap.set(cleanKey, `${existing}\n${finalValue}`);
            } else {
                sectionMap.set(cleanKey, finalValue);
            }
        }
    }

    return sections;
}

// Generate INI content from sections map
// Handles multiline values (containing \n) by splitting into duplicate keys
export function generateIniContent(sections: Map<string, Map<string, string>> | CaseInsensitiveMap<CaseInsensitiveMap<string>>): string {
    let content = '';

    for (const [section, values] of sections) {
        if (!values || values.size === 0) continue;
        if (section !== '__global__') {
            content += `[${section}]\n`;
        }
        for (const [key, value] of values) {
            if (value === undefined || value === null) continue;
            // Suppress legacy/misnamed keys that have no effect in ARK
            const lowerKey = key.toLowerCase();
            if (lowerKey === 'disablecryopodstructurerequirement' || lowerKey === 'disablecryopodstasis') {
                continue;
            }
            if (isTextareaField(key)) {
                // For textarea fields, escape real newlines to literal \n and write as a single line
                const escapedValue = value.replace(/\r?\n/g, '\\n');
                content += `${key}=${escapedValue}\n`;
            } else if (value.includes('\n')) {
                // Handle multiline values as duplicates (e.g. repeated OverridePlayerLevelEngramPoints)
                const parts = value.split('\n');
                for (const part of parts) {
                    const trimmed = part.trim();
                    if (trimmed !== '') {
                        content += `${key}=${trimmed}\n`;
                    }
                }
            } else if (value.trim() !== '') {
                content += `${key}=${value.trim()}\n`;
            }
        }
        content += '\n';
    }

    return content;
}
