// Map profiles with recommended settings for ARK: Survival Ascended
// Each map has unique characteristics that benefit from different settings

import { MODDED_MAP_PRESETS } from './moddedMapRegistry';

export interface MapProfile {
    mapId: string;
    mapName: string;
    icon: string;
    color: string;
    description: string;
    difficultyOffset: number;
    xpMultiplier: number;
    harvestMultiplier: number;
    tamingMultiplier: number;
    recommendedMods: string[];
    notes: string[];
    environment: 'normal' | 'desert' | 'underground' | 'ocean' | 'space' | 'varied' | 'nordic' | 'lunar' | 'oceanic';
}

export const MAP_PROFILES: MapProfile[] = [
    {
        mapId: 'TheIsland_WP',
        mapName: 'The Island',
        icon: '🏝️',
        color: '#22c55e',
        description: 'The original ARK experience - balanced for all playstyles',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Best for beginners', 'All creatures available', 'Classic ARK experience'],
        environment: 'normal'
    },
    {
        mapId: 'ScorchedEarth_WP',
        mapName: 'Scorched Earth',
        icon: '🏜️',
        color: '#f59e0b',
        description: 'Desert survival with unique creatures and weather',
        difficultyOffset: 1.0,
        xpMultiplier: 1.2,
        harvestMultiplier: 1.2,
        tamingMultiplier: 1.5,
        recommendedMods: [],
        notes: ['Harsh desert climate', 'Water is scarce', 'Unique creatures: Wyvern, Phoenix'],
        environment: 'desert'
    },
    {
        mapId: 'TheCenter_WP',
        mapName: 'The Center',
        icon: '🌊',
        color: '#3b82f6',
        description: 'Massive community map with diverse biomes',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['3x larger than The Island', 'Floating islands', 'Underwater caves'],
        environment: 'varied'
    },
    {
        mapId: 'Aberration_WP',
        mapName: 'Aberration',
        icon: '🍄',
        color: '#a855f7',
        description: 'Underground alien world with radiation zones',
        difficultyOffset: 1.0,
        xpMultiplier: 1.2,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.5,
        recommendedMods: [],
        notes: ['No flyers allowed', 'Radiation zones require hazard suit', 'Unique creatures: Rock Drake, Reaper'],
        environment: 'underground'
    },
    {
        mapId: 'Extinction_WP',
        mapName: 'Extinction',
        icon: '🏚️',
        color: '#64748b',
        description: 'Post-apocalyptic Earth with OSD events',
        difficultyOffset: 1.0,
        xpMultiplier: 1.5,
        harvestMultiplier: 1.5,
        tamingMultiplier: 2.0,
        recommendedMods: [],
        notes: ['Orbital Supply Drops', 'Element veins', 'Titans & Corrupted dinos'],
        environment: 'varied'
    },
    {
        mapId: 'Ragnarok_WP',
        mapName: 'Ragnarok',
        icon: '⚔️',
        color: '#ef4444',
        description: 'Viking-themed expansion with massive landscape',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Wyvern trench', 'Griffin spawns', 'Huge desert and snow biomes'],
        environment: 'varied'
    },
    {
        mapId: 'Valguero_WP',
        mapName: 'Valguero',
        icon: '🦖',
        color: '#10b981',
        description: 'Community map with unique areas and Deinonychus',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Deinonychus exclusive', 'Aberration cave', 'Beautiful landscapes'],
        environment: 'varied'
    },
    {
        mapId: 'LostColony_WP',
        mapName: 'Lost Colony',
        icon: '🚀',
        color: '#8b5cf6',
        description: 'New canonical DLC with advanced technology',
        difficultyOffset: 1.2,
        xpMultiplier: 1.5,
        harvestMultiplier: 1.2,
        tamingMultiplier: 1.5,
        recommendedMods: [],
        notes: ['Latest DLC content', 'New creatures & items', 'Advanced gameplay'],
        environment: 'space'
    },
    {
        mapId: 'Genesis_WP',
        mapName: 'Genesis Part 1',
        icon: '🧬',
        color: '#14b8a6',
        description: 'Simulation with unique biomes and missions',
        difficultyOffset: 1.0,
        xpMultiplier: 1.5,
        harvestMultiplier: 1.2,
        tamingMultiplier: 2.0,
        recommendedMods: [],
        notes: ['Mission-based gameplay', 'HLNA companion', '5 unique biomes'],
        environment: 'varied'
    },
    {
        mapId: 'Genesis2_WP',
        mapName: 'Genesis Part 2',
        icon: '🛸',
        color: '#6366f1',
        description: 'Space ship with two unique halves',
        difficultyOffset: 1.0,
        xpMultiplier: 1.5,
        harvestMultiplier: 1.2,
        tamingMultiplier: 2.0,
        recommendedMods: [],
        notes: ['Colony ship setting', 'Eden vs Rockwell side', 'Tek strider, Maewing'],
        environment: 'space'
    },
    {
        mapId: 'Astraeos_WP',
        mapName: 'Astraeos',
        icon: '✨',
        color: '#ec4899',
        description: 'Premium mod map with unique content',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Premium mod content', 'Custom creatures', 'Unique gameplay'],
        environment: 'varied'
    },
    {
        mapId: 'Forglar_WP',
        mapName: 'Forglar',
        icon: '🌿',
        color: '#06b6d4',
        description: 'Premium mod map with lush environments',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Premium mod content', 'Dense forests', 'Custom biomes'],
        environment: 'normal'
    },
    {
        mapId: 'Svartalfheim_WP',
        mapName: 'Svartalfheim',
        icon: '⛰️',
        color: '#0284c7',
        description: 'Dwarven realm inspired premium mod map',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['No flyers allowed', 'Nordic inspired', 'Rich mineral resources'],
        environment: 'nordic'
    },
    {
        mapId: 'Amissa_WP',
        mapName: 'Amissa',
        icon: '🍃',
        color: '#16a34a',
        description: 'Premium mod map with ancient overgrown ruins',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Lush environments', 'Unique flora', 'Ancient civilization ruins'],
        environment: 'varied'
    },
    {
        mapId: 'Insaluna_WP',
        mapName: 'Insaluna',
        icon: '🌙',
        color: '#818cf8',
        description: 'Lunar and alien themed premium mod map',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Bioluminescence', 'Low gravity zones', 'Alien landscapes'],
        environment: 'lunar'
    },
    {
        mapId: 'TemptressLagoon_WP',
        mapName: 'Temptress Lagoon',
        icon: '🏝️',
        color: '#0ea5e9',
        description: 'Tropical paradise premium mod map',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Vast ocean areas', 'Tropical islands', 'Rich marine life'],
        environment: 'oceanic'
    },
    {
        mapId: 'Reverence_WP',
        mapName: 'Reverence',
        icon: '🏛️',
        color: '#d97706',
        description: 'Sacred realms and ancient temples premium mod map',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Sacred locations', 'Monumental architecture', 'Boss arenas'],
        environment: 'varied'
    },
    {
        mapId: 'ClubARK_WP',
        mapName: 'Club ARK',
        icon: '🌴',
        color: '#e11d48',
        description: 'Social hub with mini-games',
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: [],
        notes: ['Mini-games', 'Social area', 'Events'],
        environment: 'normal'
    },
    // Modded presets mapped to MapProfile dynamically
    ...MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASA').map(p => ({
        mapId: p.mapArgument,
        mapName: p.name,
        icon: p.icon,
        color: p.color,
        description: p.description,
        difficultyOffset: 1.0,
        xpMultiplier: 1.0,
        harvestMultiplier: 1.0,
        tamingMultiplier: 1.0,
        recommendedMods: p.mapModId ? [p.mapModId] : [],
        notes: [`Created by ${p.author}`, `Mod/Workshop ID: ${p.mapModId}`],
        environment: (p.name.toLowerCase().includes('scorched') ? 'desert' : 'normal') as any
    }))
];

// Get profile by map ID
export function getMapProfile(mapId: string): MapProfile | undefined {
    return MAP_PROFILES.find(p => p.mapId === mapId);
}

// Get all profiles grouped by category
export function getProfilesByCategory() {
    return {
        released: MAP_PROFILES.filter(p =>
            ['TheIsland_WP', 'ScorchedEarth_WP', 'TheCenter_WP', 'Aberration_WP', 'Extinction_WP', 'Ragnarok_WP', 'Valguero_WP', 'LostColony_WP', 'ClubARK_WP', 'Genesis_WP'].includes(p.mapId)
        ),
        premiumMods: MAP_PROFILES.filter(p =>
            ['Astraeos_WP', 'Forglar_WP', 'Svartalfheim_WP', 'Amissa_WP', 'Insaluna_WP', 'TemptressLagoon_WP', 'Reverence_WP'].includes(p.mapId)
        ),
        upcoming: MAP_PROFILES.filter(p =>
            ['Genesis2_WP'].includes(p.mapId)
        ),
        moddedExpansions: MAP_PROFILES.filter(p =>
            MODDED_MAP_PRESETS.filter(mp => mp.serverType === 'ASA').map(mp => mp.mapArgument).includes(p.mapId)
        )
    };
}
