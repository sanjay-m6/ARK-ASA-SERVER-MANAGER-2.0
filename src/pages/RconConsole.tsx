import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Terminal as TerminalIcon,
    Send,
    Users,
    Wifi,
    WifiOff,
    Save,
    Trash2,
    MessageSquare,
    Megaphone,
    UserX,
    Ban,
    Clock,
    RefreshCw,
    HelpCircle,
    AlertTriangle,
    ShieldAlert,
    Timer,
    Unplug,
    Layers,
    Search,
    Play,
    XCircle,
    Database,
    ShieldCheck,
    Eye,
    EyeOff,
    Check,
    Pause,
    History,
    Gift,
    Package,
    Sliders
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useServerStore } from '../stores/serverStore';
import { useRconStore, RconPlayer, CommandHistoryEntry } from '../stores/rconStore';
import RconHelpModal from '../components/ui/RconHelpModal';
import ServerSelect from '../components/ui/ServerSelect';

interface RconResponse {
    success: boolean;
    message: string;
    data?: string;
}

interface SaveValidationInfo {
    exists: boolean;
    file_name: string;
    last_modified: string;
    file_size_bytes: number;
    integrity_ok: boolean;
    error_message: string | null;
}

interface SaveHistoryEntry {
    serverId: number;
    serverName: string;
    timestamp: Date;
    info: SaveValidationInfo;
}

interface ClusterResult {
    server_id: number;
    success: boolean;
    response: string;
}

const QUICK_COMMANDS = [
    { labelKey: 'rcon.quickCommands.saveWorld', labelDefault: 'Save World', command: 'SaveWorld', icon: Save },
    { labelKey: 'rcon.quickCommands.listPlayers', labelDefault: 'List Players', command: 'ListPlayers', icon: Users },
    { labelKey: 'rcon.quickCommands.destroyWild', labelDefault: 'Destroy Wild Dinos', command: 'DestroyWildDinos', icon: Trash2 },
    { labelKey: 'rcon.quickCommands.dayTime', labelDefault: 'Set Day Time', command: 'SetTimeOfDay 12:00', icon: Clock },
    { labelKey: 'rcon.quickCommands.nightTime', labelDefault: 'Set Night Time', command: 'SetTimeOfDay 00:00', icon: Clock },
];

const AUTOCOMPLETE_COMMANDS = [
    { command: 'SaveWorld', desc: 'Forces an immediate server world save.' },
    { command: 'ListPlayers', desc: 'Displays SteamID, character name, and level of all active players.' },
    { command: 'Broadcast', desc: 'Displays an on-screen alert banner to all players.' },
    { command: 'DestroyWildDinos', desc: 'Clears all wild dinosaurs from the map.' },
    { command: 'KickPlayer', desc: 'Kicks a player from the server by SteamID.' },
    { command: 'BanPlayer', desc: 'Bans a player from the server by SteamID.' },
    { command: 'UnbanPlayer', desc: 'Unbans a player by SteamID.' },
    { command: 'GetChat', desc: 'Fetches recent server chat messages.' },
    { command: 'SetTimeOfDay', desc: 'Changes map time (e.g. SetTimeOfDay 12:00).' },
    { command: 'DoExit', desc: 'Saves and halts the server immediately.' },
    { command: 'ShowMessageOfTheDay', desc: 'Shows the configured MOTD to all players.' },
    { command: 'ServerChat', desc: 'Sends a chat message visible in the global feed.' },
    { command: 'AdminCheat', desc: 'Prefix to run server administration commands.' }
];

const PRESET_ITEMS = [
    // Resources
    { name: 'Stone', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Stone.PrimalItemResource_Stone'" },
    { name: 'Metal Ingot', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_MetalIngot.PrimalItemResource_MetalIngot'" },
    { name: 'Metal (Raw)', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Metal.PrimalItemResource_Metal'" },
    { name: 'Scrap Metal', category: 'Resources', path: "Blueprint'/Game/Extinction/CoreBlueprints/Resources/PrimalItemResource_ScrapMetal.PrimalItemResource_ScrapMetal'" },
    { name: 'Scrap Metal Ingot', category: 'Resources', path: "Blueprint'/Game/Extinction/CoreBlueprints/Resources/PrimalItemResource_ScrapMetalIngot.PrimalItemResource_ScrapMetalIngot'" },
    { name: 'Wood', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Wood.PrimalItemResource_Wood'" },
    { name: 'Fungal Wood', category: 'Resources', path: "Blueprint'/Game/Aberration/CoreBlueprints/Resources/PrimalItemResource_FungalWood.PrimalItemResource_FungalWood'" },
    { name: 'Thatch', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Thatch.PrimalItemResource_Thatch'" },
    { name: 'Fiber', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Fibers.PrimalItemResource_Fibers'" },
    { name: 'Hide', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Hide.PrimalItemResource_Hide'" },
    { name: 'Pelt', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Pelt.PrimalItemResource_Pelt'" },
    { name: 'Hair', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Hair.PrimalItemResource_Hair'" },
    { name: 'Wool', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Wool.PrimalItemResource_Wool'" },
    { name: 'Silk', category: 'Resources', path: "Blueprint'/Game/ScorchedEarth/CoreBlueprints/Resources/PrimalItemResource_Silk.PrimalItemResource_Silk'" },
    { name: 'Chitin', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Chitin.PrimalItemResource_Chitin'" },
    { name: 'Keratin', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Keratin.PrimalItemResource_Keratin'" },
    { name: 'Shell Fragment', category: 'Resources', path: "Blueprint'/Game/Extinction/CoreBlueprints/Resources/PrimalItemResource_ShellFragment.PrimalItemResource_ShellFragment'" },
    { name: 'Obsidian', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Obsidian.PrimalItemResource_Obsidian'" },
    { name: 'Crystal', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Crystal.PrimalItemResource_Crystal'" },
    { name: 'Primal Crystal', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Crystal_IslesPrimal.PrimalItemResource_Crystal_IslesPrimal'" },
    { name: 'Flint', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Flint.PrimalItemResource_Flint'" },
    { name: 'Cementing Paste', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_CementingPaste.PrimalItemResource_CementingPaste'" },
    { name: 'Polymer (Standard)', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Polymer.PrimalItemResource_Polymer'" },
    { name: 'Polymer (Organic)', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_PolymerOrganic.PrimalItemResource_PolymerOrganic'" },
    { name: 'Corrupted Nodule', category: 'Resources', path: "Blueprint'/Game/Extinction/CoreBlueprints/Resources/PrimalItemResource_CorruptedNodule.PrimalItemResource_CorruptedNodule'" },
    { name: 'Electronics', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Electronics.PrimalItemResource_Electronics'" },
    { name: 'Gunpowder', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Gunpowder.PrimalItemResource_Gunpowder'" },
    { name: 'Sparkpowder', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Sparkpowder.PrimalItemResource_Sparkpowder'" },
    { name: 'Charcoal', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Charcoal.PrimalItemResource_Charcoal'" },
    { name: 'Element', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Element.PrimalItemResource_Element'" },
    { name: 'Element Shard', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ElementShard.PrimalItemResource_ElementShard'" },
    { name: 'Element Dust', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ElementDust.PrimalItemResource_ElementDust'" },
    { name: 'Element Ore', category: 'Resources', path: "Blueprint'/Game/Aberration/CoreBlueprints/Resources/PrimalItemResource_ElementOre.PrimalItemResource_ElementOre'" },
    { name: 'Mutagel', category: 'Resources', path: "Blueprint'/Game/Genesis2/CoreBlueprints/Environment/Mutagel/PrimalItemResource_Mutagel.PrimalItemResource_Mutagel'" },
    { name: 'Mutagen', category: 'Resources', path: "Blueprint'/Game/Genesis2/CoreBlueprints/Environment/Mutagen/PrimalItemConsumable_Mutagen.PrimalItemConsumable_Mutagen'" },
    { name: 'Black Pearl', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_BlackPearl.PrimalItemResource_BlackPearl'" },
    { name: 'Silica Pearls', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_SiliconPearls.PrimalItemResource_SiliconPearls'" },
    { name: 'Ambergris', category: 'Resources', path: "Blueprint'/Game/Genesis/CoreBlueprints/Environment/PrimalItemResource_Ambergris.PrimalItemResource_Ambergris'" },
    { name: 'Oil', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Oil.PrimalItemResource_Oil'" },
    { name: 'Gasoline', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Gasoline.PrimalItemResource_Gasoline'" },
    { name: 'Sulfur', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Sulfur.PrimalItemResource_Sulfur'" },
    { name: 'Raw Salt', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_RawSalt.PrimalItemResource_RawSalt'" },
    { name: 'Clay', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Clay.PrimalItemResource_Clay'" },
    { name: 'Sand', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Sand.PrimalItemResource_Sand'" },
    { name: 'Cactus Sap', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_CactusSap.PrimalItemResource_CactusSap'" },
    { name: 'Sap', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Sap.PrimalItemResource_Sap'" },
    { name: 'Angler Gel', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_AnglerGel.PrimalItemResource_AnglerGel'" },
    { name: 'Achatina Paste', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_AchatinaPaste.PrimalItemResource_AchatinaPaste'" },
    { name: 'Rare Flower', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_RareFlower.PrimalItemResource_RareFlower'" },
    { name: 'Rare Mushroom', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_RareMushroom.PrimalItemResource_RareMushroom'" },
    { name: 'Substrate Absorbent', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_SubstrateAbsorbent.PrimalItemResource_SubstrateAbsorbent'" },
    { name: 'Preserving Salt', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_PreservingSalt.PrimalItemResource_PreservingSalt'" },
    { name: 'Propellant', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Propellant.PrimalItemResource_Propellant'" },
    { name: 'Congealed Gas Ball', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_GasBall.PrimalItemResource_GasBall'" },
    { name: 'Condensed Gas', category: 'Resources', path: "Blueprint'/Game/Extinction/CoreBlueprints/Resources/PrimalItemResource_CondensedGas.PrimalItemResource_CondensedGas'" },
    { name: 'Gasbags Bladder', category: 'Resources', path: "Blueprint'/Game/Extinction/CoreBlueprints/Resources/PrimalItemResource_GasBagsBladder.PrimalItemResource_GasBagsBladder'" },
    { name: 'Green Gem', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Gem_BioLum.PrimalItemResource_Gem_BioLum'" },
    { name: 'Blue Gem', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Gem_Fertile.PrimalItemResource_Gem_Fertile'" },
    { name: 'Red Gem', category: 'Resources', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Gem_Element.PrimalItemResource_Gem_Element'" },

    // Consumables & Kibbles
    { name: 'Medical Brew', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_HealSoup.PrimalItemConsumable_HealSoup'" },
    { name: 'Energy Brew', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_StaminaSoup.PrimalItemConsumable_StaminaSoup'" },
    { name: 'Sweet Vegetable Cake', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_SweetVeggieCake.PrimalItemConsumable_SweetVeggieCake'" },
    { name: 'Broth of Enlightenment', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Soup_Enlightenment.PrimalItemConsumable_Soup_Enlightenment'" },
    { name: 'Enduro Stew', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Soup_Enduro.PrimalItemConsumable_Soup_Enduro'" },
    { name: 'Focal Chili', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Soup_FocalChili.PrimalItemConsumable_Soup_FocalChili'" },
    { name: 'Lazarus Chowder', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Soup_Lazarus.PrimalItemConsumable_Soup_Lazarus'" },
    { name: 'Shadow Steak Saute', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Soup_ShadowSteak.PrimalItemConsumable_Soup_ShadowSteak'" },
    { name: 'Basic Kibble (Extra Small)', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Kibble_Base_XSmall.PrimalItemConsumable_Kibble_Base_XSmall'" },
    { name: 'Simple Kibble (Small)', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Kibble_Base_Small.PrimalItemConsumable_Kibble_Base_Small'" },
    { name: 'Regular Kibble (Medium)', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Kibble_Base_Medium.PrimalItemConsumable_Kibble_Base_Medium'" },
    { name: 'Superior Kibble (Large)', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Kibble_Base_Large.PrimalItemConsumable_Kibble_Base_Large'" },
    { name: 'Exceptional Kibble (Extra Large)', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Kibble_Base_XLarge.PrimalItemConsumable_Kibble_Base_XLarge'" },
    { name: 'Extraordinary Kibble (Special)', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Consumables/PrimalItemConsumable_Kibble_Base_Special.PrimalItemConsumable_Kibble_Base_Special'" },
    { name: 'Narcoberry', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemConsumable_Berry_Narcoberry.PrimalItemConsumable_Berry_Narcoberry'" },
    { name: 'Stimberry', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemConsumable_Berry_Stimberry.PrimalItemConsumable_Berry_Stimberry'" },
    { name: 'Narcotic', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemConsumable_Narcotic.PrimalItemConsumable_Narcotic'" },
    { name: 'Stimulant', category: 'Consumables', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemConsumable_Stimulant.PrimalItemConsumable_Stimulant'" },

    // Apex Drops
    { name: 'Argentavis Talon', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Argentavis.PrimalItemResource_ApexDrop_Argentavis'" },
    { name: 'Megalodon Tooth', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Megalodon.PrimalItemResource_ApexDrop_Megalodon'" },
    { name: 'Tyrannosaurus Arm', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Rex.PrimalItemResource_ApexDrop_Rex'" },
    { name: 'Sauropod Vertebra', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Sauropod.PrimalItemResource_ApexDrop_Sauropod'" },
    { name: 'Tusoteuthis Tentacle', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Tuso.PrimalItemResource_ApexDrop_Tuso'" },
    { name: 'Basilosaurus Blubber', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Basilo.PrimalItemResource_ApexDrop_Basilo'" },
    { name: 'Sarcosuchus Skin', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Sarco.PrimalItemResource_ApexDrop_Sarco'" },
    { name: 'Titanoboa Venom', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Boa.PrimalItemResource_ApexDrop_Boa'" },
    { name: 'Spinosaurus Sail', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Spino.PrimalItemResource_ApexDrop_Spino'" },
    { name: 'Thylacoleo Hook-Claw', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Thyla.PrimalItemResource_ApexDrop_Thyla'" },
    { name: 'Megalania Toxin', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Megalania.PrimalItemResource_ApexDrop_Megalania'" },
    { name: 'Allosaurus Brain', category: 'Apex Drops', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Allo.PrimalItemResource_ApexDrop_Allo'" },

    // Artifacts
    { name: 'Artifact of the Hunter', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_01.PrimalItemArtifact_01'" },
    { name: 'Artifact of the Pack', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_02.PrimalItemArtifact_02'" },
    { name: 'Artifact of the Massive', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_03.PrimalItemArtifact_03'" },
    { name: 'Artifact of the Devious', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_04.PrimalItemArtifact_04'" },
    { name: 'Artifact of the Clever', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_05.PrimalItemArtifact_05'" },
    { name: 'Artifact of the Skylord', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_06.PrimalItemArtifact_06'" },
    { name: 'Artifact of the Devourer', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_07.PrimalItemArtifact_07'" },
    { name: 'Artifact of the Immune', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_08.PrimalItemArtifact_08'" },
    { name: 'Artifact of the Strong', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_09.PrimalItemArtifact_09'" },
    { name: 'Artifact of the Cunning', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_11.PrimalItemArtifact_11'" },
    { name: 'Artifact of the Brute', category: 'Artifacts', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Artifacts/PrimalItemArtifact_12.PrimalItemArtifact_12'" },

    // Ammo
    { name: 'Simple Rifle Ammo', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_SimpleRifleBullet.PrimalItemAmmo_SimpleRifleBullet'" },
    { name: 'Advanced Rifle Ammo', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_AdvancedRifleBullet.PrimalItemAmmo_AdvancedRifleBullet'" },
    { name: 'Sniper Ammo', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_AdvancedSniperBullet.PrimalItemAmmo_AdvancedSniperBullet'" },
    { name: 'Shocking Tranq Dart', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_RefinedTranqDart.PrimalItemAmmo_RefinedTranqDart'" },
    { name: 'Simple Bullet', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_SimpleBullet.PrimalItemAmmo_SimpleBullet'" },
    { name: 'Simple Shotgun Ammo', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_SimpleShotgunBullet.PrimalItemAmmo_SimpleShotgunBullet'" },
    { name: 'Advanced Bullet', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_AdvancedBullet.PrimalItemAmmo_AdvancedBullet'" },
    { name: 'Grappling Hook', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_GrapplingHook.PrimalItemAmmo_GrapplingHook'" },
    { name: 'Tranq Dart', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_TranqDart.PrimalItemAmmo_TranqDart'" },
    { name: 'Flame Arrow', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_ArrowFlame.PrimalItemAmmo_ArrowFlame'" },
    { name: 'Tranq Arrow', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_ArrowTranq.PrimalItemAmmo_ArrowTranq'" },
    { name: 'Stone Arrow', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_ArrowStone.PrimalItemAmmo_ArrowStone'" },
    { name: 'Rocket Propelled Grenade', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_RocketRPG.PrimalItemAmmo_RocketRPG'" },
    { name: 'Advanced Sniper Ammo', category: 'Ammo', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItemAmmo_AdvancedSniperBullet.PrimalItemAmmo_AdvancedSniperBullet'" },

    // Gear
    { name: 'Canteen', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/PrimalItemCanteen.PrimalItemCanteen'" },
    { name: 'Cryopod', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponEmptyCryopod.PrimalItem_WeaponEmptyCryopod'" },
    { name: 'GPS', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/PrimalItemGPS.PrimalItemGPS'" },
    { name: 'Compass', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/PrimalItemCompass.PrimalItemCompass'" },
    { name: 'Radio', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/PrimalItemRadio.PrimalItemRadio'" },
    { name: 'Spyglass', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/PrimalItemWeaponSpyglass.PrimalItemWeaponSpyglass'" },
    { name: 'Metal Pick', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponMetalPick.PrimalItem_WeaponMetalPick'" },
    { name: 'Metal Hatchet', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponMetalHatchet.PrimalItem_WeaponMetalHatchet'" },
    { name: 'Chainsaw', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_ChainSaw.PrimalItem_ChainSaw'" },
    { name: 'Mining Drill', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Weapons/PrimalItem_WeaponMiningDrill.PrimalItem_WeaponMiningDrill'" },
    { name: 'Glider Suit Skin', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Saddles/PrimalItemCostume_Glider.PrimalItemCostume_Glider'" },
    { name: 'Hazmat Suit Mask', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/GasMask/PrimalItemArmor_HazardSuitHelmet.PrimalItemArmor_HazardSuitHelmet'" },
    { name: 'Hazmat Suit Shirt', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Hazard/PrimalItemArmor_HazardSuitShirt.PrimalItemArmor_HazardSuitShirt'" },
    { name: 'Hazmat Suit Gloves', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Hazard/PrimalItemArmor_HazardSuitGloves.PrimalItemArmor_HazardSuitGloves'" },
    { name: 'Hazmat Suit Pants', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Hazard/PrimalItemArmor_HazardSuitPants.PrimalItemArmor_HazardSuitPants'" },
    { name: 'Hazmat Suit Boots', category: 'Gear', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Armor/Hazard/PrimalItemArmor_HazardSuitBoots.PrimalItemArmor_HazardSuitBoots'" },

    // Structures
    { name: 'Tek Replicator', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Tek/PrimalItemStructure_TekReplicator.PrimalItemStructure_TekReplicator'" },
    { name: 'Tek Generator', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Tek/PrimalItemStructure_TekGenerator.PrimalItemStructure_TekGenerator'" },
    { name: 'Tek Transmitter', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Tek/PrimalItemStructure_TekTransmitter.PrimalItemStructure_TekTransmitter'" },
    { name: 'Industrial Forge', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_IndustrialForge.PrimalItemStructure_IndustrialForge'" },
    { name: 'Chemistry Bench', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_ChemBench.PrimalItemStructure_ChemBench'" },
    { name: 'Industrial Grinder', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_Grinder.PrimalItemStructure_Grinder'" },
    { name: 'Heavy Auto Turret', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_HeavyTurret.PrimalItemStructure_HeavyTurret'" },
    { name: 'Auto Turret', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_Turret.PrimalItemStructure_Turret'" },
    { name: 'Tek Turret', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_TurretTek.PrimalItemStructure_TurretTek'" },
    { name: 'Vault', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_Bed_Modern.PrimalItemStructure_Bed_Modern'" },
    { name: 'Cryofridge', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Misc/PrimalItemStructure_CryoFridge.PrimalItemStructure_CryoFridge'" },
    { name: 'Dedicated Storage', category: 'Structures', path: "Blueprint'/Game/PrimalEarth/CoreBlueprints/Items/Structures/Tek/PrimalItemStructure_DedicatedStorage.PrimalItemStructure_DedicatedStorage'" }
];

function classifyError(errMsg: string): { category: string; icon: typeof AlertTriangle; colorClass: string } {
    const lower = errMsg.toLowerCase();
    if (lower.includes('authentication failed') || lower.includes('wrong admin password')) {
        return { category: 'Authentication Failed', icon: ShieldAlert, colorClass: 'text-red-400 border-red-500/20 bg-red-950/20' };
    }
    if (lower.includes('timed out') || lower.includes('timeout')) {
        return { category: 'Command Timeout', icon: Timer, colorClass: 'text-amber-400 border-amber-500/20 bg-amber-950/20' };
    }
    if (lower.includes('connection lost') || lower.includes('reconnect failed') || lower.includes('socket closed')) {
        return { category: 'Connection Lost', icon: Unplug, colorClass: 'text-orange-400 border-orange-500/20 bg-orange-950/20' };
    }
    if (lower.includes('no active rcon connection')) {
        return { category: 'Not Connected', icon: WifiOff, colorClass: 'text-slate-400 border-slate-700/50 bg-slate-900/50' };
    }
    return { category: 'Error', icon: AlertTriangle, colorClass: 'text-red-400 border-red-500/20 bg-red-950/20' };
}

const EMPTY_PLAYERS: RconPlayer[] = [];
const EMPTY_HISTORY: CommandHistoryEntry[] = [];

export default function RconConsole() {
    const { t } = useTranslation();
    const { servers } = useServerStore();

    // Active Tab state: terminal, log_stream, cluster, save_manager, give_items
    const [activeTab, setActiveTab] = useState<'terminal' | 'log_stream' | 'cluster' | 'save_manager' | 'give_items'>('terminal');

    const [isHelpOpen, setIsHelpOpen] = useState(false);

    // Give Items states
    const [giveTargetType, setGiveTargetType] = useState<'online' | 'manual'>('online');
    const [giveSelectedPlayerId, setGiveSelectedPlayerId] = useState('');
    const [giveManualPlayerId, setGiveManualPlayerId] = useState('');
    const [giveItemSource, setGiveItemSource] = useState<'preset' | 'custom'>('preset');
    const [giveSelectedPresetItem, setGiveSelectedPresetItem] = useState('');
    const [giveCustomBlueprint, setGiveCustomBlueprint] = useState('');
    const [giveItemQuantity, setGiveItemQuantity] = useState(1);
    const [giveItemQuality, setGiveItemQuality] = useState(0);
    const [giveForceBlueprint, setGiveForceBlueprint] = useState(false);
    const [giveCatalogSearch, setGiveCatalogSearch] = useState('');
    const [isGivingItem, setIsGivingItem] = useState(false);
    const [giveSelectedCategory, setGiveSelectedCategory] = useState<'All' | 'Resources' | 'Consumables' | 'Apex Drops' | 'Artifacts' | 'Ammo' | 'Gear' | 'Structures'>('All');

    // Player ID resolution states
    const [resolvedPlayerIds, setResolvedPlayerIds] = useState<Record<string, string>>({});
    const [isResolvingIds, setIsResolvingIds] = useState(false);

    // Zustand global state for RCON
    const selectedServerId = useRconStore(state => state.selectedServerId);
    const setSelectedServerId = useRconStore(state => state.setSelectedServerId);

    // Select stable action references to avoid dependency re-triggers
    const setConnected = useRconStore(state => state.setConnected);
    const setConnecting = useRconStore(state => state.setConnecting);
    const addHistory = useRconStore(state => state.addHistory);
    const setPlayers = useRconStore(state => state.setPlayers);
    const setLastError = useRconStore(state => state.setLastError);
    const setConnectionInfo = useRconStore(state => state.setConnectionInfo);
    const clearServerState = useRconStore(state => state.clearServerState);

    const serverState = useRconStore(state => selectedServerId ? state.serverStates[selectedServerId] : undefined);
    const isConnected = serverState?.isConnected || false;
    const isConnecting = serverState?.isConnecting || false;
    const commandHistory = serverState?.commandHistory || EMPTY_HISTORY;
    const onlinePlayers = serverState?.players || EMPTY_PLAYERS;
    const connectionInfo = serverState?.connectionInfo || null;

    // Resolve Player IDs automatically
    useEffect(() => {
        if (!selectedServerId || onlinePlayers.length === 0) {
            Promise.resolve().then(() => {
                setResolvedPlayerIds(prev => Object.keys(prev).length === 0 ? prev : {});
            });
            return;
        }

        const platformIds = onlinePlayers.map(p => p.steamId);
        Promise.resolve().then(() => {
            setIsResolvingIds(true);
        });
        invoke<Record<string, number>>('rcon_resolve_player_ids', {
            serverId: selectedServerId,
            platformIds
        })
        .then(resolvedMap => {
            const stringifiedMap: Record<string, string> = {};
            for (const [k, v] of Object.entries(resolvedMap)) {
                stringifiedMap[k] = String(v);
            }
            setResolvedPlayerIds(stringifiedMap);
        })
        .catch(err => {
            console.error('Failed to resolve player IDs:', err);
        })
        .finally(() => {
            setIsResolvingIds(false);
        });
    }, [selectedServerId, onlinePlayers]);

    // Default selected player when player list refreshes
    useEffect(() => {
        if (onlinePlayers.length > 0 && !giveSelectedPlayerId) {
            Promise.resolve().then(() => {
                setGiveSelectedPlayerId(onlinePlayers[0].steamId);
            });
        }
    }, [onlinePlayers, giveSelectedPlayerId]);

    // Auto-Broadcast settings
    const [showAutoBroadcastSettings, setShowAutoBroadcastSettings] = useState(false);
    const [dinoWipeBroadcastEnabled, setDinoWipeBroadcastEnabled] = useState(() => {
        return localStorage.getItem('rcon_dino_wipe_broadcast_enabled') !== 'false'; // default true
    });
    const [dinoWipeBroadcastMsg, setDinoWipeBroadcastMsg] = useState(() => {
        return localStorage.getItem('rcon_dino_wipe_broadcast_msg') || '[Server Alert] A wild dino wipe has been initiated. Expect brief server lag!';
    });
    const [dinoWipeBroadcastDelay, setDinoWipeBroadcastDelay] = useState(() => {
        const val = localStorage.getItem('rcon_dino_wipe_broadcast_delay');
        return val !== null ? parseInt(val, 10) : 5; // default 5 seconds
    });

    const [saveWorldBroadcastEnabled, setSaveWorldBroadcastEnabled] = useState(() => {
        return localStorage.getItem('rcon_save_world_broadcast_enabled') === 'true'; // default false
    });
    const [saveWorldBroadcastMsg, setSaveWorldBroadcastMsg] = useState(() => {
        return localStorage.getItem('rcon_save_world_broadcast_msg') || '[Server Alert] Saving world state...';
    });
    const [saveWorldBroadcastDelay, setSaveWorldBroadcastDelay] = useState(() => {
        const val = localStorage.getItem('rcon_save_world_broadcast_delay');
        return val !== null ? parseInt(val, 10) : 0; // default 0 seconds
    });

    useEffect(() => {
        localStorage.setItem('rcon_dino_wipe_broadcast_enabled', String(dinoWipeBroadcastEnabled));
    }, [dinoWipeBroadcastEnabled]);

    useEffect(() => {
        localStorage.setItem('rcon_dino_wipe_broadcast_msg', dinoWipeBroadcastMsg);
    }, [dinoWipeBroadcastMsg]);

    useEffect(() => {
        localStorage.setItem('rcon_dino_wipe_broadcast_delay', String(dinoWipeBroadcastDelay));
    }, [dinoWipeBroadcastDelay]);

    useEffect(() => {
        localStorage.setItem('rcon_save_world_broadcast_enabled', String(saveWorldBroadcastEnabled));
    }, [saveWorldBroadcastEnabled]);

    useEffect(() => {
        localStorage.setItem('rcon_save_world_broadcast_msg', saveWorldBroadcastMsg);
    }, [saveWorldBroadcastMsg]);

    useEffect(() => {
        localStorage.setItem('rcon_save_world_broadcast_delay', String(saveWorldBroadcastDelay));
    }, [saveWorldBroadcastDelay]);

    const [command, setCommand] = useState('');
    const [historyIndex, setHistoryIndex] = useState(-1);
    const terminalRef = useRef<HTMLDivElement>(null);
    const logFeedRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Live log streaming states
    const [isStreamingLogs, setIsStreamingLogs] = useState(false);
    const [logStream, setLogStream] = useState<{ line: string; timestamp: Date }[]>([]);
    const [logSearchQuery, setLogSearchQuery] = useState('');
    const [autoScrollLogs, setAutoScrollLogs] = useState(true);

    // Autocomplete states
    const [autocompleteVisible, setAutocompleteVisible] = useState(false);
    const [autocompleteIndex, setAutocompleteIndex] = useState(0);

    // Cluster execution states
    const [clusterCommand, setClusterCommand] = useState('');
    const [clusterSelectedServers, setClusterSelectedServers] = useState<number[]>([]);
    const [clusterProgress, setClusterProgress] = useState<Record<number, { status: 'idle' | 'sending' | 'success' | 'error'; response: string }>>({});
    const [clusterIsExecuting, setClusterIsExecuting] = useState(false);

    // Manual Save Validation states
    const [saveProgressState, setSaveProgressState] = useState<'idle' | 'sending' | 'syncing' | 'verifying' | 'success' | 'error'>('idle');
    const [saveValidationResult, setSaveValidationResult] = useState<SaveValidationInfo | null>(null);
    const [saveValidationHistory, setSaveValidationHistory] = useState<SaveHistoryEntry[]>([]);

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalRef.current && activeTab === 'terminal') {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [commandHistory, activeTab]);

    // Auto-scroll log feed
    useEffect(() => {
        if (logFeedRef.current && autoScrollLogs && activeTab === 'log_stream') {
            logFeedRef.current.scrollTop = logFeedRef.current.scrollHeight;
        }
    }, [logStream, autoScrollLogs, activeTab]);

    // Select first server if none selected
    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId, setSelectedServerId]);

    const selectedServer = useMemo(() => servers.find(s => s.id === selectedServerId), [servers, selectedServerId]);

    // Set cluster servers selection default
    useEffect(() => {
        if (servers.length > 0 && clusterSelectedServers.length === 0) {
            Promise.resolve().then(() => {
                setClusterSelectedServers(servers.map(s => s.id));
            });
        }
    }, [servers, clusterSelectedServers.length]);

    // Start/Stop log streaming when tab active / streaming toggle enabled
    useEffect(() => {
        if (isStreamingLogs && selectedServerId) {
            invoke('start_log_stream', { serverId: selectedServerId })
                .then(() => console.log(`[RCON] Log stream started for server #${selectedServerId}`))
                .catch(err => console.error('Error starting backend log stream:', err));
                
            return () => {
                invoke('stop_log_stream', { serverId: selectedServerId })
                    .then(() => console.log(`[RCON] Log stream stopped for server #${selectedServerId}`))
                    .catch(err => console.error('Error stopping backend log stream:', err));
            };
        }
    }, [selectedServerId, isStreamingLogs]);

    // Listen for live log streaming events
    useEffect(() => {
        let active = true;
        let unlistenFn: (() => void) | null = null;
        
        async function setupListener() {
            if (!selectedServerId || !isStreamingLogs) return;
            try {
                const unlisten = await listen<{ server_id: number; line: string }>('server_log_line', (event) => {
                    if (!active) return;
                    const { server_id, line } = event.payload;
                    if (server_id === selectedServerId) {
                        setLogStream((prev) => {
                            const next = [...prev, { line, timestamp: new Date() }];
                            return next.slice(-1000); // Buffer size limit
                        });
                    }
                });
                unlistenFn = unlisten;
            } catch (err) {
                console.error('Failed to listen to log stream:', err);
            }
        }
        
        setupListener();
        
        return () => {
            active = false;
            if (unlistenFn) {
                unlistenFn();
            }
        };
    }, [selectedServerId, isStreamingLogs]);

    const addToHistory = useCallback((cmd: string, response: string, success: boolean) => {
        if (!selectedServerId) return;
        let cleanResponse = response;
        if (cleanResponse && cleanResponse.trim() === 'Server received, But no response!!') {
            cleanResponse = 'Command executed successfully';
        }
        addHistory(selectedServerId, {
            command: cmd,
            response: cleanResponse,
            timestamp: new Date(),
            success,
        });
    }, [selectedServerId, addHistory]);

    const refreshPlayers = useCallback(async () => {
        if (!selectedServerId || !isConnected) return;

        try {
            const playerList = await invoke<RconPlayer[]>('rcon_get_players', {
                serverId: selectedServerId,
            });
            setPlayers(selectedServerId, playerList);
        } catch (error) {
            const errMsg = String(error);
            console.error('Failed to get players:', errMsg);

            if (errMsg.toLowerCase().includes('connection lost') || errMsg.includes('No active RCON connection') || errMsg.toLowerCase().includes('reconnect')) {
                setConnected(selectedServerId, false);
                setPlayers(selectedServerId, []);
                setConnectionInfo(selectedServerId, null);
            }
        }
    }, [selectedServerId, isConnected, setPlayers, setConnected, setConnectionInfo]);

    const connect = useCallback(async () => {
        if (!selectedServer) return;

        setConnecting(selectedServer.id, true);
        setLastError(selectedServer.id, null);
        try {
            const address = selectedServer.ipAddress || '127.0.0.1';
            const port = selectedServer.ports.rconPort;
            console.log(`[RCON] Connecting to ${address}:${port}...`);
            const response = await invoke<RconResponse>('rcon_connect', {
                serverId: selectedServer.id,
                address,
                port,
                password: selectedServer.config.adminPassword,
            });

            if (response.success) {
                console.log('[RCON] Connected successfully!');
                setConnected(selectedServer.id, true);
                setConnectionInfo(selectedServer.id, {
                    address,
                    port,
                    connectedSince: new Date(),
                });
                toast.success(t('rcon.connectedMsg', 'Connected to RCON'));
                addToHistory('connect', t('rcon.connectedMsg', 'Connected to RCON'), true);
                refreshPlayers();
            }
        } catch (error) {
            const errMsg = String(error);
            console.error('[RCON] Connection failed:', errMsg);
            setLastError(selectedServer.id, errMsg);
            toast.error(t('rcon.connectFailed', { error: errMsg, defaultValue: `Connection failed: ${errMsg}` }));
            addToHistory('connect', `Failed: ${errMsg}`, false);
        } finally {
            setConnecting(selectedServer.id, false);
        }
    }, [selectedServer, setConnecting, setLastError, setConnected, setConnectionInfo, t, addToHistory, refreshPlayers]);

    const disconnect = useCallback(async () => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_disconnect', { serverId: selectedServerId });
            setConnected(selectedServerId, false);
            setPlayers(selectedServerId, []);
            setConnectionInfo(selectedServerId, null);
            setLastError(selectedServerId, null);
            setIsStreamingLogs(false);
            setLogStream([]);
            toast.success(t('rcon.disconnectedMsg', 'Disconnected from RCON'));
            addToHistory('disconnect', t('rcon.disconnectedMsg', 'Disconnected from RCON'), true);
        } catch (error) {
            const errMsg = String(error);
            if (errMsg.includes('No active RCON connection')) {
                setConnected(selectedServerId, false);
                setPlayers(selectedServerId, []);
                setConnectionInfo(selectedServerId, null);
                setIsStreamingLogs(false);
                setLogStream([]);
                toast.success(t('rcon.disconnectedMsg', 'Disconnected from RCON'));
                return;
            }
            toast.error(t('rcon.disconnectFailed', { error: errMsg, defaultValue: `Disconnect failed: ${errMsg}` }));
        }
    }, [selectedServerId, setConnected, setPlayers, setConnectionInfo, setLastError, t, addToHistory]);

    const sendCommand = useCallback(async (cmd?: string) => {
        const cmdToSend = cmd || command;
        if (!cmdToSend.trim() || !selectedServerId || !isConnected) return;

        const normalized = cmdToSend.trim().toLowerCase();
        const isDinoWipe = normalized.endsWith('destroywilddinos');
        const isSaveWorld = normalized.endsWith('saveworld');

        if (isDinoWipe && dinoWipeBroadcastEnabled) {
            const msg = dinoWipeBroadcastMsg.trim();
            if (msg) {
                try {
                    await invoke<RconResponse>('rcon_send_command', {
                        serverId: selectedServerId,
                        command: `Broadcast "${msg}"`,
                    });
                    addToHistory(`Broadcast "${msg}"`, 'Broadcast sent successfully', true);
                } catch (e) {
                    console.error('Failed to send auto-broadcast before dino wipe:', e);
                    addToHistory(`Broadcast "${msg}"`, String(e), false);
                }
            }
            if (dinoWipeBroadcastDelay > 0) {
                toast.loading(`Waiting ${dinoWipeBroadcastDelay}s before Dino Wipe...`, { id: 'dino_wipe_toast' });
                await new Promise(resolve => setTimeout(resolve, dinoWipeBroadcastDelay * 1000));
                toast.dismiss('dino_wipe_toast');
            }
        } else if (isSaveWorld && saveWorldBroadcastEnabled) {
            const msg = saveWorldBroadcastMsg.trim();
            if (msg) {
                try {
                    await invoke<RconResponse>('rcon_send_command', {
                        serverId: selectedServerId,
                        command: `Broadcast "${msg}"`,
                    });
                    addToHistory(`Broadcast "${msg}"`, 'Broadcast sent successfully', true);
                } catch (e) {
                    console.error('Failed to send auto-broadcast before save:', e);
                    addToHistory(`Broadcast "${msg}"`, String(e), false);
                }
            }
            if (saveWorldBroadcastDelay > 0) {
                toast.loading(`Waiting ${saveWorldBroadcastDelay}s before World Save...`, { id: 'save_world_toast' });
                await new Promise(resolve => setTimeout(resolve, saveWorldBroadcastDelay * 1000));
                toast.dismiss('save_world_toast');
            }
        }

        try {
            const response = await invoke<RconResponse>('rcon_send_command', {
                serverId: selectedServerId,
                command: cmdToSend,
            });

            addToHistory(cmdToSend, response.data || response.message, response.success);
            setLastError(selectedServerId, null);

            if (!cmd) {
                setCommand('');
                setHistoryIndex(-1);
                setAutocompleteVisible(false);
            }
        } catch (error) {
            const errMsg = String(error);
            addToHistory(cmdToSend, errMsg, false);
            setLastError(selectedServerId, errMsg);

            if (errMsg.toLowerCase().includes('connection lost') || errMsg.includes('No active RCON connection') || errMsg.toLowerCase().includes('reconnect')) {
                setConnected(selectedServerId, false);
                setPlayers(selectedServerId, []);
                setConnectionInfo(selectedServerId, null);
                setIsStreamingLogs(false);
            }
        }
    }, [
        command,
        selectedServerId,
        isConnected,
        addToHistory,
        setLastError,
        setConnected,
        setPlayers,
        setConnectionInfo,
        dinoWipeBroadcastEnabled,
        dinoWipeBroadcastMsg,
        dinoWipeBroadcastDelay,
        saveWorldBroadcastEnabled,
        saveWorldBroadcastMsg,
        saveWorldBroadcastDelay
    ]);

    // Connection Heartbeat: Verify connection is still alive every 15 seconds
    useEffect(() => {
        if (!isConnected || !selectedServerId) return;

        const interval = setInterval(async () => {
            try {
                const connected = await invoke<boolean>('rcon_is_connected', {
                    serverId: selectedServerId,
                });

                if (!connected) {
                    console.log('[RCON] Heartbeat detected lost connection');
                    setConnected(selectedServerId, false);
                    setPlayers(selectedServerId, []);
                    setConnectionInfo(selectedServerId, null);
                    setIsStreamingLogs(false);
                    addToHistory('system', t('rcon.connectionLost', 'Connection to RCON was lost'), false);
                }
            } catch (error) {
                console.error('[RCON] Heartbeat check failed:', error);
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [isConnected, selectedServerId, setConnected, setPlayers, setConnectionInfo, addToHistory, t]);

    const kickPlayer = useCallback(async (steamId: string, reason?: string) => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_kick_player', {
                serverId: selectedServerId,
                steamId,
                reason,
            });
            toast.success(t('rcon.playerKicked', 'Player kicked successfully'));
            refreshPlayers();
        } catch (error) {
            toast.error(t('rcon.kickFailed', { error: String(error), defaultValue: `Kick failed: ${error}` }));
        }
    }, [selectedServerId, refreshPlayers, t]);

    const banPlayer = useCallback(async (steamId: string) => {
        if (!selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_ban_player', {
                serverId: selectedServerId,
                steamId,
            });
            toast.success(t('rcon.playerBanned', 'Player banned successfully'));
            refreshPlayers();
        } catch (error) {
            toast.error(t('rcon.banFailed', { error: String(error), defaultValue: `Ban failed: ${error}` }));
        }
    }, [selectedServerId, refreshPlayers, t]);

    const broadcastMessage = useCallback(async () => {
        const message = prompt(t('rcon.broadcastPrompt', 'Enter the global announcement text:'));
        if (!message || !selectedServerId) return;

        try {
            await invoke<RconResponse>('rcon_broadcast', {
                serverId: selectedServerId,
                message,
            });
            toast.success(t('rcon.broadcastSent', 'Announcement sent'));
            addToHistory(`Broadcast ${message}`, t('rcon.broadcastSent', 'Announcement sent'), true);
        } catch (error) {
            toast.error(t('rcon.broadcastFailed', { error: String(error), defaultValue: `Broadcast failed: ${error}` }));
        }
    }, [selectedServerId, addToHistory, t]);

    const sendChatMessage = useCallback(async () => {
        const message = prompt(t('rcon.chatPrompt', 'Enter the global chat message:'));
        if (!message || !selectedServerId) return;

        try {
            const response = await invoke<RconResponse>('rcon_send_command', {
                serverId: selectedServerId,
                command: `ServerChat ${message}`,
            });
            toast.success(t('rcon.chatSent', 'Chat message sent'));
            addToHistory(`ServerChat ${message}`, response.data || response.message, response.success);
        } catch (error) {
            toast.error(t('rcon.chatFailed', { error: String(error), defaultValue: `Failed to send chat: ${error}` }));
        }
    }, [selectedServerId, addToHistory, t]);

    // Filter autocomplete suggestions based on user typing
    const suggestions = useMemo(() => {
        if (!command.trim() || command.includes(' ')) return [];
        return AUTOCOMPLETE_COMMANDS.filter(c =>
            c.command.toLowerCase().startsWith(command.toLowerCase())
        );
    }, [command]);

    useEffect(() => {
        Promise.resolve().then(() => {
            if (suggestions.length > 0) {
                setAutocompleteVisible(true);
            } else {
                setAutocompleteVisible(false);
            }
            setAutocompleteIndex(0);
        });
    }, [suggestions]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (autocompleteVisible && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAutocompleteIndex(prev => (prev + 1) % suggestions.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAutocompleteIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                return;
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                setCommand(suggestions[autocompleteIndex].command + ' ');
                setAutocompleteVisible(false);
                return;
            }
            if (e.key === 'Escape') {
                setAutocompleteVisible(false);
                return;
            }
        }

        if (e.key === 'Enter') {
            sendCommand();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const commands = commandHistory.map(h => h.command);
            if (historyIndex < commands.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setCommand(commands[commands.length - 1 - newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const commands = commandHistory.map(h => h.command);
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setCommand(commands[commands.length - 1 - newIndex]);
            } else {
                setHistoryIndex(-1);
                setCommand('');
            }
        }
    };

    // Execute cluster command
    const executeClusterCommand = async () => {
        if (!clusterCommand.trim() || clusterSelectedServers.length === 0) return;
        
        setClusterIsExecuting(true);
        const nextProgress = { ...clusterProgress };
        clusterSelectedServers.forEach(id => {
            nextProgress[id] = { status: 'sending', response: 'Sending...' };
        });
        setClusterProgress(nextProgress);

        try {
            const results = await invoke<ClusterResult[]>('rcon_execute_cluster_command', {
                serverIds: clusterSelectedServers,
                command: clusterCommand
            });

            const finalProgress = { ...clusterProgress };
            results.forEach(res => {
                finalProgress[res.server_id] = {
                    status: res.success ? 'success' : 'error',
                    response: res.response
                };
            });
            setClusterProgress(finalProgress);
            toast.success(t('rcon.clusterExecComplete', 'Cluster commands execution complete'));
        } catch (error) {
            console.error('Cluster execution failed:', error);
            toast.error(t('rcon.clusterExecFailed', `Cluster execution failed: ${error}`));
        } finally {
            setClusterIsExecuting(false);
        }
    };

    // RCON command to give item to a player
    const executeGiveItem = async () => {
        if (!selectedServerId || !isConnected) {
            toast.error(t('rcon.notConnected', 'Must be connected to send commands'));
            return;
        }

        let targetId = giveTargetType === 'online' ? giveSelectedPlayerId : giveManualPlayerId;
        if (giveTargetType === 'online' && resolvedPlayerIds[giveSelectedPlayerId]) {
            targetId = resolvedPlayerIds[giveSelectedPlayerId];
        }

        if (!targetId.trim()) {
            toast.error(t('rcon.giveItem.noTarget', 'Please select a player or enter a Player ID'));
            return;
        }

        const blueprint = giveItemSource === 'preset' ? giveSelectedPresetItem : giveCustomBlueprint;
        if (!blueprint.trim()) {
            toast.error(t('rcon.giveItem.noBlueprint', 'Please select an item or enter a custom blueprint path'));
            return;
        }

        setIsGivingItem(true);
        
        // Construct command: GiveItemToPlayer <PlayerID> <BlueprintPath> <Quantity> <Quality> <ForceBlueprint>
        const isBp = giveForceBlueprint ? 1 : 0;
        const formattedCmd = `GiveItemToPlayer ${targetId} "${blueprint}" ${giveItemQuantity} ${giveItemQuality} ${isBp}`;

        try {
            const response = await invoke<RconResponse>('rcon_send_command', {
                serverId: selectedServerId,
                command: formattedCmd,
            });

            addToHistory(formattedCmd, response.data || response.message, response.success);
            
            if (response.success) {
                toast.success(t('rcon.giveItem.success', 'Item command sent successfully!'));
            } else {
                toast.error(t('rcon.giveItem.failed', { error: response.message, defaultValue: `Failed: ${response.message}` }));
            }
        } catch (error) {
            const errMsg = String(error);
            addToHistory(formattedCmd, errMsg, false);
            toast.error(t('rcon.giveItem.failed', { error: errMsg, defaultValue: `Failed: ${errMsg}` }));
        } finally {
            setIsGivingItem(false);
        }
    };

    // Dedicated verified manual world save procedure
    const triggerManualSave = async () => {
        if (!selectedServerId || !isConnected) {
            toast.error(t('rcon.notConnectedSave', 'Must be connected to run saves.'));
            return;
        }

        setSaveProgressState('sending');
        setSaveValidationResult(null);

        try {
            if (saveWorldBroadcastEnabled && saveWorldBroadcastMsg.trim()) {
                const msg = saveWorldBroadcastMsg.trim();
                try {
                    await invoke<RconResponse>('rcon_send_command', {
                        serverId: selectedServerId,
                        command: `Broadcast "${msg}"`,
                    });
                    addToHistory(`Broadcast "${msg}"`, 'Broadcast sent successfully', true);
                } catch (e) {
                    console.error('Failed to send auto-broadcast before manual save:', e);
                    addToHistory(`Broadcast "${msg}"`, String(e), false);
                }
                if (saveWorldBroadcastDelay > 0) {
                    toast.loading(`Waiting ${saveWorldBroadcastDelay}s before World Save...`, { id: 'save_world_toast' });
                    await new Promise(resolve => setTimeout(resolve, saveWorldBroadcastDelay * 1000));
                    toast.dismiss('save_world_toast');
                }
            }

            // Step 1: Send SaveWorld command via RCON
            await invoke<RconResponse>('rcon_save_world', { serverId: selectedServerId });
            
            // Step 2: Waiting for server disk sync (3 seconds delay to let engine flush stream)
            setSaveProgressState('syncing');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Step 3: Verifying filesystem integrity
            setSaveProgressState('verifying');
            const validationInfo = await invoke<SaveValidationInfo>('rcon_validate_save', { serverId: selectedServerId });
            
            setSaveValidationResult(validationInfo);
            
            if (validationInfo.exists && validationInfo.integrity_ok) {
                setSaveProgressState('success');
                toast.success(t('rcon.saveVerified', 'World save successfully verified!'));
                
                setSaveValidationHistory(prev => [
                    {
                        serverId: selectedServerId,
                        serverName: selectedServer?.name || `Server #${selectedServerId}`,
                        timestamp: new Date(),
                        info: validationInfo
                    },
                    ...prev
                ]);
            } else {
                setSaveProgressState('error');
                toast.error(validationInfo.error_message || t('rcon.saveIntegrityError', 'Save file verification failed.'));
            }
        } catch (error) {
            console.error('Manual save failed:', error);
            setSaveProgressState('error');
            toast.error(t('rcon.saveFailed', `Manual save failed: ${error}`));
        }
    };

    // Filter live log stream
    const filteredLogs = useMemo(() => {
        if (!logSearchQuery.trim()) return logStream;
        const q = logSearchQuery.toLowerCase();
        return logStream.filter(l => l.line.toLowerCase().includes(q));
    }, [logStream, logSearchQuery]);

    // Format bytes to human readable sizes
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = 2;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const renderErrorResponse = (response: string) => {
        const { category, icon: ErrorIcon, colorClass } = classifyError(response);
        return (
            <div className={cn("pl-4 mt-1.5 flex items-start gap-2.5 p-2 rounded-lg border text-sm font-sans", colorClass)}>
                <ErrorIcon className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                    <span className="font-bold">{category}:</span>{' '}
                    <span className="whitespace-pre-wrap opacity-90">{response}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20 select-none">
            {/* Header section with layout adjustments */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/30 p-5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 flex items-center gap-3">
                        <TerminalIcon className="w-8 h-8 text-cyan-400" />
                        {t('rcon.title', 'RCON Console')}
                    </h1>
                    <p className="text-slate-400 mt-1 text-sm">{t('rcon.description', 'Advanced live logs streaming, cluster controls and world save verification')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <ServerSelect 
                        value={selectedServerId} 
                        onChange={setSelectedServerId} 
                        accentColor="sky" 
                    />

                    <button
                        onClick={() => setIsHelpOpen(true)}
                        className="p-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 hover:text-cyan-400 rounded-xl text-slate-400 transition-colors"
                        title="RCON Commands Guide"
                    >
                        <HelpCircle className="w-5 h-5" />
                    </button>

                    <button
                        onClick={isConnected ? disconnect : connect}
                        disabled={isConnecting || !selectedServer}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg active:scale-98",
                            isConnected
                                ? "bg-red-950/30 text-red-400 border border-red-500/30 hover:bg-red-900/30 shadow-red-950/10"
                                : "bg-cyan-950/30 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-900/30 shadow-cyan-950/10",
                            isConnecting && "opacity-50 cursor-wait"
                        )}
                    >
                        {isConnecting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : isConnected ? (
                            <WifiOff className="w-4 h-4" />
                        ) : (
                            <Wifi className="w-4 h-4" />
                        )}
                        {isConnecting ? t('rcon.connecting', 'Connecting...') : isConnected ? t('rcon.disconnect', 'Disconnect') : t('rcon.connect', 'Connect')}
                    </button>
                </div>
            </div>

            {/* Modern Glassmorphic Tabs Navigation */}
            <div className="flex p-1.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-md w-max shadow-inner gap-1 mb-2">
                <button
                    onClick={() => setActiveTab('terminal')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'terminal' 
                            ? "text-cyan-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <TerminalIcon className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.terminal', 'Interactive Terminal')}</span>
                </button>

                <button
                    onClick={() => setActiveTab('log_stream')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'log_stream' 
                            ? "text-blue-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <Eye className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.logStream', 'Live Log Feed')}</span>
                    {isStreamingLogs && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('cluster')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'cluster' 
                            ? "text-sky-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <Layers className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.cluster', 'Cluster Deck')}</span>
                </button>

                <button
                    onClick={() => setActiveTab('save_manager')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'save_manager' 
                            ? "text-emerald-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <Save className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.saveManager', 'Verified Saves')}</span>
                </button>

                <button
                    onClick={() => setActiveTab('give_items')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'give_items' 
                            ? "text-amber-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <Gift className="w-4 h-4" />
                    <span className="relative z-10">{t('rcon.tabs.giveItems', 'Give Items')}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* Main Action Deck Container */}
                <div className="lg:col-span-3 glass-panel rounded-2xl border border-slate-800 bg-slate-900/10 p-5 flex flex-col min-h-[600px] relative overflow-visible">
                    
                    {/* TAB 1: INTERACTIVE TERMINAL */}
                    {activeTab === 'terminal' && (
                        <div className="flex-1 flex flex-col h-full">
                            {/* Connection Info Bar */}
                            {isConnected && connectionInfo && (
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl text-xs font-mono text-cyan-400">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                                        <span>{t('rcon.connectedTo', { address: `${connectionInfo.address}:${connectionInfo.port}`, defaultValue: `Connected to ${connectionInfo.address}:${connectionInfo.port}` })}</span>
                                    </div>
                                    {connectionInfo.connectedSince && (
                                        <span className="text-cyan-500/60 font-sans">
                                            {t('rcon.since', { time: connectionInfo.connectedSince.toLocaleTimeString(), defaultValue: `since ${connectionInfo.connectedSince.toLocaleTimeString()}` })}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Quick Commands Grid */}
                            <div className="flex flex-wrap gap-2.5 mb-4 pb-4 border-b border-slate-800/60">
                                {QUICK_COMMANDS.map((qc) => (
                                    <button
                                        key={qc.command}
                                        onClick={() => sendCommand(qc.command)}
                                        disabled={!isConnected}
                                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-900/60 hover:bg-slate-850 border border-slate-800/80 rounded-xl text-xs text-slate-300 font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <qc.icon className="w-4 h-4 text-cyan-400" />
                                        {t(qc.labelKey, qc.labelDefault)}
                                    </button>
                                ))}
                                <button
                                    onClick={broadcastMessage}
                                    disabled={!isConnected}
                                    className="flex items-center gap-2 px-3.5 py-2 bg-amber-950/20 hover:bg-amber-900/20 border border-amber-800/30 rounded-xl text-xs text-amber-400 font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Megaphone className="w-4 h-4" />
                                    {t('rcon.quickCommands.broadcast', 'Broadcast')}
                                </button>
                                <button
                                    onClick={sendChatMessage}
                                    disabled={!isConnected}
                                    className="flex items-center gap-2 px-3.5 py-2 bg-blue-950/20 hover:bg-blue-900/20 border border-blue-800/30 rounded-xl text-xs text-blue-400 font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    {t('rcon.quickCommands.serverChat', 'Send Chat')}
                                </button>
                                <button
                                    onClick={() => setShowAutoBroadcastSettings(!showAutoBroadcastSettings)}
                                    className={cn(
                                        "flex items-center gap-2 px-3.5 py-2 border rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 focus:outline-none",
                                        showAutoBroadcastSettings ? "bg-cyan-950/20 border-cyan-800/30 text-cyan-400" : "bg-slate-900/60 border-slate-800/85 text-slate-300 hover:text-white"
                                    )}
                                >
                                    <Sliders className="w-4 h-4" />
                                    <span>{t('rcon.quickCommands.autoBroadcast', 'Auto Broadcast Settings')}</span>
                                </button>
                                <button
                                onClick={() => {
                                    if (selectedServerId) clearServerState(selectedServerId);
                                }}
                                    className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 text-slate-400 hover:text-slate-300 border border-slate-850 rounded-xl text-xs ml-auto transition-all active:scale-95"
                                    title="Clear output console log buffer"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>{t('rcon.clearLogs', 'Clear')}</span>
                                </button>
                            </div>

                            {/* Auto Broadcast Collapsible Settings Panel */}
                            <AnimatePresence>
                                {showAutoBroadcastSettings && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden mb-4 bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-4 text-xs text-slate-300 font-sans shadow-inner"
                                    >
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                                            <span className="font-bold text-white flex items-center gap-1.5">
                                                <Sliders className="w-4 h-4 text-cyan-400" />
                                                Auto-Broadcast Action Alerts
                                            </span>
                                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                                                Configure alerts sent to players before actions
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Dino Wipe Block */}
                                            <div className="space-y-3 bg-slate-900/40 p-3 rounded-lg border border-slate-850">
                                                <div className="flex items-center justify-between">
                                                    <label className="font-semibold text-slate-200 flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={dinoWipeBroadcastEnabled}
                                                            onChange={(e) => setDinoWipeBroadcastEnabled(e.target.checked)}
                                                            className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                                                        />
                                                        Auto Broadcast on Dino Wipe
                                                    </label>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <span className="text-[10px] text-slate-500">Alert Message</span>
                                                    <input
                                                        type="text"
                                                        value={dinoWipeBroadcastMsg}
                                                        onChange={(e) => setDinoWipeBroadcastMsg(e.target.value)}
                                                        disabled={!dinoWipeBroadcastEnabled}
                                                        placeholder="Message to display..."
                                                        className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-700 focus:outline-none disabled:opacity-50"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-slate-500">Execution Delay (Seconds):</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="60"
                                                        value={dinoWipeBroadcastDelay}
                                                        onChange={(e) => setDinoWipeBroadcastDelay(parseInt(e.target.value, 10) || 0)}
                                                        disabled={!dinoWipeBroadcastEnabled}
                                                        className="w-16 bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-center text-white focus:outline-none disabled:opacity-50"
                                                    />
                                                </div>
                                            </div>

                                            {/* Save World Block */}
                                            <div className="space-y-3 bg-slate-900/40 p-3 rounded-lg border border-slate-850">
                                                <div className="flex items-center justify-between">
                                                    <label className="font-semibold text-slate-200 flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={saveWorldBroadcastEnabled}
                                                            onChange={(e) => setSaveWorldBroadcastEnabled(e.target.checked)}
                                                            className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                                                        />
                                                        Auto Broadcast on Save World
                                                    </label>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <span className="text-[10px] text-slate-500">Alert Message</span>
                                                    <input
                                                        type="text"
                                                        value={saveWorldBroadcastMsg}
                                                        onChange={(e) => setSaveWorldBroadcastMsg(e.target.value)}
                                                        disabled={!saveWorldBroadcastEnabled}
                                                        placeholder="Message to display..."
                                                        className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-700 focus:outline-none disabled:opacity-50"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-slate-500">Execution Delay (Seconds):</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="60"
                                                        value={saveWorldBroadcastDelay}
                                                        onChange={(e) => setSaveWorldBroadcastDelay(parseInt(e.target.value, 10) || 0)}
                                                        disabled={!saveWorldBroadcastEnabled}
                                                        className="w-16 bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-center text-white focus:outline-none disabled:opacity-50"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Terminal Shell scroll view */}
                            <div
                                ref={terminalRef}
                                className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-sm overflow-y-auto mb-4 border border-slate-850 max-h-[400px] shadow-inner"
                                onClick={() => inputRef.current?.focus()}
                            >
                                {commandHistory.length === 0 ? (
                                    <div className="text-slate-500 italic text-xs p-2">
                                        {isConnected
                                            ? t('rcon.welcomeMsg', 'RCON Connection ready. Enter commands in the prompt below.')
                                            : t('rcon.connectMsg', 'Please click "Connect" to open RCON connection.')}
                                    </div>
                                ) : (
                                    commandHistory.map((entry, i) => (
                                        <div key={i} className="mb-4 last:mb-1 animate-in fade-in duration-300">
                                            <div className="flex items-center gap-2 border-b border-slate-900/50 pb-1 mb-1.5">
                                                <span className="text-cyan-500 font-bold">❯</span>
                                                <span className="text-cyan-400 text-xs font-semibold">{entry.command}</span>
                                                <span className="text-slate-600 text-[10px] ml-auto">
                                                    {entry.timestamp.toLocaleTimeString()}
                                                </span>
                                            </div>
                                            {entry.success ? (
                                                <div className="pl-4 whitespace-pre-wrap text-slate-300 text-xs leading-relaxed font-sans bg-slate-900/20 p-2.5 rounded-lg border border-slate-900/50">
                                                    {entry.response}
                                                </div>
                                            ) : (
                                                renderErrorResponse(entry.response)
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Command Input & Autocomplete system */}
                            <div className="relative">
                                <div className="flex items-center gap-3 bg-slate-950 rounded-xl px-4 py-3 border border-slate-850 focus-within:border-cyan-500/50 transition-all duration-300 shadow-md">
                                    <TerminalIcon className="w-5 h-5 text-cyan-400 shrink-0" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={command}
                                        onChange={(e) => setCommand(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={isConnected ? t('rcon.typeCommand', 'Type an RCON command and press Enter...') : t('rcon.connectMsg', 'Please click "Connect" to open RCON connection.')}
                                        disabled={!isConnected}
                                        className="flex-1 bg-transparent text-white text-sm focus:outline-none font-mono placeholder:text-slate-600 disabled:cursor-not-allowed"
                                    />
                                    <button
                                        onClick={() => sendCommand()}
                                        disabled={!isConnected || !command.trim()}
                                        className="p-2 bg-cyan-950/50 hover:bg-cyan-900/20 text-cyan-400 border border-cyan-800/30 rounded-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Autocomplete Suggestion Dropdown */}
                                {autocompleteVisible && suggestions.length > 0 && (
                                    <div className="absolute left-0 bottom-full mb-2 w-full bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                                        <div className="bg-slate-900/50 px-4 py-2 border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                                            RCON Command Autocomplete (Use ↑ ↓ Tab / Enter to select)
                                        </div>
                                        <div className="max-h-[220px] overflow-y-auto">
                                            {suggestions.map((s, idx) => (
                                                <button
                                                    key={s.command}
                                                    onClick={() => {
                                                        setCommand(s.command + ' ');
                                                        setAutocompleteVisible(false);
                                                        inputRef.current?.focus();
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-4 py-3 flex items-center justify-between text-xs border-b border-slate-900/40 transition-colors",
                                                        idx === autocompleteIndex 
                                                            ? "bg-cyan-950/30 text-cyan-400 border-l-2 border-l-cyan-400" 
                                                            : "text-slate-300 hover:bg-slate-900/40"
                                                    )}
                                                >
                                                    <span className="font-mono font-semibold">{s.command}</span>
                                                    <span className="text-slate-500 text-[11px] font-sans truncate ml-4 max-w-[60%]">{s.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 2: LIVE LOG STREAM FEED */}
                    {activeTab === 'log_stream' && (
                        <div className="flex-1 flex flex-col h-full">
                            {/* Streaming Control Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 border border-slate-850 p-4 rounded-xl mb-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setIsStreamingLogs(!isStreamingLogs)}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95",
                                            isStreamingLogs
                                                ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20 hover:bg-emerald-900/20"
                                                : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-300"
                                        )}
                                    >
                                        {isStreamingLogs ? (
                                            <>
                                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                <span>Log Streaming Active</span>
                                            </>
                                        ) : (
                                            <>
                                                <EyeOff className="w-4 h-4" />
                                                <span>Enable Log Streaming</span>
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                                        className={cn(
                                            "p-2 rounded-xl border text-xs transition-colors",
                                            autoScrollLogs
                                                ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/20 hover:bg-cyan-900/20"
                                                : "bg-slate-950 text-slate-500 border-slate-850 hover:text-slate-400"
                                        )}
                                        title={autoScrollLogs ? "Auto-scroll logs enabled" : "Auto-scroll logs paused"}
                                    >
                                        {autoScrollLogs ? <Check className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                    </button>

                                    <button
                                        onClick={() => setLogStream([])}
                                        className="p-2 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl text-slate-500 hover:text-red-400 transition-colors"
                                        title="Clear live logs"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="relative max-w-xs w-full">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={logSearchQuery}
                                        onChange={(e) => setLogSearchQuery(e.target.value)}
                                        placeholder="Quick filter log content..."
                                        className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                                    />
                                </div>
                            </div>

                            {/* Log Feed Console view */}
                            <div
                                ref={logFeedRef}
                                className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-xs overflow-y-auto border border-slate-850 max-h-[420px] shadow-inner text-slate-400 leading-relaxed"
                            >
                                {filteredLogs.length === 0 ? (
                                    <div className="text-slate-600 italic text-center py-12">
                                        {isStreamingLogs 
                                            ? "Waiting for ShooterGame.log events... (or search found zero hits)" 
                                            : "Streaming is disabled. Enable it above to listen to live server logs in real time."}
                                    </div>
                                ) : (
                                    filteredLogs.map((entry, idx) => (
                                        <div key={idx} className="mb-2 last:mb-0 hover:bg-slate-900/30 p-1 rounded transition-colors flex items-start gap-3">
                                            <span className="text-slate-600 text-[10px] shrink-0 mt-0.5 select-none">{entry.timestamp.toLocaleTimeString()}</span>
                                            <span className="whitespace-pre-wrap break-all">{entry.line}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 3: CLUSTER COMMAND CONTROL PANEL */}
                    {activeTab === 'cluster' && (
                        <div className="flex-1 flex flex-col h-full space-y-5">
                            <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl">
                                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-cyan-400" />
                                    <span>Cluster wide target server selection</span>
                                </h3>
                                <p className="text-xs text-slate-400 mb-4">Select which active servers this command will execute on simultaneously:</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {servers.map(server => (
                                        <label
                                            key={server.id}
                                            className={cn(
                                                "p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all hover:bg-slate-800/40",
                                                clusterSelectedServers.includes(server.id)
                                                    ? "bg-cyan-950/15 border-cyan-500/20 text-cyan-300"
                                                    : "bg-slate-900/50 border-slate-850 text-slate-400"
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={clusterSelectedServers.includes(server.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setClusterSelectedServers(prev => [...prev, server.id]);
                                                    } else {
                                                        setClusterSelectedServers(prev => prev.filter(id => id !== server.id));
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-slate-800 accent-cyan-500 bg-slate-950 focus:ring-0 cursor-pointer"
                                            />
                                            <div className="truncate">
                                                <p className="text-xs font-semibold text-white truncate">{server.name}</p>
                                                <p className="text-[10px] text-slate-500 font-mono">{server.ipAddress || '127.0.0.1'}:{server.ports.rconPort}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Command Input Deck */}
                            <div className="flex items-center gap-3 bg-slate-950 rounded-xl px-4 py-3.5 border border-slate-850 focus-within:border-cyan-500/50 transition-all duration-300 shadow-md">
                                <TerminalIcon className="w-5 h-5 text-cyan-400" />
                                <input
                                    type="text"
                                    value={clusterCommand}
                                    onChange={(e) => setClusterCommand(e.target.value)}
                                    placeholder="Enter command to broadcast/run on all cluster members simultaneously..."
                                    className="flex-1 bg-transparent text-white text-sm focus:outline-none font-mono placeholder:text-slate-600"
                                    disabled={clusterIsExecuting}
                                />
                                <button
                                    onClick={executeClusterCommand}
                                    disabled={clusterIsExecuting || !clusterCommand.trim() || clusterSelectedServers.length === 0}
                                    className="flex items-center gap-2 px-5 py-2 bg-cyan-950/50 hover:bg-cyan-900/20 text-cyan-400 border border-cyan-800/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {clusterIsExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                    <span>Execute</span>
                                </button>
                            </div>

                            {/* Responses Output Cards Grid */}
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                {Object.keys(clusterProgress).length === 0 ? (
                                    <div className="text-slate-600 italic text-xs py-8 text-center bg-slate-950/20 rounded-xl border border-slate-900/50">
                                        No cluster executions triggered yet in this session.
                                    </div>
                                ) : (
                                    Object.entries(clusterProgress).map(([idStr, val]) => {
                                        const sId = Number(idStr);
                                        const server = servers.find(s => s.id === sId);
                                        return (
                                            <div
                                                key={sId}
                                                className="bg-slate-950 rounded-xl p-4 border border-slate-850 flex items-start gap-4 hover:border-slate-800 transition-colors duration-200"
                                            >
                                                <div className="w-40 truncate">
                                                    <p className="text-xs font-bold text-white truncate">{server?.name || `Server #${sId}`}</p>
                                                    <div className="mt-1">
                                                        {val.status === 'sending' && (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                                                <span>Executing</span>
                                                            </span>
                                                        )}
                                                        {val.status === 'success' && (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                <Check className="w-2.5 h-2.5" />
                                                                <span>Success</span>
                                                            </span>
                                                        )}
                                                        {val.status === 'error' && (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                                <XCircle className="w-2.5 h-2.5" />
                                                                <span>Failed</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Response</p>
                                                    <div className="mt-1 font-mono text-[11px] text-slate-300 whitespace-pre-wrap bg-slate-900/30 p-2.5 rounded-lg border border-slate-900/50 truncate max-h-[100px] overflow-y-auto">
                                                        {val.response}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 4: MANUAL WORLD SAVE DECK */}
                    {activeTab === 'save_manager' && (
                        <div className="flex-1 flex flex-col h-full space-y-6">
                            
                            {/* Massive Verified Manual Save Control Board */}
                            <div className="bg-slate-950/40 border border-slate-850 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-md relative overflow-hidden">
                                <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none select-none text-[150px] text-cyan-400">
                                    🦖
                                </div>

                                <div className="space-y-2 max-w-lg">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Database className="w-5 h-5 text-cyan-400" />
                                        <span>Verified Save World Engine</span>
                                    </h3>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Triggers the <code className="text-cyan-400 font-semibold font-mono bg-cyan-950/20 px-1 py-0.5 rounded">SaveWorld</code> engine command via RCON and verifies that the output save file is successfully written to disk, checking size and timestamp metrics in real time.
                                    </p>
                                </div>

                                <div className="shrink-0 flex flex-col items-center gap-2">
                                    <button
                                        onClick={triggerManualSave}
                                        disabled={saveProgressState !== 'idle' && saveProgressState !== 'success' && saveProgressState !== 'error'}
                                        className={cn(
                                            "flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm shadow-xl transition-all duration-300 transform active:scale-95",
                                            saveProgressState === 'idle' || saveProgressState === 'success' || saveProgressState === 'error'
                                                ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-cyan-950/20"
                                                : "bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed"
                                        )}
                                    >
                                        {['sending', 'syncing', 'verifying'].includes(saveProgressState) ? (
                                            <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                                        ) : (
                                            <Save className="w-5 h-5" />
                                        )}
                                        <span>Trigger Verified Save</span>
                                    </button>

                                    {/* Action Status Label */}
                                    {saveProgressState === 'sending' && (
                                        <span className="text-[10px] text-amber-400 font-semibold animate-pulse">1. Sending RCON command...</span>
                                    )}
                                    {saveProgressState === 'syncing' && (
                                        <span className="text-[10px] text-amber-500 font-semibold animate-pulse">2. Waiting for server disk sync (3s)...</span>
                                    )}
                                    {saveProgressState === 'verifying' && (
                                        <span className="text-[10px] text-cyan-400 font-semibold animate-pulse">3. Scanning file integrity...</span>
                                    )}
                                    {saveProgressState === 'success' && (
                                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Save verified successfully!</span>
                                        </span>
                                    )}
                                    {saveProgressState === 'error' && (
                                        <span className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>Save verification failed</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Save Validation Result Panel */}
                            {saveValidationResult && (
                                <div className="bg-slate-950 rounded-2xl p-5 border border-slate-850 shadow-inner grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Save File Name</p>
                                        <p className="text-sm font-semibold text-white truncate font-mono mt-1" title={saveValidationResult.file_name}>
                                            {saveValidationResult.file_name}
                                        </p>
                                    </div>
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">File Size</p>
                                        <p className="text-sm font-semibold text-cyan-400 font-mono mt-1">
                                            {formatBytes(saveValidationResult.file_size_bytes)}
                                        </p>
                                    </div>
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Last Modified</p>
                                        <p className="text-sm font-semibold text-white truncate font-mono mt-1">
                                            {saveValidationResult.last_modified}
                                        </p>
                                    </div>
                                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">FS Integrity Scan</p>
                                        <div className="mt-1">
                                            {saveValidationResult.integrity_ok ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                                    <span>OK (PASSED)</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                                                    <span>CORRUPTED/FAILED</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Saves Validation Logs History */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-400 flex items-center gap-2">
                                    <History className="w-4 h-4" />
                                    <span>Verified Save validation logs history</span>
                                </h4>

                                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                                    {saveValidationHistory.length === 0 ? (
                                        <p className="text-[11px] text-slate-600 italic py-4">No validation history records for this session.</p>
                                    ) : (
                                        saveValidationHistory.map((h, i) => (
                                            <div
                                                key={i}
                                                className="bg-slate-950/40 border border-slate-850/60 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs"
                                            >
                                                <div className="space-y-1">
                                                    <p className="font-bold text-white">{h.serverName}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono">{h.info.file_name}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-semibold text-cyan-400 font-mono">{formatBytes(h.info.file_size_bytes)}</span>
                                                    <p className="text-[9px] text-slate-500 mt-0.5">{h.timestamp.toLocaleTimeString()} | {h.info.last_modified}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 5: GIVE ITEMS (ADMIN CARGO SHIELD) */}
                    {activeTab === 'give_items' && (
                        <div className="flex-1 flex flex-col h-full space-y-6 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left Column: Target & Config */}
                                <div className="space-y-6">
                                    {/* Card 1: Target Selector */}
                                    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-xl space-y-4">
                                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                            <Users className="w-4 h-4 text-amber-400" />
                                            <span>{t('rcon.giveItem.targetSurvivor', 'Target Survivor')}</span>
                                        </h3>
                                        
                                        <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2 text-amber-400/90 text-xs shadow-inner">
                                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                                            <p className="leading-relaxed">
                                                <strong className="text-amber-500 font-medium">Vanilla ARK Warning:</strong> <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono text-[10px]">GiveItemToPlayer</code> requires the internal <strong>UE4 Player ID</strong>. Steam IDs or EOS IDs from the Online list will result in <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono text-[10px]">GiveItemToPlayer 0</code>.
                                                <br/>If you don't use API plugins, select <strong>Manual ID</strong> and enter the UE4 Player ID.
                                            </p>
                                        </div>
                                        
                                        <div className="flex p-1 rounded-lg bg-slate-950 border border-slate-850 w-full shadow-inner gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setGiveTargetType('online')}
                                                className={cn(
                                                    "flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
                                                    giveTargetType === 'online'
                                                        ? "text-amber-400 bg-slate-800/80 shadow"
                                                        : "text-slate-400 hover:text-slate-300"
                                                )}
                                            >
                                                {t('rcon.giveItem.targetType.online', 'Online Survivors')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGiveTargetType('manual')}
                                                className={cn(
                                                    "flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
                                                    giveTargetType === 'manual'
                                                        ? "text-amber-400 bg-slate-800/80 shadow"
                                                        : "text-slate-400 hover:text-slate-300"
                                                )}
                                            >
                                                {t('rcon.giveItem.targetType.manual', 'Manual ID / EOS ID')}
                                            </button>
                                        </div>

                                        {giveTargetType === 'online' ? (
                                            <div className="space-y-2">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                                    {t('rcon.giveItem.selectSurvivor', 'Select Survivor')}
                                                </label>
                                                {onlinePlayers.length === 0 ? (
                                                    <div className="bg-slate-900/50 border border-slate-850/60 rounded-xl p-3 text-center text-xs text-slate-500 italic">
                                                        {t('rcon.noPlayers', 'No survivors currently connected to this server.')}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        <select
                                                            value={giveSelectedPlayerId}
                                                            onChange={(e) => setGiveSelectedPlayerId(e.target.value)}
                                                            disabled={!isConnected}
                                                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-all font-sans cursor-pointer disabled:cursor-not-allowed"
                                                        >
                                                            {onlinePlayers.map((p) => (
                                                                <option key={p.steamId} value={p.steamId}>
                                                                    {p.name} ({p.steamId})
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <div className="text-[10px] mt-1 flex items-center gap-1.5 px-1">
                                                            {isResolvingIds ? (
                                                                <span className="text-amber-400 animate-pulse flex items-center gap-1">
                                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                                    Resolving UE4 Player ID...
                                                                </span>
                                                            ) : resolvedPlayerIds[giveSelectedPlayerId] ? (
                                                                <span className="text-emerald-400 font-medium flex items-center gap-1">
                                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                                    Resolved UE4 Player ID: <code className="bg-emerald-950/40 px-1 py-0.5 rounded font-mono text-emerald-300 text-[10px]">{resolvedPlayerIds[giveSelectedPlayerId]}</code>
                                                                </span>
                                                            ) : (
                                                                <span className="text-rose-400 font-medium flex items-center gap-1 leading-normal">
                                                                    <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                                                    Could not resolve Player ID automatically (save profile not found).
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                                    {t('rcon.giveItem.enterPlayerId', 'Enter Unique Player ID / SteamID / EOS ID')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={giveManualPlayerId}
                                                    onChange={(e) => setGiveManualPlayerId(e.target.value)}
                                                    placeholder="e.g. 123456789 or 76561198..."
                                                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50 font-mono transition-all"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Card 2: Configuration & Command Preview */}
                                    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-xl space-y-5">
                                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                            <Sliders className="w-4 h-4 text-amber-400" />
                                            <span>{t('rcon.giveItem.configuration', 'Attributes & Cargo Details')}</span>
                                        </h3>

                                        {/* Quantity Field */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                                    {t('rcon.giveItem.quantity', 'Quantity')}
                                                </label>
                                                <span className="text-xs font-mono font-bold text-amber-400">{giveItemQuantity}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="1000"
                                                value={giveItemQuantity}
                                                onChange={(e) => setGiveItemQuantity(parseInt(e.target.value))}
                                                className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                            />
                                            <div className="flex flex-wrap gap-1.5">
                                                {[1, 5, 20, 50, 100, 200, 500, 1000].map((qty) => (
                                                    <button
                                                        key={qty}
                                                        type="button"
                                                        onClick={() => setGiveItemQuantity(qty)}
                                                        className={cn(
                                                            "flex-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all",
                                                            giveItemQuantity === qty
                                                                ? "bg-amber-950/20 text-amber-400 border-amber-500/30"
                                                                : "bg-slate-900 border-slate-850 text-slate-500 hover:text-slate-400"
                                                        )}
                                                    >
                                                        {qty}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Quality Field */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                                    {t('rcon.giveItem.quality', 'Quality Index')}
                                                </label>
                                                <span className="text-xs font-mono font-bold text-amber-400">
                                                    {giveItemQuality === 0 ? 'Primitive (0)' : giveItemQuality === 2 ? 'Ramshackle (2)' : giveItemQuality === 4 ? 'Apprentice (4)' : giveItemQuality === 6 ? 'Journeyman (6)' : giveItemQuality === 10 ? 'Mastercraft (10)' : giveItemQuality === 20 ? 'Ascendant (20)' : `Custom (${giveItemQuality})`}
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={giveItemQuality}
                                                onChange={(e) => setGiveItemQuality(parseInt(e.target.value))}
                                                className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                            />
                                            <div className="flex gap-1.5">
                                                {[[0, 'Prim'], [2, 'Ram'], [4, 'App'], [6, 'Journ'], [10, 'Mast'], [20, 'Asc']].map(([val, label]) => (
                                                    <button
                                                        key={val}
                                                        type="button"
                                                        onClick={() => setGiveItemQuality(val as number)}
                                                        className={cn(
                                                            "flex-1 py-0.5 rounded text-[10px] font-semibold border transition-all",
                                                            giveItemQuality === val
                                                                ? "bg-amber-950/20 text-amber-400 border-amber-500/30"
                                                                : "bg-slate-900 border-slate-850 text-slate-500 hover:text-slate-400"
                                                        )}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Toggle Force Blueprint */}
                                        <div className="flex items-center justify-between p-3 bg-slate-900/30 border border-slate-850 rounded-xl">
                                            <div>
                                                <p className="text-xs font-semibold text-white">
                                                    {t('rcon.giveItem.forceBlueprint.title', 'Spawn Blueprint Only')}
                                                </p>
                                                <p className="text-[10px] text-slate-500">
                                                    {t('rcon.giveItem.forceBlueprint.desc', 'Gives the craftable blueprint instead of the item itself')}
                                                </p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={giveForceBlueprint}
                                                    onChange={(e) => setGiveForceBlueprint(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-slate-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950 peer-checked:after:border-amber-400" />
                                            </label>
                                        </div>

                                        {/* Command Preview */}
                                        <div className="bg-slate-950 rounded-xl p-3 border border-slate-850">
                                            <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">
                                                {t('rcon.giveItem.cmdPreview', 'Generated RCON Command Preview')}
                                            </p>
                                            <p className="text-xs font-mono text-slate-400 select-all mt-1 whitespace-pre-wrap break-all leading-normal">
                                                GiveItemToPlayer {giveTargetType === 'online' ? (giveSelectedPlayerId || '<PlayerID>') : (giveManualPlayerId || '<PlayerID>')} "{giveItemSource === 'preset' ? (giveSelectedPresetItem || '<ItemBlueprint>') : (giveCustomBlueprint || '<ItemBlueprint>')}" {giveItemQuantity} {giveItemQuality} {giveForceBlueprint ? 1 : 0}
                                            </p>
                                        </div>

                                        {/* Delivery Action Button */}
                                        <button
                                            type="button"
                                            onClick={executeGiveItem}
                                            disabled={isGivingItem || !isConnected}
                                            className={cn(
                                                "w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm shadow-xl transition-all duration-300 active:scale-98",
                                                isConnected
                                                    ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 shadow-amber-950/20"
                                                    : "bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed"
                                            )}
                                        >
                                            {isGivingItem ? (
                                                <RefreshCw className="w-5 h-5 animate-spin text-amber-300" />
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                            <span>
                                                {isGivingItem
                                                    ? t('rcon.giveItem.delivering', 'Delivering Cargo...')
                                                    : t('rcon.giveItem.deliver', 'Deliver Item to Survivor')}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* Right Column: Item Catalog / Selection */}
                                <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-xl flex flex-col space-y-4 min-h-[500px]">
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Package className="w-4 h-4 text-amber-400" />
                                        <span>{t('rcon.giveItem.itemCatalog', 'Cargo Catalog')}</span>
                                    </h3>

                                    <div className="flex p-1 rounded-lg bg-slate-950 border border-slate-850 w-full shadow-inner gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setGiveItemSource('preset')}
                                            className={cn(
                                                "flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
                                                giveItemSource === 'preset'
                                                    ? "text-amber-400 bg-slate-800/80 shadow"
                                                    : "text-slate-400 hover:text-slate-300"
                                            )}
                                        >
                                            {t('rcon.giveItem.presets', 'Preset Catalog')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setGiveItemSource('custom')}
                                            className={cn(
                                                "flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
                                                giveItemSource === 'custom'
                                                    ? "text-amber-400 bg-slate-800/80 shadow"
                                                    : "text-slate-400 hover:text-slate-300"
                                            )}
                                        >
                                            {t('rcon.giveItem.customBp', 'Custom Blueprint')}
                                        </button>
                                    </div>

                                    {giveItemSource === 'preset' ? (
                                        <div className="flex-1 flex flex-col space-y-3 min-h-0">
                                            {/* Category pill filters */}
                                            <div className="flex flex-wrap gap-1.5 p-1 bg-slate-900/25 border border-slate-900/40 rounded-xl shadow-inner">
                                                {(['All', 'Resources', 'Ammo', 'Gear', 'Structures'] as const).map((cat) => (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        onClick={() => setGiveSelectedCategory(cat)}
                                                        className={cn(
                                                            "px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all duration-200 active:scale-95",
                                                            giveSelectedCategory === cat
                                                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_1px_8px_rgba(245,158,11,0.08)]"
                                                                : "bg-slate-950 border-slate-900/40 text-slate-500 hover:text-slate-400"
                                                        )}
                                                    >
                                                        {t(`rcon.giveItem.categories.${cat.toLowerCase()}`, cat)}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Search box */}
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                                <input
                                                    type="text"
                                                    value={giveCatalogSearch}
                                                    onChange={(e) => setGiveCatalogSearch(e.target.value)}
                                                    placeholder={t('rcon.giveItem.searchPreset', 'Search items...')}
                                                    className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-amber-500/50 transition-all text-white"
                                                />
                                            </div>

                                            {/* Search Results List */}
                                            <div className="flex-1 overflow-y-auto max-h-[460px] border border-slate-850 rounded-xl divide-y divide-slate-900/50 bg-slate-950 pr-1">
                                                {PRESET_ITEMS.filter((item) => {
                                                    const matchesSearch = item.name.toLowerCase().includes(giveCatalogSearch.toLowerCase());
                                                    const matchesCategory = giveSelectedCategory === 'All' || item.category === giveSelectedCategory;
                                                    return matchesSearch && matchesCategory;
                                                }).length === 0 ? (
                                                    <div className="p-8 text-center text-xs text-slate-600 italic">
                                                        {t('rcon.giveItem.noMatches', 'No matching items found.')}
                                                    </div>
                                                ) : (
                                                    PRESET_ITEMS.filter((item) => {
                                                        const matchesSearch = item.name.toLowerCase().includes(giveCatalogSearch.toLowerCase());
                                                        const matchesCategory = giveSelectedCategory === 'All' || item.category === giveSelectedCategory;
                                                        return matchesSearch && matchesCategory;
                                                    }).map((item) => {
                                                        // Determine category badge colors dynamically
                                                        let badgeClass = "bg-slate-900 border border-slate-850 text-slate-500";
                                                        if (item.category === 'Resources') badgeClass = "bg-orange-950/15 border-orange-500/15 text-orange-400";
                                                        if (item.category === 'Ammo') badgeClass = "bg-red-950/15 border-red-500/15 text-red-400";
                                                        if (item.category === 'Gear') badgeClass = "bg-cyan-950/15 border-cyan-500/15 text-cyan-400";
                                                        if (item.category === 'Structures') badgeClass = "bg-emerald-950/15 border-emerald-500/15 text-emerald-400";

                                                        return (
                                                            <button
                                                                key={item.path}
                                                                type="button"
                                                                onClick={() => setGiveSelectedPresetItem(item.path)}
                                                                className={cn(
                                                                    "w-full text-left px-4 py-3 flex items-center justify-between transition-all duration-200 text-xs border-b border-slate-900/30 group relative overflow-hidden",
                                                                    giveSelectedPresetItem === item.path
                                                                        ? "bg-amber-500/10 border-l-4 border-l-amber-500 text-amber-300 shadow-[inset_0_1px_15px_rgba(245,158,11,0.05)]"
                                                                        : "text-slate-300 hover:bg-slate-900/40 hover:text-white"
                                                                )}
                                                            >
                                                                <div className="text-left min-w-0 pr-4">
                                                                    <p className={cn("font-semibold transition-colors group-hover:text-white", giveSelectedPresetItem === item.path ? "text-amber-400 font-bold" : "")}>{item.name}</p>
                                                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[240px] md:max-w-[320px] transition-colors group-hover:text-slate-400">
                                                                        {item.path}
                                                                    </p>
                                                                </div>
                                                                <span className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ml-2 transition-colors", badgeClass)}>
                                                                    {item.category}
                                                                </span>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                                {t('rcon.giveItem.pasteBpPath', 'Paste Item Blueprint Path')}
                                            </label>
                                            <textarea
                                                rows={5}
                                                value={giveCustomBlueprint}
                                                onChange={(e) => setGiveCustomBlueprint(e.target.value)}
                                                placeholder={`e.g. Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Wood.PrimalItemResource_Wood'`}
                                                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-3 text-xs text-white focus:outline-none focus:border-amber-500/50 font-mono transition-all resize-none leading-relaxed"
                                            />
                                            <p className="text-[10px] text-slate-500 leading-normal">
                                                {t('rcon.giveItem.bpTip', 'Ensure you include the full Blueprint path starting with "Blueprint\'" and ending with "\'".')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* SIDE PANEL: ONLINE PLAYER LISTING */}
                <div className="glass-panel rounded-2xl border border-slate-800 p-5 flex flex-col min-h-[600px] bg-slate-950/10 shadow-lg">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-cyan-400" />
                            <span>{t('rcon.playersOnline', { count: onlinePlayers.length, defaultValue: `Players Online (${onlinePlayers.length})` })}</span>
                        </h3>
                        <button
                            onClick={refreshPlayers}
                            disabled={!isConnected}
                            className="p-2 bg-slate-900 border border-slate-850 hover:bg-slate-850 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Refresh player list"
                        >
                            <RefreshCw className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>

                    <div className="space-y-2.5 overflow-y-auto flex-1 max-h-[500px] pr-1">
                        {!isConnected ? (
                            <p className="text-slate-500 text-xs text-center py-12">
                                {t('rcon.connectToView', 'Please connect to RCON to fetch current server player lists.')}
                            </p>
                        ) : onlinePlayers.length === 0 ? (
                            <p className="text-slate-500 text-xs text-center py-12">
                                {t('rcon.noPlayers', 'No survivors currently connected to this server.')}
                            </p>
                        ) : (
                            onlinePlayers.map((player) => (
                                <div
                                    key={player.steamId}
                                    className="bg-slate-950 border border-slate-850/80 hover:border-slate-800 rounded-xl p-3.5 transition-colors duration-250"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-white truncate">{player.name}</p>
                                            <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{player.steamId}</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => kickPlayer(player.steamId)}
                                                className="p-1.5 bg-amber-950/20 border border-amber-900/20 hover:bg-amber-900/20 text-amber-400 rounded-lg transition-colors"
                                                title={t('rcon.quickCommands.kickPlayer', 'Kick Survivor')}
                                            >
                                                <UserX className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => banPlayer(player.steamId)}
                                                className="p-1.5 bg-rose-950/20 border border-rose-900/20 hover:bg-rose-900/20 text-rose-400 rounded-lg transition-colors"
                                                title={t('rcon.quickCommands.banPlayer', 'Ban Survivor')}
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <RconHelpModal
                isOpen={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
            />
        </div>
    );
}
