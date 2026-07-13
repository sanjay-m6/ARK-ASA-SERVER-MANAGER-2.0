import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal as TerminalIcon,
  Send,
  Zap,
  Save,
  Skull,
  Megaphone,
  Trash2,
  MessageSquare,
  AlertCircle,
  AlertTriangle,
  Users,
  Ban,
  XCircle,
  Layers,
  Search,
  Play,
  Database,
  ShieldCheck,
  Eye,
  EyeOff,
  Check,
  Pause,
  History,
  RefreshCw,
  Gift,
  Package,
  Sliders,
  Download,
  Power
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { connectAseRcon, sendAseRcon } from '../utils/aseCommands';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAseRconStore, defaultAseServerState, LogEntry } from '../../stores/aseRconStore';

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
  { label: 'Save World', cmd: 'saveworld', icon: Save, color: 'text-emerald-400 border-emerald-500/25 bg-emerald-950/20' },
  { label: 'Dino Wipe', cmd: 'destroywilddinos', icon: Skull, color: 'text-rose-400 border-rose-500/25 bg-rose-950/20' },
  { label: 'Broadcast', cmd: 'broadcast ', icon: Megaphone, color: 'text-amber-400 border-amber-500/25 bg-amber-950/20' },
  { label: 'Server Chat', cmd: 'serverchat ', icon: MessageSquare, color: 'text-blue-400 border-blue-500/25 bg-blue-950/20' },
  { label: 'List Players', cmd: 'listplayers', icon: TerminalIcon, color: 'text-slate-400 border-slate-700/50 bg-slate-900/50' },
];

const AUTOCOMPLETE_COMMANDS = [
  { command: 'saveworld', desc: 'Saves the current world state.' },
  { command: 'listplayers', desc: 'Lists connected survivor accounts.' },
  { command: 'broadcast', desc: 'Sends an on-screen broadcast message.' },
  { command: 'destroywilddinos', desc: 'Kills all wild dinos immediately.' },
  { command: 'kickplayer', desc: 'Kicks survivor from server.' },
  { command: 'banplayer', desc: 'Bans survivor account.' },
  { command: 'unbanplayer', desc: 'Unbans survivor account.' },
  { command: 'getchat', desc: 'Gets recent in-game chat lines.' },
  { command: 'settimeofday', desc: 'Changes current game time.' },
  { command: 'doexit', desc: 'Closes the server instantly.' },
  { command: 'serverchat', desc: 'Sends global system chat text.' },
  { command: 'showmotd', desc: 'Displays MOTD manually.' }
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

export default function ASERconConsole() {
  const { t } = useTranslation();
  const { servers } = useAseServerStore();
  const { selectedServerId, setSelectedServerId, serverStates } = useAseRconStore();
  const rconStore = useAseRconStore();

  const serverRconState = selectedServerId ? serverStates[selectedServerId] || defaultAseServerState : defaultAseServerState;

  const isConnected = serverRconState.isConnected;
  const isConnecting = serverRconState.isConnecting;
  const log = serverRconState.log;
  const history = serverRconState.history;
  const onlinePlayers = serverRconState.onlinePlayers;
  const resolvedPlayerIds = serverRconState.resolvedPlayerIds;
  const isStreamingLogs = serverRconState.isStreamingLogs;
  const logStream = serverRconState.logStream;

  const [isBackupInProgress, setIsBackupInProgress] = useState(false);

  const handleCreateBackup = async () => {
    if (!selectedServerId) return;
    setIsBackupInProgress(true);
    const toastId = toast.loading(t('rcon.toasts.creatingBackup', 'Creating server backup...'));
    try {
      await invoke('create_ase_backup', { serverId: selectedServerId });
      toast.success(t('rcon.toasts.backupSuccess', 'Server backup created successfully!'), { id: toastId });
    } catch (error) {
      console.error('Failed to create backup:', error);
      toast.error(t('rcon.toasts.backupFailed', `Failed to create backup: ${error}`), { id: toastId });
    } finally {
      setIsBackupInProgress(false);
    }
  };

  // Maintenance Sequence states
  const [maintStop, setMaintStop] = useState(true);
  const [maintBackup, setMaintBackup] = useState(true);
  const [maintUpdate, setMaintUpdate] = useState(true);
  const [maintStart, setMaintStart] = useState(true);
  const [maintWipeDinos, setMaintWipeDinos] = useState(true);

  const [isMaintRunning, setIsMaintRunning] = useState(false);
  const [maintStep, setMaintStep] = useState(0); // 0 = idle, 1 = stop, 2 = backup, 3 = update, 4 = start, 5 = wipe, 6 = complete
  const [maintLogs, setMaintLogs] = useState<string[]>([]);
  const maintAbortRef = useRef(false);

  const checkAseServerStatus = (id: number): string | null => {
    const servers = useAseServerStore.getState().servers;
    const srv = servers.find(s => s.id === id);
    return srv ? srv.status : null;
  };

  const handleAbortSequence = () => {
    maintAbortRef.current = true;
    const timestamp = new Date().toLocaleTimeString();
    setMaintLogs(prev => [...prev, `[${timestamp}] ⚠️ Abort requested by user. Terminating visualization immediately.`]);
    setIsMaintRunning(false);
    setMaintStep(0);
    toast.success(t('rcon.maint.seqAborted', 'Maintenance sequence aborted.'));
  };

  const executeMaintenanceSequence = async () => {
    if (!selectedServerId) return;
    setIsMaintRunning(true);
    maintAbortRef.current = false;
    setMaintLogs([]);
    setMaintStep(0);

    const server = useAseServerStore.getState().servers.find(s => s.id === selectedServerId);
    const serverName = server ? server.name : `Server #${selectedServerId}`;

    const log = (msg: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setMaintLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    };

    log(`?? Starting automated maintenance sequence for "${serverName}"...`);

    try {
      // STEP 1: STOP SERVER
      if (maintStop) {
        if (maintAbortRef.current) return;
        setMaintStep(1);
        const statusBefore = checkAseServerStatus(selectedServerId);
        if (statusBefore !== 'stopped') {
          log("Step 1/5: Requesting graceful server shutdown...");
          await invoke('stop_ase_server', { serverId: selectedServerId });
          if (maintAbortRef.current) return;
          
          // Poll until status is stopped
          let isStopped = false;
          for (let i = 0; i < 150; i++) { // Max 5 mins (150 * 2s)
            if (maintAbortRef.current) return;
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (maintAbortRef.current) return;
            const currentStatus = checkAseServerStatus(selectedServerId);
            if (currentStatus === 'stopped') {
              isStopped = true;
              break;
            }
            log(`Waiting for shutdown (current status: ${currentStatus || 'unknown'})...`);
          }
          if (maintAbortRef.current) return;
          if (!isStopped) throw new Error("Timeout waiting for server to stop");
          log("Server stopped successfully.");
        } else {
          log("Step 1/5: Server is already stopped. Skipping stop step.");
        }
      }

      // STEP 2: CREATE BACKUP
      if (maintBackup) {
        if (maintAbortRef.current) return;
        setMaintStep(2);
        log("Step 2/5: Creating automated server backup...");
        await invoke('create_ase_backup', { serverId: selectedServerId });
        if (maintAbortRef.current) return;
        log("Server backup created successfully.");
      }

      // STEP 3: UPDATE SERVER
      if (maintUpdate) {
        if (maintAbortRef.current) return;
        setMaintStep(3);
        log("Step 3/5: Launching SteamCMD update...");
        await invoke('update_ase_server_install', { serverId: selectedServerId });
        if (maintAbortRef.current) return;
        
        // Poll until status returns to stopped/starting
        let isUpdated = false;
        log("Waiting for SteamCMD update to complete...");
        for (let i = 0; i < 300; i++) { // Max 10 mins (300 * 2s)
          if (maintAbortRef.current) return;
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (maintAbortRef.current) return;
          const currentStatus = checkAseServerStatus(selectedServerId);
          if (currentStatus !== 'updating') {
            isUpdated = true;
            break;
          }
        }
        if (maintAbortRef.current) return;
        if (!isUpdated) throw new Error("Timeout waiting for server update");
        log("Server update complete.");
      }

      // STEP 4: START SERVER
      if (maintStart) {
        if (maintAbortRef.current) return;
        setMaintStep(4);
        log("Step 4/5: Powering server process back up...");
        await invoke('start_ase_server', { serverId: selectedServerId });
        if (maintAbortRef.current) return;
        
        // Poll until status is online/running
        let isOnline = false;
        for (let i = 0; i < 300; i++) { // Max 10 mins (300 * 2s)
          if (maintAbortRef.current) return;
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (maintAbortRef.current) return;
          const currentStatus = checkAseServerStatus(selectedServerId);
          if (currentStatus === 'online' || currentStatus === 'running') {
            isOnline = true;
            break;
          }
          log(`Waiting for server to boot (current status: ${currentStatus || 'starting'})...`);
        }
        if (maintAbortRef.current) return;
        if (!isOnline) throw new Error("Timeout waiting for server to start");
        log("Server is online.");
      }

      // STEP 5: DESTROY WILD DINOS
      if (maintWipeDinos) {
        if (maintAbortRef.current) return;
        setMaintStep(5);
        log("Step 5/5: Preparing wild dino wipe...");
        log("Polling RCON subsystem until connection is established (max 90 seconds)...");
        
        let rconReady = false;
        for (let i = 0; i < 45; i++) { // 45 * 2s = 90s max
          if (maintAbortRef.current) return;
          try {
            await sendAseRcon(selectedServerId, 'listplayers');
            rconReady = true;
            break;
          } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        if (maintAbortRef.current) return;
        
        if (!rconReady) {
          log("⚠️ RCON subsystem did not respond in time. Proceeding with command transmission anyway...");
        } else {
          log("✅ RCON connection established successfully!");
        }

        log("Transmitting DestroyWildDinos command via RCON...");
        await sendAseRcon(selectedServerId, 'DestroyWildDinos');
        if (maintAbortRef.current) return;
        log("DestroyWildDinos command executed successfully!");
      }

      setMaintStep(6);
      log("?? Server maintenance sequence completed successfully!");
      toast.success(t('rcon.maint.seqSuccess', 'Maintenance sequence completed successfully!'));
    } catch (error: any) {
      if (maintAbortRef.current) return;
      log(`?? ERROR: ${error.message || error}`);
      toast.error(t('rcon.maint.seqFailed', `Maintenance sequence failed: ${error.message || error}`));
    } finally {
      setIsMaintRunning(false);
    }
  };

  // Sync default selected server
  useEffect(() => {
    if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId, setSelectedServerId]);

  // Tab control: terminal, log_stream, cluster, save_manager, maintenance, give_items
  const [activeTab, setActiveTab] = useState<'terminal' | 'log_stream' | 'cluster' | 'save_manager' | 'maintenance' | 'give_items'>('terminal');

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
  const [histIdx, setHistIdx] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);
  const logFeedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Player Management State
  const [showPlayers, setShowPlayers] = useState(true);
  const playersInterval = useRef<any>(null);

  // Local manual resolution states
  const [resolvedManualId, setResolvedManualId] = useState<string | null>(null);
  const [isResolvingManual, setIsResolvingManual] = useState(false);

  // Player ID resolution states
  const [isResolvingIds, setIsResolvingIds] = useState(false);

  // Live log streaming states
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

  useEffect(() => { 
    if (logRef.current && activeTab === 'terminal') {
      logRef.current.scrollTop = logRef.current.scrollHeight; 
    }
  }, [log, activeTab]);

  useEffect(() => {
    if (logFeedRef.current && autoScrollLogs && activeTab === 'log_stream') {
      logFeedRef.current.scrollTop = logFeedRef.current.scrollHeight;
    }
  }, [logStream, autoScrollLogs, activeTab]);

  // Sync cluster target selection defaults
  useEffect(() => {
    if (servers.length > 0 && clusterSelectedServers.length === 0) {
      setClusterSelectedServers(servers.map(s => s.id));
    }
  }, [servers, clusterSelectedServers.length]);

  const mappedServers = useMemo(() => servers.map(s => ({
    id: s.id,
    name: s.name,
    mapName: s.mapName,
    status: s.status
  })), [servers]);

  const selectedServerObj = useMemo(() => servers.find(s => s.id === selectedServerId), [servers, selectedServerId]);

  useEffect(() => {
    if (isConnected && showPlayers && selectedServerId) {
      refreshPlayers();
      playersInterval.current = setInterval(refreshPlayers, 15000);
    } else if (playersInterval.current) {
      clearInterval(playersInterval.current);
    }
    return () => { if (playersInterval.current) clearInterval(playersInterval.current); };
  }, [isConnected, showPlayers, selectedServerId]);

  // Resolve Player IDs automatically for ASE by passing negative selectedServerId
  useEffect(() => {
    if (!selectedServerId || onlinePlayers.length === 0) {
      if (selectedServerId) rconStore.setResolvedPlayerIds(selectedServerId, {});
      return;
    }

    const platformIds = onlinePlayers.map(p => p.steamId);
    setIsResolvingIds(true);
    invoke<Record<string, number>>('rcon_resolve_player_ids', {
      serverId: -selectedServerId,
      platformIds
    })
    .then(resolvedMap => {
      const stringifiedMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(resolvedMap)) {
        stringifiedMap[k] = String(v);
      }
      rconStore.setResolvedPlayerIds(selectedServerId, stringifiedMap);
    })
    .catch(err => {
      console.error('Failed to resolve player IDs:', err);
    })
    .finally(() => {
      setIsResolvingIds(false);
    });
  }, [selectedServerId, onlinePlayers]);

  // Real-time manual ID resolution
  useEffect(() => {
    if (!selectedServerId || !/^\d{17}$/.test(giveManualPlayerId)) {
      setResolvedManualId(null);
      setIsResolvingManual(false);
      return;
    }

    let active = true;
    setIsResolvingManual(true);
    setResolvedManualId(null);

    const timer = setTimeout(() => {
      invoke<Record<string, number>>('rcon_resolve_player_ids', {
        serverId: -selectedServerId,
        platformIds: [giveManualPlayerId]
      })
      .then(resolvedMap => {
        if (!active) return;
        if (resolvedMap[giveManualPlayerId]) {
          setResolvedManualId(String(resolvedMap[giveManualPlayerId]));
        } else {
          setResolvedManualId('');
        }
      })
      .catch(err => {
        console.error('Manual resolve error:', err);
        if (active) setResolvedManualId('');
      })
      .finally(() => {
        if (active) setIsResolvingManual(false);
      });
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedServerId, giveManualPlayerId]);

  // Default selected player when player list refreshes
  useEffect(() => {
    if (onlinePlayers.length > 0 && !giveSelectedPlayerId) {
      setGiveSelectedPlayerId(onlinePlayers[0].steamId);
    }
  }, [onlinePlayers, giveSelectedPlayerId]);

  // Start/Stop log streaming for ASE server via Tauri when streaming active
  useEffect(() => {
    if (isStreamingLogs && selectedServerId) {
      invoke('start_log_stream', { serverId: selectedServerId })
        .then(() => console.log(`[ASE RCON] Log stream started for server #${selectedServerId}`))
        .catch(err => console.error('Error starting backend log stream:', err));
        
      return () => {
        invoke('stop_log_stream', { serverId: selectedServerId })
          .then(() => console.log(`[ASE RCON] Log stream stopped for server #${selectedServerId}`))
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
            rconStore.addLogStreamLine(selectedServerId, line);
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

  const parsePlayers = (response: string) => {
    if (response.toLowerCase().includes('no players')) {
      if (selectedServerId) rconStore.setOnlinePlayers(selectedServerId, []);
      return;
    }
    const lines = response.split('\n');
    const parsed = [];
    for (const line of lines) {
      const match = line.match(/\d+\.\s+(.+),\s+([a-zA-Z0-9_-]+)/);
      if (match) {
        parsed.push({ name: match[1].trim(), steamId: match[2].trim() });
      }
    }
    if (parsed.length > 0 || lines.length > 1) {
      if (selectedServerId) rconStore.setOnlinePlayers(selectedServerId, parsed);
    }
  };

  const refreshPlayers = async () => {
    if (!selectedServerId) return;
    try {
      const resp = await sendAseRcon(selectedServerId, 'listplayers');
      if (resp) parsePlayers(resp);
    } catch (e) {
      // Silently fail auto-refresh
    }
  };

  const addLog = (entry: LogEntry) => {
    if (selectedServerId) {
      rconStore.addLog(selectedServerId, entry);
    }
  };
  const now = () => new Date().toLocaleTimeString();

  const handleConnect = async () => {
    if (!selectedServerId) return;
    rconStore.setConnecting(selectedServerId, true);
    try { 
      await connectAseRcon(selectedServerId); 
      rconStore.setConnected(selectedServerId, true); 
      addLog({ type: 'response', text: 'Connected to RCON. Authenticated successfully.', time: now() }); 
      toast.success('RCON connected'); 
      refreshPlayers();
    } catch (e) { 
      addLog({ type: 'error', text: `Connection failed: ${e}`, time: now() }); 
      toast.error(`${e}`); 
      rconStore.setConnected(selectedServerId, false);
    } finally {
      rconStore.setConnecting(selectedServerId, false);
    }
  };

  const handleDisconnect = () => {
    if (selectedServerId) {
      rconStore.setConnected(selectedServerId, false);
      rconStore.setStreamingLogs(selectedServerId, false);
      rconStore.clearLogStream(selectedServerId);
      addLog({ type: 'error', text: 'Disconnected from RCON.', time: now() });
    }
  };

  const handleSend = async (cmdString?: string) => {
    const cmd = cmdString || command.trim();
    if (!selectedServerId || !cmd) return;
    
    if (!cmdString) {
      setCommand(''); 
      rconStore.setHistory(selectedServerId, prev => [cmd, ...prev]); 
      setHistIdx(-1);
    }

    const normalized = cmd.trim().toLowerCase();
    const isDinoWipe = normalized.endsWith('destroywilddinos');
    const isSaveWorld = normalized.endsWith('saveworld');

    if (isDinoWipe && dinoWipeBroadcastEnabled) {
      const msg = dinoWipeBroadcastMsg.trim();
      if (msg) {
        try {
          addLog({ type: 'cmd', text: `Broadcast "${msg}"`, time: now() });
          const resp = await sendAseRcon(selectedServerId, `Broadcast "${msg}"`);
          addLog({ type: 'response', text: resp || 'Broadcast sent successfully', time: now() });
        } catch (e) {
          console.error('Failed to broadcast before dino wipe:', e);
          addLog({ type: 'error', text: `Broadcast failed: ${e}`, time: now() });
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
          addLog({ type: 'cmd', text: `Broadcast "${msg}"`, time: now() });
          const resp = await sendAseRcon(selectedServerId, `Broadcast "${msg}"`);
          addLog({ type: 'response', text: resp || 'Broadcast sent successfully', time: now() });
        } catch (e) {
          console.error('Failed to broadcast before save:', e);
          addLog({ type: 'error', text: `Broadcast failed: ${e}`, time: now() });
        }
      }
      if (saveWorldBroadcastDelay > 0) {
        toast.loading(`Waiting ${saveWorldBroadcastDelay}s before World Save...`, { id: 'save_world_toast' });
        await new Promise(resolve => setTimeout(resolve, saveWorldBroadcastDelay * 1000));
        toast.dismiss('save_world_toast');
      }
    }

    addLog({ type: 'cmd', text: cmd, time: now() });
    
    try { 
      const resp = await sendAseRcon(selectedServerId, cmd); 
      addLog({ type: 'response', text: resp || '(no response)', time: now() });
      if (cmd.toLowerCase() === 'listplayers' && resp) {
        parsePlayers(resp);
      }
    } catch (e) { 
      addLog({ type: 'error', text: `${e}`, time: now() }); 
      rconStore.setConnected(selectedServerId, false);
    }
  };

  // Filter autocomplete suggestions based on user typing
  const suggestions = useMemo(() => {
    if (!command.trim() || command.includes(' ')) return [];
    return AUTOCOMPLETE_COMMANDS.filter(c =>
        c.command.toLowerCase().startsWith(command.toLowerCase())
    );
  }, [command]);

  useEffect(() => {
    if (suggestions.length > 0) {
      setAutocompleteVisible(true);
    } else {
      setAutocompleteVisible(false);
    }
    setAutocompleteIndex(0);
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
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const idx = Math.min(histIdx + 1, history.length - 1); 
        setHistIdx(idx); 
        setCommand(history[idx]); 
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx > 0) {
        const idx = histIdx - 1;
        setHistIdx(idx);
        setCommand(history[idx]);
      } else if (histIdx === 0) {
        setHistIdx(-1);
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
      toast.success('Cluster commands execution complete');
    } catch (error) {
      console.error('Cluster execution failed:', error);
      toast.error(`Cluster execution failed: ${error}`);
    } finally {
      setClusterIsExecuting(false);
    }
  };

  // Trigger manual save with verification
  const triggerManualSave = async () => {
    if (!selectedServerId || !isConnected) {
      toast.error('Must be connected to run saves.');
      return;
    }

    setSaveProgressState('sending');
    setSaveValidationResult(null);

    try {
      if (saveWorldBroadcastEnabled && saveWorldBroadcastMsg.trim()) {
        const msg = saveWorldBroadcastMsg.trim();
        try {
          addLog({ type: 'cmd', text: `Broadcast "${msg}"`, time: now() });
          const resp = await sendAseRcon(selectedServerId, `Broadcast "${msg}"`);
          addLog({ type: 'response', text: resp || 'Broadcast sent successfully', time: now() });
        } catch (e) {
          console.error('Failed to send auto-broadcast before manual save:', e);
          addLog({ type: 'error', text: `Broadcast failed: ${e}`, time: now() });
        }
        if (saveWorldBroadcastDelay > 0) {
          toast.loading(`Waiting ${saveWorldBroadcastDelay}s before World Save...`, { id: 'save_world_toast' });
          await new Promise(resolve => setTimeout(resolve, saveWorldBroadcastDelay * 1000));
          toast.dismiss('save_world_toast');
        }
      }

      // Step 1: Send saveworld command
      await sendAseRcon(selectedServerId, 'saveworld');
      
      // Step 2: Waiting for server disk sync (3 seconds delay to let engine flush stream)
      setSaveProgressState('syncing');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 3: Verifying filesystem integrity
      setSaveProgressState('verifying');
      const validationInfo = await invoke<SaveValidationInfo>('rcon_validate_save', { serverId: selectedServerId });
      
      setSaveValidationResult(validationInfo);
      
      if (validationInfo.exists && validationInfo.integrity_ok) {
        setSaveProgressState('success');
        toast.success('World save successfully verified!');
        
        setSaveValidationHistory(prev => [
          {
            serverId: selectedServerId,
            serverName: selectedServerObj?.name || `Server #${selectedServerId}`,
            timestamp: new Date(),
            info: validationInfo
          },
          ...prev
        ]);
      } else {
        setSaveProgressState('error');
        toast.error(validationInfo.error_message || 'Save file verification failed.');
      }
    } catch (error) {
      console.error('Manual save failed:', error);
      setSaveProgressState('error');
      toast.error(`Manual save failed: ${error}`);
    }
  };

  // RCON command to give item to a player
  const executeGiveItem = async () => {
    if (!selectedServerId || !isConnected) {
        toast.error(t('rcon.notConnected', 'Must be connected to send commands'));
        return;
    }

    let targetId = giveTargetType === 'online' ? giveSelectedPlayerId : giveManualPlayerId;
    if (giveTargetType === 'online') {
      if (resolvedPlayerIds[giveSelectedPlayerId]) {
        targetId = resolvedPlayerIds[giveSelectedPlayerId];
      } else {
        toast.error(t('rcon.giveItem.onlineResolutionFailed', 'Could not resolve selected player to their ARK Player ID. Make sure they are fully logged in.'));
        return;
      }
    } else if (giveTargetType === 'manual' && /^\d{17}$/.test(giveManualPlayerId)) {
      if (resolvedManualId) {
        targetId = resolvedManualId;
      } else {
        toast.error(t('rcon.giveItem.manualResolutionFailed', 'Could not resolve manual Steam ID to their ARK Player ID. Make sure the player has joined the server, or enter the 9-digit Player ID directly.'));
        return;
      }
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

    const timeStr = new Date().toLocaleTimeString();
    addLog({ type: 'cmd', text: formattedCmd, time: timeStr });

    try {
        const resp = await sendAseRcon(selectedServerId, formattedCmd);
        addLog({ type: 'response', text: resp || '(no response)', time: new Date().toLocaleTimeString() });
        toast.success(t('rcon.giveItem.success', 'Item command sent successfully!'));
    } catch (error) {
        const errMsg = String(error);
        addLog({ type: 'error', text: errMsg, time: new Date().toLocaleTimeString() });
        toast.error(t('rcon.giveItem.failed', { error: errMsg, defaultValue: `Failed: ${errMsg}` }));
    } finally {
        setIsGivingItem(false);
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

  return (
    <motion.div className="space-y-6 select-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      
      {/* Header section with layout adjustments */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/30 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl">
              <TerminalIcon className="w-6 h-6 text-amber-400" />
            </div>
            ASE RCON Console
          </h1>
          <p className="text-sm text-slate-400 mt-1">Live remote administration and server telemetry</p>
        </div>
        
        <div className="flex items-center gap-3">
          {servers.length > 0 && (
            <ServerSelect
              value={selectedServerId}
              onChange={val => {
                setSelectedServerId(val);
              }}
              servers={mappedServers}
              accentColor="amber"
            />
          )}
          
          <button 
            onClick={isConnected ? handleDisconnect : handleConnect} 
            disabled={(isConnecting && !isConnected) || !selectedServerId} 
            className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 focus:outline-none flex items-center gap-2 h-[42px] cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
              isConnected 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 shadow-lg shadow-emerald-500/5' 
                : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-slate-950 shadow-lg shadow-amber-500/20'
            }`}
          >
            {isConnecting ? (
              <><Zap className="w-4 h-4 animate-pulse" /> Connecting...</>
            ) : isConnected ? (
              <><Zap className="w-4 h-4" /> Connected</>
            ) : (
              <><TerminalIcon className="w-4 h-4" /> Connect</>
            )}
          </button>
        </div>
      </div>

      {/* Navigation tabs matching existing theme */}
      <div className="flex p-1.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-md w-max shadow-inner gap-1 mb-2">
        <button
          onClick={() => setActiveTab('terminal')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'terminal' 
              ? "text-amber-400 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <TerminalIcon className="w-4 h-4" />
          <span className="relative z-10">Interactive Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('log_stream')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'log_stream' 
              ? "text-amber-400 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <Eye className="w-4 h-4" />
          <span className="relative z-10">Live Log Feed</span>
          {isStreamingLogs && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('cluster')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'cluster' 
              ? "text-amber-400 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <Layers className="w-4 h-4" />
          <span className="relative z-10">Cluster Deck</span>
        </button>

        <button
          onClick={() => setActiveTab('save_manager')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'save_manager' 
              ? "text-amber-400 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <Save className="w-4 h-4" />
          <span className="relative z-10">Verified Saves</span>
        </button>

        <button
          onClick={() => setActiveTab('maintenance')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'maintenance' 
              ? "text-amber-400 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", isMaintRunning && "animate-spin text-amber-400")} />
          <span className="relative z-10">Maintenance</span>
        </button>

        <button
          onClick={() => setActiveTab('give_items')}
          className={cn(
            "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
            activeTab === 'give_items' 
              ? "text-amber-400 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50" 
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
          )}
        >
          <Gift className="w-4 h-4" />
          <span className="relative z-10">Give Items</span>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Main Content Pane */}
        <div className="flex-1 glass-panel rounded-2xl p-5 border border-white/5 shadow-xl relative overflow-visible flex flex-col min-h-[500px]">
          
          {/* Glow effect at top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>

          {/* TAB 1: TERMINAL */}
          {activeTab === 'terminal' && (
            <div className="flex-1 flex flex-col h-full">
              {/* Quick Actions Bar */}
              <div className="flex gap-2 flex-wrap mb-4 pb-4 border-b border-white/5">
                {QUICK_COMMANDS.map(q => { 
                  const Icon = q.icon; 
                  return (
                    <button 
                      key={q.label} 
                      onClick={() => {
                        if (q.cmd.endsWith(' ')) {
                          setCommand(q.cmd);
                          inputRef.current?.focus();
                        } else {
                          handleSend(q.cmd);
                        }
                      }}
                      disabled={!isConnected}
                      className={cn(
                        "px-4 py-2 border rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                        q.color
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {q.label}
                    </button>
                  ); 
                })}
                <button
                  onClick={handleCreateBackup}
                  disabled={isBackupInProgress || !selectedServerId}
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-400 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isBackupInProgress ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  {isBackupInProgress ? 'Backing Up...' : 'Create Backup'}
                </button>
                <button 
                  onClick={() => setShowAutoBroadcastSettings(!showAutoBroadcastSettings)} 
                  className={cn(
                    "px-4 py-2 border rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 focus:outline-none",
                    showAutoBroadcastSettings ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-slate-900 border-white/5 text-slate-300 hover:text-white"
                  )}
                >
                  <Sliders className="w-4 h-4" />
                  Auto Broadcast Settings
                </button>
                <button 
                  onClick={() => setShowPlayers(!showPlayers)} 
                  disabled={!isConnected}
                  className={cn(
                    "px-4 py-2 ml-auto border rounded-xl text-xs font-semibold flex items-center gap-2 transition-all focus:outline-none",
                    showPlayers ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-slate-900 border-white/5 text-slate-300 hover:text-white"
                  )}
                >
                  <Users className="w-4 h-4" />
                  Players ({onlinePlayers.length})
                </button>
                <button 
                  onClick={() => { if (selectedServerId) rconStore.setLog(selectedServerId, []); }} 
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/10 rounded-xl text-xs font-semibold text-rose-400 flex items-center gap-2 transition-all focus:outline-none active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
              </div>

              {/* Auto Broadcast Collapsible Settings Panel */}
              <AnimatePresence>
                {showAutoBroadcastSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mb-4 bg-slate-950/60 border border-white/5 rounded-xl p-4 space-y-4 text-xs text-slate-300 font-sans shadow-inner"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/5">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-amber-400" />
                        Auto-Broadcast Action Alerts
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Configure alerts sent to players before actions
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Dino Wipe Block */}
                      <div className="space-y-3 bg-slate-900/40 p-3 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-slate-200 flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dinoWipeBroadcastEnabled}
                              onChange={(e) => setDinoWipeBroadcastEnabled(e.target.checked)}
                              className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                            />
                            Auto Broadcast on Dino Wipe
                          </label>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-slate-500 font-sans">Alert Message</span>
                          <input
                            type="text"
                            value={dinoWipeBroadcastMsg}
                            onChange={(e) => setDinoWipeBroadcastMsg(e.target.value)}
                            disabled={!dinoWipeBroadcastEnabled}
                            placeholder="Message to display..."
                            className="w-full bg-slate-950 border border-white/5 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-700 focus:outline-none disabled:opacity-50"
                          />
                        </div>
                        <div className="flex items-center gap-2 font-sans">
                          <span className="text-[10px] text-slate-500">Execution Delay (Seconds):</span>
                          <input
                            type="number"
                            min="0"
                            max="60"
                            value={dinoWipeBroadcastDelay}
                            onChange={(e) => setDinoWipeBroadcastDelay(parseInt(e.target.value, 10) || 0)}
                            disabled={!dinoWipeBroadcastEnabled}
                            className="w-16 bg-slate-950 border border-white/5 rounded-lg px-2 py-1 text-center text-white focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>

                      {/* Save World Block */}
                      <div className="space-y-3 bg-slate-900/40 p-3 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-slate-200 flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={saveWorldBroadcastEnabled}
                              onChange={(e) => setSaveWorldBroadcastEnabled(e.target.checked)}
                              className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                            />
                            Auto Broadcast on Save World
                          </label>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-slate-500 font-sans">Alert Message</span>
                          <input
                            type="text"
                            value={saveWorldBroadcastMsg}
                            onChange={(e) => setSaveWorldBroadcastMsg(e.target.value)}
                            disabled={!saveWorldBroadcastEnabled}
                            placeholder="Message to display..."
                            className="w-full bg-slate-950 border border-white/5 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-700 focus:outline-none disabled:opacity-50"
                          />
                        </div>
                        <div className="flex items-center gap-2 font-sans">
                          <span className="text-[10px] text-slate-500">Execution Delay (Seconds):</span>
                          <input
                            type="number"
                            min="0"
                            max="60"
                            value={saveWorldBroadcastDelay}
                            onChange={(e) => setSaveWorldBroadcastDelay(parseInt(e.target.value, 10) || 0)}
                            disabled={!saveWorldBroadcastEnabled}
                            className="w-16 bg-slate-950 border border-white/5 rounded-lg px-2 py-1 text-center text-white focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Console output shell scroll block */}
              <div ref={logRef} className="flex-1 overflow-y-auto font-mono text-[13px] space-y-2 mb-4 min-h-[420px] max-h-[60vh] bg-slate-950 p-4 rounded-xl border border-white/5 shadow-inner">
                <AnimatePresence initial={false}>
                  {log.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center h-full text-slate-500 py-12"
                    >
                      <TerminalIcon className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-xs">Connect to RCON and begin transmitting commands.</p>
                      {!isConnected && <p className="text-[10px] mt-2 opacity-60">Status: Disconnected</p>}
                    </motion.div>
                  ) : (
                    log.map((entry, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                        className={`py-2 px-3 rounded-lg flex items-start gap-3 border text-xs font-sans ${
                          entry.type === 'cmd' 
                            ? 'text-amber-300 bg-amber-500/5 border-amber-500/10' 
                            : entry.type === 'error' 
                              ? 'text-rose-400 bg-rose-500/10 border-rose-500/10' 
                              : 'text-slate-300 hover:bg-white/[0.02] bg-slate-900/10 border-white/5'
                        }`}
                      >
                        <span className="text-slate-600 shrink-0 select-none text-[10px] font-mono">[{entry.time}]</span>
                        <div className="flex-1 break-words whitespace-pre-wrap font-sans leading-relaxed">
                          {entry.type === 'cmd' && <span className="text-amber-500/50 mr-2 select-none font-mono">❯</span>}
                          {entry.type === 'error' && <AlertCircle className="w-4 h-4 inline mr-2 align-text-bottom text-rose-500" />}
                          {entry.text}
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Autocomplete Input Prompt */}
              <div className="relative">
                <div className="flex gap-3 items-center bg-slate-950 rounded-xl px-4 py-3 border border-white/5 focus-within:border-amber-500/50 transition-all duration-300 shadow-md">
                  <span className="text-amber-500 font-mono font-bold select-none text-sm shrink-0">❯</span>
                  <input 
                    ref={inputRef}
                    type="text" 
                    value={command} 
                    onChange={e => setCommand(e.target.value)} 
                    onKeyDown={handleKeyDown} 
                    placeholder={isConnected ? "Enter RCON command..." : "Connect to server first..."}
                    disabled={!isConnected}
                    className="w-full bg-transparent text-sm text-white placeholder-slate-600 font-mono focus:outline-none disabled:cursor-not-allowed" 
                  />
                  <button 
                    onClick={() => handleSend()} 
                    disabled={!isConnected || !command.trim()} 
                    className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500 hover:text-slate-900 transition-all active:scale-95 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>

                {/* Autocomplete Suggestion Dropdown */}
                {autocompleteVisible && suggestions.length > 0 && (
                    <div className="absolute left-0 bottom-full mb-2 w-full bg-slate-950/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                        <div className="bg-slate-900/50 px-4 py-2 border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                            RCON Command Autocomplete (Use ↑ ↓ Tab / Enter)
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
                                        "w-full text-left px-4 py-3 flex items-center justify-between text-xs border-b border-white/[0.02] transition-colors",
                                        idx === autocompleteIndex 
                                            ? "bg-amber-500/10 text-amber-400 border-l-2 border-l-amber-400" 
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

          {/* TAB 2: LIVE LOG FEED */}
          {activeTab === 'log_stream' && (
            <div className="flex-1 flex flex-col h-full">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/45 border border-white/5 p-4 rounded-xl mb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { if (selectedServerId) rconStore.setStreamingLogs(selectedServerId, !isStreamingLogs); }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95",
                      isStreamingLogs
                        ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/20 hover:bg-emerald-900/20"
                        : "bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-850 hover:text-slate-300"
                    )}
                  >
                    {isStreamingLogs ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Streaming Live Logs</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>Enable Streaming</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                    className={cn(
                      "p-2 rounded-xl border text-xs transition-colors",
                      autoScrollLogs
                        ? "bg-amber-950/20 text-amber-400 border-amber-500/20 hover:bg-amber-900/20"
                        : "bg-slate-950 text-slate-500 border-white/5 hover:text-slate-400"
                    )}
                    title={autoScrollLogs ? "Auto-scroll enabled" : "Auto-scroll paused"}
                  >
                    {autoScrollLogs ? <Check className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => { if (selectedServerId) rconStore.clearLogStream(selectedServerId); }}
                    className="p-2 bg-slate-950 border border-white/5 hover:border-white/10 rounded-xl text-slate-500 hover:text-red-400 transition-colors"
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
                    placeholder="Search logs content..."
                    className="w-full bg-slate-950 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/30 text-white"
                  />
                </div>
              </div>

              <div
                ref={logFeedRef}
                className="flex-1 bg-slate-950 rounded-xl p-4 font-mono text-xs overflow-y-auto border border-white/5 min-h-[420px] max-h-[60vh] shadow-inner text-slate-400 leading-relaxed"
              >
                {filteredLogs.length === 0 ? (
                  <div className="text-slate-600 italic text-center py-12">
                    {isStreamingLogs 
                      ? "Waiting for logs flow... (or search returned zero results)" 
                      : "Streaming is disabled. Enable to monitor logs directly from the backend stream."}
                  </div>
                ) : (
                  filteredLogs.map((entry, idx) => (
                    <div key={idx} className="mb-2 hover:bg-white/[0.01] p-1 rounded transition-colors flex items-start gap-3">
                      <span className="text-slate-650 text-[10px] shrink-0 mt-0.5 select-none">[{entry.timestamp.toLocaleTimeString()}]</span>
                      <span className="whitespace-pre-wrap break-all">{entry.line}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CLUSTER DECK */}
          {activeTab === 'cluster' && (
            <div className="flex-1 flex flex-col h-full space-y-5">
              <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl">
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Target Cluster Servers</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4 font-sans">Select which active servers this command will execute on simultaneously:</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {servers.map(server => (
                    <label
                      key={server.id}
                      className={cn(
                        "p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all hover:bg-slate-800/40",
                        clusterSelectedServers.includes(server.id)
                          ? "bg-amber-950/15 border-amber-500/20 text-amber-300"
                          : "bg-slate-900/50 border-white/5 text-slate-400"
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
                        className="w-4 h-4 rounded border-slate-800 accent-amber-500 bg-slate-950 focus:ring-0 cursor-pointer"
                      />
                      <div className="truncate font-sans">
                        <p className="text-xs font-semibold text-white truncate">{server.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">Port: {server.rconPort}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Command Prompt */}
              <div className="flex items-center gap-3 bg-slate-950 rounded-xl px-4 py-3.5 border border-white/5 focus-within:border-amber-500/50 transition-all duration-300 shadow-md">
                <TerminalIcon className="w-5 h-5 text-amber-400" />
                <input
                  type="text"
                  value={clusterCommand}
                  onChange={(e) => setClusterCommand(e.target.value)}
                  placeholder="Enter command to broadcast or execute on all selected cluster servers..."
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none font-mono placeholder:text-slate-650"
                  disabled={clusterIsExecuting}
                />
                <button
                  onClick={executeClusterCommand}
                  disabled={clusterIsExecuting || !clusterCommand.trim() || clusterSelectedServers.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400 active:scale-95"
                >
                  {clusterIsExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>Execute</span>
                </button>
              </div>

              {/* Outputs deck */}
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {Object.keys(clusterProgress).length === 0 ? (
                  <div className="text-slate-600 italic text-xs py-8 text-center bg-slate-950/20 rounded-xl border border-white/5">
                    No cluster executions triggered yet.
                  </div>
                ) : (
                  Object.entries(clusterProgress).map(([idStr, val]) => {
                    const sId = Number(idStr);
                    const server = servers.find(s => s.id === sId);
                    return (
                      <div
                        key={sId}
                        className="bg-slate-950 rounded-xl p-4 border border-white/5 flex items-start gap-4 hover:border-white/10 transition-colors"
                      >
                        <div className="w-40 truncate font-sans">
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
                          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider font-sans">Response</p>
                          <div className="mt-1 font-mono text-[11px] text-slate-300 whitespace-pre-wrap bg-slate-900/30 p-2.5 rounded-lg border border-white/5 truncate max-h-[80px] overflow-y-auto">
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
              <div className="bg-slate-950/40 border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-md relative overflow-hidden">
                <div className="space-y-2 max-w-lg font-sans">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-amber-400" />
                    <span>Verified Save World Engine</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Triggers the <code className="text-amber-400 font-semibold font-mono bg-amber-950/20 px-1 py-0.5 rounded">saveworld</code> command via RCON and verifies that the output save file is successfully written to disk, checking size and timestamp metrics in real time.
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-center gap-2 font-sans">
                  <button
                    onClick={triggerManualSave}
                    disabled={saveProgressState !== 'idle' && saveProgressState !== 'success' && saveProgressState !== 'error'}
                    className={cn(
                      "flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm shadow-xl transition-all duration-300 transform active:scale-95",
                      saveProgressState === 'idle' || saveProgressState === 'success' || saveProgressState === 'error'
                        ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/10"
                        : "bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed"
                    )}
                  >
                    {['sending', 'syncing', 'verifying'].includes(saveProgressState) ? (
                      <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    <span>Trigger Verified Save</span>
                  </button>

                  {/* Progressive indicator labels */}
                  {saveProgressState === 'sending' && (
                    <span className="text-[10px] text-amber-450 font-semibold animate-pulse">1. Sending saveworld command...</span>
                  )}
                  {saveProgressState === 'syncing' && (
                    <span className="text-[10px] text-amber-500 font-semibold animate-pulse">2. Waiting for server disk sync (3s)...</span>
                  )}
                  {saveProgressState === 'verifying' && (
                    <span className="text-[10px] text-amber-400 font-semibold animate-pulse">3. Verifying save integrity...</span>
                  )}
                  {saveProgressState === 'success' && (
                    <span className="text-[10px] text-emerald-450 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Save verified successfully!</span>
                    </span>
                  )}
                  {saveProgressState === 'error' && (
                    <span className="text-[10px] text-rose-450 font-bold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Verification failed</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Save result details */}
              {saveValidationResult && (
                <div className="bg-slate-950 rounded-2xl p-5 border border-white/5 shadow-inner grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Save File Name</p>
                    <p className="text-xs font-semibold text-white truncate font-mono mt-1" title={saveValidationResult.file_name}>
                      {saveValidationResult.file_name}
                    </p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">File Size</p>
                    <p className="text-xs font-semibold text-amber-400 font-mono mt-1">
                      {formatBytes(saveValidationResult.file_size_bytes)}
                    </p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Last Modified</p>
                    <p className="text-xs font-semibold text-white truncate font-mono mt-1">
                      {saveValidationResult.last_modified}
                    </p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/[0.02]">
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Integrity Stamp</p>
                    <div className="mt-1">
                      {saveValidationResult.integrity_ok ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>PASSED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>FAILED</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Save History */}
              <div className="space-y-3 font-sans">
                <h4 className="text-xs font-bold text-slate-400 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  <span>Verified Save History Logs</span>
                </h4>

                <div className="space-y-2 max-h-[140px] overflow-y-auto">
                  {saveValidationHistory.length === 0 ? (
                    <p className="text-[11px] text-slate-600 italic py-2">No save validation logs recorded in this session.</p>
                  ) : (
                    saveValidationHistory.map((h, i) => (
                      <div
                        key={i}
                        className="bg-slate-950/40 border border-white/[0.02] rounded-xl p-3 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-bold text-white">{h.serverName}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]" title={h.info.file_name}>{h.info.file_name}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-amber-400 font-mono">{formatBytes(h.info.file_size_bytes)}</span>
                          <p className="text-[9px] text-slate-500 mt-0.5">{h.timestamp.toLocaleTimeString()} | {h.info.last_modified}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: MAINTENANCE SEQUENCE */}
          {activeTab === 'maintenance' && (
            <div className="flex-1 flex flex-col h-full space-y-6 animate-in fade-in duration-300">
              
              {/* Maintenance Header */}
              <div className="bg-slate-950/40 border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-md relative overflow-hidden">
                <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none select-none text-[150px] text-amber-500">
                  <RefreshCw className="w-40 h-40" />
                </div>

                <div className="space-y-2 max-w-lg">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <RefreshCw className={cn("w-5 h-5 text-amber-400", isMaintRunning && "animate-spin")} />
                    <span>Server Maintenance Sequence</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Coordinate and execute a safe, step-by-step update and restart sequence on the server. Select the operations to perform below and monitor progress in real-time.
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2.5">
                  {isMaintRunning ? (
                    <button
                      onClick={handleAbortSequence}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-500 text-white shadow-xl transition-all duration-300 transform active:scale-95 shadow-rose-950/20"
                    >
                      <XCircle className="w-5 h-5 animate-pulse" />
                      <span>Abort Sequence</span>
                    </button>
                  ) : (
                    <button
                      onClick={executeMaintenanceSequence}
                      disabled={!selectedServerId}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-xl transition-all duration-300 transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Play className="w-5 h-5" />
                      <span>Run Sequence</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Main Body Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* Step Selection Config (Left 2 Columns) */}
                <div className="lg:col-span-2 space-y-3.5">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Configuration Steps</h4>
                  
                  {/* Step 1 Toggle */}
                  <div 
                    onClick={() => !isMaintRunning && setMaintStop(!maintStop)}
                    className={cn(
                      "flex items-center justify-between p-3.5 rounded-xl border transition-all select-none",
                      isMaintRunning ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                      maintStop ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40" : "bg-slate-950/20 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold", maintStop ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-slate-900 text-slate-500 border border-white/5")}>1</div>
                      <div>
                        <p className="text-xs font-bold text-white font-sans">Graceful Shutdown</p>
                        <p className="text-[10px] text-slate-400 font-sans">Stop server before maintenance</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={maintStop} disabled={isMaintRunning} onChange={() => {}} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/50 cursor-pointer pointer-events-none" />
                  </div>

                  {/* Step 2 Toggle */}
                  <div 
                    onClick={() => !isMaintRunning && setMaintBackup(!maintBackup)}
                    className={cn(
                      "flex items-center justify-between p-3.5 rounded-xl border transition-all select-none",
                      isMaintRunning ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                      maintBackup ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40" : "bg-slate-950/20 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold", maintBackup ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-slate-900 text-slate-500 border border-white/5")}>2</div>
                      <div>
                        <p className="text-xs font-bold text-white font-sans">Create Backup</p>
                        <p className="text-[10px] text-slate-400 font-sans">Zip world save & configs</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={maintBackup} disabled={isMaintRunning} onChange={() => {}} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/50 cursor-pointer pointer-events-none" />
                  </div>

                  {/* Step 3 Toggle */}
                  <div 
                    onClick={() => !isMaintRunning && setMaintUpdate(!maintUpdate)}
                    className={cn(
                      "flex items-center justify-between p-3.5 rounded-xl border transition-all select-none",
                      isMaintRunning ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                      maintUpdate ? "bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40" : "bg-slate-950/20 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold", maintUpdate ? "bg-blue-500/10 text-blue-400 border border-blue-500/30" : "bg-slate-900 text-slate-500 border border-white/5")}>3</div>
                      <div>
                        <p className="text-xs font-bold text-white font-sans">SteamCMD Update</p>
                        <p className="text-[10px] text-slate-400 font-sans">Fetch latest server binary files</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={maintUpdate} disabled={isMaintRunning} onChange={() => {}} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/50 cursor-pointer pointer-events-none" />
                  </div>

                  {/* Step 4 Toggle */}
                  <div 
                    onClick={() => !isMaintRunning && setMaintStart(!maintStart)}
                    className={cn(
                      "flex items-center justify-between p-3.5 rounded-xl border transition-all select-none",
                      isMaintRunning ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                      maintStart ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40" : "bg-slate-950/20 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold", maintStart ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" : "bg-slate-900 text-slate-500 border border-white/5")}>4</div>
                      <div>
                        <p className="text-xs font-bold text-white font-sans">Start Server</p>
                        <p className="text-[10px] text-slate-400 font-sans">Launch process and watch bootup</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={maintStart} disabled={isMaintRunning} onChange={() => {}} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/50 cursor-pointer pointer-events-none" />
                  </div>

                  {/* Step 5 Toggle */}
                  <div 
                    onClick={() => !isMaintRunning && setMaintWipeDinos(!maintWipeDinos)}
                    className={cn(
                      "flex items-center justify-between p-3.5 rounded-xl border transition-all select-none",
                      isMaintRunning ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                      maintWipeDinos ? "bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40" : "bg-slate-950/20 border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold", maintWipeDinos ? "bg-orange-500/10 text-orange-400 border border-orange-500/30" : "bg-slate-900 text-slate-500 border border-white/5")}>5</div>
                      <div>
                        <p className="text-xs font-bold text-white font-sans">Destroy Wild Dinos</p>
                        <p className="text-[10px] text-slate-400 font-sans">Wipe map populations via RCON</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={maintWipeDinos} disabled={isMaintRunning} onChange={() => {}} className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/50 cursor-pointer pointer-events-none" />
                  </div>
                </div>

                {/* Sequence Progress Flow and Console Logs (Right 3 Columns) */}
                <div className="lg:col-span-3 space-y-4 flex flex-col h-full">
                  <div className="bg-slate-950 rounded-2xl p-5 border border-white/5 shadow-inner flex-1 flex flex-col space-y-4">
                    
                    {/* Status Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">Sequence Status</span>
                      {isMaintRunning ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-sans">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Running Step {maintStep}/5</span>
                        </span>
                      ) : maintStep === 6 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                          <Check className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          <span>Completed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-850 text-slate-500 border border-white/5 font-sans">
                          <span>Idle</span>
                        </span>
                      )}
                    </div>

                    {/* Visual Step Timeline */}
                    <div className="flex items-center justify-between px-2 pt-2 relative">
                      {/* Line Background */}
                      <div className="absolute top-[1.4rem] left-10 right-10 h-0.5 bg-slate-800 pointer-events-none z-0"></div>
                      
                      {/* Dynamic Line Progress */}
                      {isMaintRunning && maintStep > 1 && (
                        <div 
                          className="absolute top-[1.4rem] left-10 h-0.5 bg-amber-500 transition-all duration-500 pointer-events-none z-0"
                          style={{ width: `calc(${((maintStep - 1) / 4) * 100}% - 40px)` }}
                        ></div>
                      )}

                      {[
                        { label: 'Stop', step: 1, icon: Power, enabled: maintStop },
                        { label: 'Backup', step: 2, icon: Database, enabled: maintBackup },
                        { label: 'Update', step: 3, icon: Download, enabled: maintUpdate },
                        { label: 'Start', step: 4, icon: Play, enabled: maintStart },
                        { label: 'Wipe', step: 5, icon: Zap, enabled: maintWipeDinos }
                      ].map((s) => {
                        const Icon = s.icon;
                        const isSkipped = !s.enabled;
                        const isCompleted = s.enabled && (maintStep > s.step || maintStep === 6);
                        const isActive = s.enabled && (maintStep === s.step && isMaintRunning);
                        return (
                          <div key={s.step} className="flex flex-col items-center gap-1.5 z-10 select-none">
                            <div 
                              className={cn(
                                "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                                isSkipped ? "bg-[#0B0F19]/40 border-slate-800/40 text-slate-700 border-dashed" :
                                isCompleted ? "bg-emerald-500 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]" :
                                isActive ? "bg-amber-500 border-amber-500 text-white animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.4)]" :
                                "bg-slate-900 border-slate-800 text-slate-500"
                              )}
                              title={isSkipped ? "This step is skipped" : undefined}
                            >
                              {isActive ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Icon className={cn("w-4 h-4", isSkipped && "opacity-20")} />
                              )}
                            </div>
                            <span className={cn(
                              "text-[9px] font-bold uppercase tracking-wider font-sans",
                              isSkipped ? "text-slate-600 line-through font-normal" :
                              isCompleted ? "text-emerald-400" :
                              isActive ? "text-amber-400 animate-pulse" :
                              "text-slate-500"
                            )}>
                              {s.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Console Logs */}
                    <div className="flex-1 flex flex-col space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1 font-sans">Execution Console Logs</span>
                      <div className="flex-1 bg-slate-950 border border-white/5 rounded-xl p-3.5 font-mono text-[10px] leading-relaxed text-slate-300 overflow-y-auto min-h-[160px] max-h-[220px]">
                        {maintLogs.length === 0 ? (
                          <p className="text-slate-600 italic">Logs will appear here once execution starts.</p>
                        ) : (
                          maintLogs.map((logLine, idx) => (
                            <div 
                              key={idx} 
                              className={cn(
                                "py-0.5 border-b border-white/5 last:border-b-0",
                                logLine.includes("ERROR:") ? "text-rose-400" : 
                                logLine.includes("completed successfully") ? "text-emerald-400 font-bold" :
                                logLine.includes("Starting") ? "text-amber-400 font-bold" : ""
                              )}
                            >
                              {logLine}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 5: GIVE ITEMS */}
          {activeTab === 'give_items' && (
            <div className="flex-1 flex flex-col h-full bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/5 bg-slate-800/20">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Gift className="w-5 h-5 text-amber-400" />
                  {t('rcon.giveItem.title', 'Give Items')}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {t('rcon.giveItem.subtitle', 'Send items directly to online players or manual IDs.')}
                </p>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                
                {/* 1. TARGET SECTION */}
                <div className="bg-slate-950/40 border border-white/5 rounded-xl p-5">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-amber-400">1</span>
                    {t('rcon.giveItem.targetTitle', 'Select Target')}
                  </h3>
                  
                  <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-2.5 mb-4 flex items-start gap-2 text-amber-400/90 text-xs shadow-inner">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                      <p className="leading-relaxed">
                          <strong className="text-amber-500 font-medium">Player ID Resolution:</strong> The <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono text-[10px]">GiveItemToPlayer</code> command requires the internal 9-digit <strong>UE4 Player ID</strong>.
                          <br/>The Server Manager will automatically resolve Steam IDs (both from the online player list and manual entries) to their internal Player IDs in real-time by scanning the server's profiles.
                      </p>
                  </div>

                  <div className="flex items-center gap-4 mb-4 border-b border-white/5 pb-4">
                    <button
                      onClick={() => setGiveTargetType('online')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        giveTargetType === 'online' ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:bg-white/5"
                      )}
                    >
                      <Users className="w-4 h-4" />
                      {t('rcon.giveItem.targetOnline', 'Online Players')}
                    </button>
                    <button
                      onClick={() => setGiveTargetType('manual')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        giveTargetType === 'manual' ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:bg-white/5"
                      )}
                    >
                      <TerminalIcon className="w-4 h-4" />
                      {t('rcon.giveItem.targetManual', 'Manual ID / Steam ID')}
                    </button>
                  </div>

                  {giveTargetType === 'online' ? (
                    <div>
                      {onlinePlayers.length === 0 ? (
                        <div className="text-sm text-amber-400/80 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          {t('rcon.giveItem.noPlayers', 'No players currently online. Use manual ID or wait for players to join.')}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {onlinePlayers.map(p => (
                              <button
                                key={p.steamId}
                                onClick={() => setGiveSelectedPlayerId(p.steamId)}
                                className={cn(
                                  "flex flex-col text-left p-3 rounded-lg border transition-all",
                                  giveSelectedPlayerId === p.steamId 
                                    ? "bg-amber-500/10 border-amber-500/50 text-white" 
                                    : "bg-slate-900 border-white/5 text-slate-400 hover:bg-slate-800 hover:border-white/10"
                                )}
                              >
                                <span className="font-bold">{p.name}</span>
                                <span className="text-[10px] font-mono opacity-60">{p.steamId}</span>
                              </button>
                            ))}
                          </div>

                          {giveSelectedPlayerId && (
                            <div className="text-[10px] mt-2 flex items-center gap-1.5 px-1">
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
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={giveManualPlayerId}
                        onChange={e => setGiveManualPlayerId(e.target.value)}
                        placeholder="e.g. 76561198000000000 or 123456789"
                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 font-mono"
                      />
                      <div className="text-[10px] mt-2 flex items-center gap-1.5 px-1 min-h-[16px]">
                        {isResolvingManual ? (
                          <span className="text-amber-400 animate-pulse flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Resolving Steam ID to Player ID...
                          </span>
                        ) : resolvedManualId ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            Resolved Player ID: <code className="bg-emerald-950/40 px-1 py-0.5 rounded font-mono text-emerald-300 text-[10px]">{resolvedManualId}</code>
                          </span>
                        ) : giveManualPlayerId.trim() ? (
                          /^\d{17}$/.test(giveManualPlayerId) ? (
                            <span className="text-rose-400 font-medium flex items-center gap-1 leading-normal">
                              <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              Could not find player save profile for this Steam ID.
                            </span>
                          ) : /^\d{9}$/.test(giveManualPlayerId) ? (
                            <span className="text-emerald-400 font-medium flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              Using 9-digit Player ID directly.
                            </span>
                          ) : (
                            <span className="text-amber-400 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              Using custom ID directly. Make sure it is the 9-digit UE4 Player ID.
                            </span>
                          )
                        ) : (
                          <span className="text-slate-500">Enter a 17-digit Steam ID (auto-resolves) or a 9-digit Player ID.</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. ITEM SECTION */}
                <div className="bg-slate-950/40 border border-white/5 rounded-xl p-5">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-amber-400">2</span>
                    {t('rcon.giveItem.itemTitle', 'Select Item')}
                  </h3>

                  <div className="flex items-center gap-4 mb-4 border-b border-white/5 pb-4">
                    <button
                      onClick={() => setGiveItemSource('preset')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        giveItemSource === 'preset' ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:bg-white/5"
                      )}
                    >
                      <Package className="w-4 h-4" />
                      {t('rcon.giveItem.sourcePreset', 'Catalog')}
                    </button>
                    <button
                      onClick={() => setGiveItemSource('custom')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        giveItemSource === 'custom' ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:bg-white/5"
                      )}
                    >
                      <TerminalIcon className="w-4 h-4" />
                      {t('rcon.giveItem.sourceCustom', 'Custom Blueprint')}
                    </button>
                  </div>

                  {giveItemSource === 'preset' ? (
                    <div className="space-y-4">
                      {/* Search and Category Filter */}
                      <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={giveCatalogSearch}
                            onChange={e => setGiveCatalogSearch(e.target.value)}
                            placeholder={t('rcon.giveItem.searchPlaceholder', 'Search items...')}
                            className="w-full bg-slate-900 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                          />
                        </div>
                        <select 
                          value={giveSelectedCategory}
                          onChange={(e: any) => setGiveSelectedCategory(e.target.value)}
                          className="bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                        >
                          <option value="All">All Categories</option>
                          <option value="Resources">Resources</option>
                          <option value="Consumables">Consumables & Kibbles</option>
                          <option value="Apex Drops">Apex Drops</option>
                          <option value="Artifacts">Artifacts</option>
                          <option value="Ammo">Ammo</option>
                          <option value="Gear">Gear & Weapons</option>
                          <option value="Structures">Structures</option>
                        </select>
                      </div>

                      {/* Item Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {PRESET_ITEMS
                          .filter(i => giveSelectedCategory === 'All' || i.category === giveSelectedCategory)
                          .filter(i => i.name.toLowerCase().includes(giveCatalogSearch.toLowerCase()))
                          .map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => setGiveSelectedPresetItem(item.path)}
                            className={cn(
                              "flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-center gap-2",
                              giveSelectedPresetItem === item.path
                                ? "bg-amber-500/20 border-amber-500/50 text-white"
                                : "bg-slate-900 border-white/5 text-slate-400 hover:bg-slate-800 hover:border-white/10"
                            )}
                          >
                            <span className="text-xs font-bold leading-tight">{item.name}</span>
                            <span className="text-[9px] uppercase tracking-wider opacity-50">{item.category}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={giveCustomBlueprint}
                        onChange={e => setGiveCustomBlueprint(e.target.value)}
                        placeholder="Blueprint'/Game/PrimalEarth/...'"
                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">Enter the exact blueprint path for the item.</p>
                    </div>
                  )}
                </div>

                {/* 3. SETTINGS SECTION */}
                <div className="bg-slate-950/40 border border-white/5 rounded-xl p-5">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-amber-400">3</span>
                    {t('rcon.giveItem.settingsTitle', 'Item Settings')}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-2">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={giveItemQuantity}
                        onChange={e => setGiveItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-2">Quality (0-100)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={giveItemQuality}
                        onChange={e => setGiveItemQuality(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-3 p-2.5 bg-slate-900 rounded-lg border border-white/5 cursor-pointer hover:bg-slate-800 transition-colors h-[42px]">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={giveForceBlueprint}
                            onChange={(e) => setGiveForceBlueprint(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                        </div>
                        <span className="text-xs font-bold text-slate-300">Give as Blueprint</span>
                      </label>
                    </div>
                  </div>
                </div>

              </div>

              {/* ACTION FOOTER */}
              <div className="p-5 border-t border-white/5 bg-slate-900 flex justify-end gap-3">
                <button
                  onClick={executeGiveItem}
                  disabled={
                    isGivingItem || 
                    !isConnected || 
                    (giveTargetType === 'online' && !giveSelectedPlayerId) || 
                    (giveTargetType === 'manual' && !giveManualPlayerId) ||
                    (giveItemSource === 'preset' && !giveSelectedPresetItem) ||
                    (giveItemSource === 'custom' && !giveCustomBlueprint)
                  }
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGivingItem ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</>
                  ) : (
                    <><Gift className="w-4 h-4" /> Send Item(s)</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* TAB SIDE PANEL: PLAYER MANAGEMENT */}
        {showPlayers && activeTab === 'terminal' && (
          <motion.div 
            initial={{ opacity: 0, width: 0, x: 20 }} 
            animate={{ opacity: 1, width: 'auto', x: 0 }}
            className="w-full lg:w-80 glass-panel rounded-2xl p-4 flex flex-col min-h-[500px] h-auto border border-white/5 shadow-xl shrink-0"
          >
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <Users className="w-5 h-5 text-amber-400" />
                <span>Active Survivors</span>
              </h3>
              <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">
                {onlinePlayers.length} Online
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2.5 min-h-[380px] max-h-[60vh]">
              {onlinePlayers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs text-center py-12">
                  <Users className="w-8 h-8 mb-3 opacity-20" />
                  <p>No players currently connected to the server.</p>
                </div>
              ) : (
                onlinePlayers.map((p, idx) => (
                  <div key={idx} className="bg-slate-950 border border-white/5 p-3 rounded-xl flex flex-col gap-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate" title={p.name}>{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate" title={p.steamId}>{p.steamId}</div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { setCommand(`kickplayer ${p.steamId}`); setTimeout(() => handleSend(`kickplayer ${p.steamId}`), 0); }}
                        className="flex-1 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors border border-orange-500/15"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Kick
                      </button>
                      <button 
                        onClick={() => { setCommand(`banplayer ${p.steamId}`); setTimeout(() => handleSend(`banplayer ${p.steamId}`), 0); }}
                        className="flex-1 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors border border-rose-500/15"
                      >
                        <Ban className="w-3.5 h-3.5" /> Ban
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
