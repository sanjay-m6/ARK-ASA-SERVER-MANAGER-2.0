import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    X,
    Search,
    Download,
    Check,
    Loader2,
    Sparkles,
    Compass,
    MapPin,
    Copy,
    CheckCircle2
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { installMod, searchMods } from '../../utils/tauri';
import { ModInfo } from '../../types';
import {
    MODDED_MAP_PRESETS,
    detectMapArgumentFromMod,
    isModLikelyMap
} from '../../data/moddedMapRegistry';
import toast from 'react-hot-toast';

// Fallback images
import mapScorchedEarth from '../../assets/maps/scorched_earth.png';
import mapFjordur from '../../assets/maps/fjordur.png';
import mapSvartalfheim from '../../assets/maps/svartalfheim.png';
import mapAmissa from '../../assets/maps/amissa.png';
import mapInsaluna from '../../assets/maps/insaluna.png';
import mapForglar from '../../assets/maps/forglar.png';
import mapAstraeos from '../../assets/maps/astraeos.png';
import mapTemptressLagoon from '../../assets/maps/temptress_lagoon.png';
import mapReverence from '../../assets/maps/reverence.png';
import mapLostColony from '../../assets/maps/lost_colony.png';
import mapArkClub from '../../assets/maps/ark_club.png';
import mapTheIsland from '../../assets/maps/the_island.png';

const PRESET_IMAGE_MAP: Record<string, string> = {
    'ScorchedEarthRM_WP': mapScorchedEarth,
    'Bjarnheim_WP': mapFjordur,
    'Svartalfheim_WP': mapSvartalfheim,
    'Amissa_WP': mapAmissa,
    'Insaluna_WP': mapInsaluna,
    'Forglar_WP': mapForglar,
    'Astraeos_WP': mapAstraeos,
    'TemptressLagoon_WP': mapTemptressLagoon,
    'Reverence_WP': mapReverence,
    'LostColony_WP': mapLostColony,
    'ClubARK_WP': mapArkClub,
    'Althemia_WP': mapAstraeos,
    'Tharat_WP': mapReverence
};

interface ModMapHubModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverId: number;
    currentMapArg: string;
    installedMods: ModInfo[];
    onMapInstalledAndSelected: (mapArg: string, modId?: string) => void;
    onRefreshInstalledMods?: () => Promise<void> | void;
}

export const ModMapHubModal: React.FC<ModMapHubModalProps> = ({
    isOpen,
    onClose,
    serverId,
    currentMapArg,
    installedMods,
    onMapInstalledAndSelected,
    onRefreshInstalledMods
}) => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'installed' | 'presets' | 'curseforge'>('all');
    const [installingModId, setInstallingModId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Direct ID quick install
    const [directIdInput, setDirectIdInput] = useState('');
    const [isDirectInstalling, setIsDirectInstalling] = useState(false);

    // CurseForge dynamic search state
    const [cfResults, setCfResults] = useState<ModInfo[]>([]);
    const [isSearchingCf, setIsSearchingCf] = useState(false);

    // Keyboard listener for ESC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    // Live search on CurseForge when tab is 'curseforge' or user searches something custom
    useEffect(() => {
        if (!isOpen) return;
        if (activeTab !== 'curseforge' && !searchQuery.trim()) return;

        const timer = setTimeout(async () => {
            const query = searchQuery.trim() || 'map';
            setIsSearchingCf(true);
            try {
                const results = await searchMods(query, 'ASA', undefined, undefined, undefined, 0);
                // Filter mods that are likely maps or user searched explicitly
                const filtered = results.filter(m => isModLikelyMap(m) || query !== 'map');
                setCfResults(filtered);
            } catch (err) {
                console.error('Failed to search CurseForge maps:', err);
            } finally {
                setIsSearchingCf(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [searchQuery, activeTab, isOpen]);

    // Presets for ASA
    const asaPresets = useMemo(() => {
        return MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASA');
    }, []);

    // Helper to check if a preset or mod is installed
    const isModInstalled = useCallback((modId?: string, mapArg?: string): boolean => {
        if (!modId && !mapArg) return false;
        return installedMods.some(m => {
            if (modId && m.id === String(modId)) return true;
            if (mapArg && detectMapArgumentFromMod(m).toLowerCase() === mapArg.toLowerCase()) return true;
            return false;
        });
    }, [installedMods]);

    // Check if map is active
    const isMapActive = useCallback((mapArg: string): boolean => {
        return currentMapArg.toLowerCase() === mapArg.toLowerCase();
    }, [currentMapArg]);

    // Filtered lists
    const filteredPresets = useMemo(() => {
        let list = asaPresets;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.mapArgument.toLowerCase().includes(q) ||
                p.author.toLowerCase().includes(q) ||
                (p.mapModId && p.mapModId.includes(q)) ||
                p.description.toLowerCase().includes(q)
            );
        }
        if (activeTab === 'installed') {
            list = list.filter(p => isModInstalled(p.mapModId, p.mapArgument));
        }
        return list;
    }, [asaPresets, searchQuery, activeTab, isModInstalled]);

    // Handler to copy Mod ID
    const handleCopyId = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        toast.success(`Copied Mod ID: ${id}`);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // 1-Click Install & Activate handler
    const handleInstallAndActivate = async (
        modInfo: { id: string; name: string; mapArgument?: string; author?: string; description?: string; thumbnailUrl?: string }
    ) => {
        if (!serverId) {
            toast.error(t('modManager.selectServerFirst', 'Please select a server first'));
            return;
        }

        const mapArg = modInfo.mapArgument || detectMapArgumentFromMod(modInfo);
        setInstallingModId(modInfo.id);
        const toastId = toast.loading(`Installing & configuring ${modInfo.name}...`);

        try {
            // 1. Install mod into server database
            await installMod(serverId, {
                id: modInfo.id,
                name: modInfo.name,
                author: modInfo.author,
                description: modInfo.description,
                thumbnailUrl: modInfo.thumbnailUrl,
                enabled: true
            });

            // 2. Refresh installed mods in parent
            if (onRefreshInstalledMods) {
                await onRefreshInstalledMods();
            }

            // 3. Notify parent to select this map argument & apply launch configs
            onMapInstalledAndSelected(mapArg, modInfo.id);

            toast.success(`Successfully installed and activated ${modInfo.name}!`, { id: toastId });
            onClose();
        } catch (err: any) {
            console.error('Failed to install mod map:', err);
            toast.error(`Installation failed: ${err.message || err}`, { id: toastId });
        } finally {
            setInstallingModId(null);
        }
    };

    // Handler to activate an already installed map
    const handleActivateInstalled = (mapArg: string, modId?: string) => {
        onMapInstalledAndSelected(mapArg, modId);
        toast.success(`Active map changed to: ${mapArg}`);
        onClose();
    };

    // Direct Mod ID / URL quick install
    const handleDirectInstall = async (e: React.FormEvent) => {
        e.preventDefault();
        const input = directIdInput.trim();
        if (!input) return;

        // Extract ID
        const match = input.match(/\d{5,}/);
        const modId = match ? match[0] : input;

        setIsDirectInstalling(true);
        const toastId = toast.loading(`Resolving CurseForge Mod ID ${modId}...`);
        try {
            // Check if matches known preset
            const knownPreset = MODDED_MAP_PRESETS.find(p => p.mapModId === modId);
            const mapName = knownPreset ? knownPreset.name : `CurseForge Mod ${modId}`;
            const mapArg = knownPreset ? knownPreset.mapArgument : `${mapName.replace(/[^A-Za-z0-9]/g, '')}_WP`;

            await installMod(serverId, {
                id: modId,
                name: mapName,
                enabled: true
            });

            if (onRefreshInstalledMods) {
                await onRefreshInstalledMods();
            }

            onMapInstalledAndSelected(mapArg, modId);
            toast.success(`Successfully installed & activated map (ID: ${modId})!`, { id: toastId });
            setDirectIdInput('');
            onClose();
        } catch (err: any) {
            console.error('Direct install failed:', err);
            toast.error(`Install failed: ${err.message || err}`, { id: toastId });
        } finally {
            setIsDirectInstalling(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 md:p-8 bg-black/80 backdrop-blur-md animate-fadeIn">
            <div
                className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl text-slate-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 sm:px-6 border-b border-white/10 bg-slate-950/40 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                            <Compass className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-white tracking-tight">ASA Modded Maps Hub</h2>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    1-Click Install
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Discover, install, and switch to community modded maps instantly with automatic launch configuration.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Sub-bar: Search, Filter Tabs & Direct Paste */}
                <div className="p-4 sm:px-6 border-b border-white/10 bg-slate-900/60 space-y-3 flex-shrink-0">
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search popular maps, authors, or map arguments..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Direct Paste / Mod ID Quick-Install Form */}
                        <form onSubmit={handleDirectInstall} className="flex gap-2 items-center flex-shrink-0">
                            <input
                                type="text"
                                value={directIdInput}
                                onChange={(e) => setDirectIdInput(e.target.value)}
                                placeholder="CurseForge Mod ID or URL..."
                                className="w-48 sm:w-56 px-3 py-2 bg-slate-950/70 border border-amber-500/30 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                            />
                            <button
                                type="submit"
                                disabled={!directIdInput.trim() || isDirectInstalling}
                                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer whitespace-nowrap"
                            >
                                {isDirectInstalling ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Download className="w-3.5 h-3.5" />
                                )}
                                <span>Install ID</span>
                            </button>
                        </form>
                    </div>

                    {/* Navigation Filter Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 text-xs">
                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            className={cn(
                                "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap",
                                activeTab === 'all'
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                            )}
                        >
                            All Maps ({asaPresets.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('presets')}
                            className={cn(
                                "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap",
                                activeTab === 'presets'
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                            )}
                        >
                            Popular Presets
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('installed')}
                            className={cn(
                                "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                                activeTab === 'installed'
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                            )}
                        >
                            <span>Installed on Server</span>
                            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 text-[10px] font-mono">
                                {installedMods.filter(isModLikelyMap).length}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('curseforge')}
                            className={cn(
                                "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                                activeTab === 'curseforge'
                                    ? "bg-purple-600 text-white shadow-sm"
                                    : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                            )}
                        >
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span>CurseForge Live Search</span>
                        </button>
                    </div>
                </div>

                {/* Modal Body: Cards Grid */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-4">
                    {/* Live CurseForge Mode */}
                    {activeTab === 'curseforge' ? (
                        <div>
                            {isSearchingCf ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-3" />
                                    <p className="text-sm font-medium">Searching CurseForge for ARK: Survival Ascended maps...</p>
                                </div>
                            ) : cfResults.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {cfResults.map((mod) => {
                                        const mapArg = detectMapArgumentFromMod(mod);
                                        const installed = isModInstalled(mod.id, mapArg);
                                        const active = isMapActive(mapArg);
                                        const isInstalling = installingModId === mod.id;

                                        return (
                                            <div
                                                key={mod.id}
                                                className="group relative rounded-2xl overflow-hidden bg-slate-950/70 border border-white/10 hover:border-purple-500/50 transition-all duration-300 flex flex-col justify-between shadow-lg"
                                            >
                                                <div>
                                                    {/* Thumbnail */}
                                                    <div className="relative aspect-[16/9] overflow-hidden bg-slate-950">
                                                        <img
                                                            src={mod.thumbnailUrl || mapTheIsland}
                                                            alt={mod.name}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                            onError={(e) => {
                                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                                                        <div className="absolute top-2.5 right-2.5 flex gap-1.5 items-center">
                                                            <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-purple-500/30 text-purple-300 border border-purple-400/40 backdrop-blur-md">
                                                                CurseForge
                                                            </span>
                                                        </div>
                                                        <div className="absolute bottom-2.5 left-2.5 right-2.5">
                                                            <h4 className="font-bold text-white text-base leading-tight drop-shadow truncate">
                                                                {mod.name}
                                                            </h4>
                                                            <div className="text-[10px] text-slate-300 font-mono mt-0.5 flex items-center gap-2">
                                                                <span className="text-emerald-400 font-semibold">{mapArg}</span>
                                                                <span>•</span>
                                                                <span>ID: {mod.id}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Body */}
                                                    <div className="p-3.5 space-y-2 text-xs">
                                                        {mod.author && (
                                                            <div className="text-[11px] text-slate-400">
                                                                Author: <span className="text-slate-200 font-medium">{mod.author}</span>
                                                            </div>
                                                        )}
                                                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                                            {mod.description || 'Custom modded map available via CurseForge.'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Card Footer Actions */}
                                                <div className="p-3.5 pt-0">
                                                    {active ? (
                                                        <div className="w-full py-2 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 select-none">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                            <span>Active Server Map</span>
                                                        </div>
                                                    ) : installed ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleActivateInstalled(mapArg, mod.id)}
                                                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                                        >
                                                            <Check className="w-4 h-4 text-emerald-400" />
                                                            <span>Set as Active Map</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={isInstalling}
                                                            onClick={() => handleInstallAndActivate(mod)}
                                                            className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md hover:shadow-purple-500/20 cursor-pointer disabled:opacity-50"
                                                        >
                                                            {isInstalling ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    <span>Installing...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Download className="w-4 h-4" />
                                                                    <span>1-Click Install & Activate</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-16 text-slate-500 space-y-2">
                                    <MapPin className="w-10 h-10 mx-auto opacity-30 text-purple-400" />
                                    <p className="text-sm text-slate-400 font-medium">No CurseForge maps found matching "{searchQuery}"</p>
                                    <p className="text-xs text-slate-500">Try searching for map names like "Bjarnheim", "Amissa", "Forglar", or paste a Mod ID.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Presets Mode (All / Presets / Installed) */
                        <div>
                            {filteredPresets.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredPresets.map((preset) => {
                                        const mapImage = PRESET_IMAGE_MAP[preset.mapArgument] || mapTheIsland;
                                        const installed = isModInstalled(preset.mapModId, preset.mapArgument);
                                        const active = isMapActive(preset.mapArgument);
                                        const isInstalling = installingModId === preset.mapModId;

                                        return (
                                            <div
                                                key={preset.id}
                                                className={cn(
                                                    "group relative rounded-2xl overflow-hidden bg-slate-950/70 border transition-all duration-300 flex flex-col justify-between shadow-lg",
                                                    active
                                                        ? "border-emerald-500/60 ring-2 ring-emerald-500/20"
                                                        : installed
                                                            ? "border-emerald-500/30 hover:border-emerald-500/60"
                                                            : "border-white/10 hover:border-white/25"
                                                )}
                                            >
                                                <div>
                                                    {/* Thumbnail Banner */}
                                                    <div className="relative aspect-[16/9] overflow-hidden bg-slate-950">
                                                        <img
                                                            src={mapImage}
                                                            alt={preset.name}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                                                        {/* Badges Top */}
                                                        <div className="absolute top-2.5 right-2.5 flex gap-1.5 items-center">
                                                            <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-black/60 text-slate-300 border border-white/10 backdrop-blur-md">
                                                                {preset.size}
                                                            </span>
                                                            <span
                                                                className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider text-white backdrop-blur-md"
                                                                style={{ backgroundColor: `${preset.color}70`, border: `1px solid ${preset.color}` }}
                                                            >
                                                                {preset.dlcType}
                                                            </span>
                                                        </div>

                                                        {/* Title & Arg Bottom */}
                                                        <div className="absolute bottom-2.5 left-3 right-3">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-base">{preset.icon}</span>
                                                                <h4 className="font-bold text-white text-base leading-tight drop-shadow truncate">
                                                                    {preset.name}
                                                                </h4>
                                                            </div>
                                                            <div className="text-[10px] text-slate-300 font-mono mt-0.5 flex items-center gap-2">
                                                                <span className="text-emerald-400 font-semibold">{preset.mapArgument}</span>
                                                                {preset.mapModId && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => handleCopyId(preset.mapModId!, e)}
                                                                            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                                                                            title="Copy Mod ID"
                                                                        >
                                                                            <span>ID: {preset.mapModId}</span>
                                                                            {copiedId === preset.mapModId ? (
                                                                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                                                                            ) : (
                                                                                <Copy className="w-2.5 h-2.5 text-slate-400" />
                                                                            )}
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Card Body */}
                                                    <div className="p-3.5 space-y-2 text-xs">
                                                        <div className="flex items-center justify-between text-[11px]">
                                                            <span className="text-slate-400">
                                                                Author: <span className="text-slate-200 font-semibold">{preset.author}</span>
                                                            </span>
                                                            {installed ? (
                                                                <span className="text-emerald-400 font-medium flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                                    Installed
                                                                </span>
                                                            ) : (
                                                                <span className="text-amber-400 font-medium flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                                    Not Installed
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                                            {preset.description}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Footer Action Button */}
                                                <div className="p-3.5 pt-0">
                                                    {active ? (
                                                        <div className="w-full py-2 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 select-none shadow-sm">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                            <span>Active Server Map</span>
                                                        </div>
                                                    ) : installed ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleActivateInstalled(preset.mapArgument, preset.mapModId)}
                                                            className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                                        >
                                                            <Check className="w-4 h-4 text-emerald-400" />
                                                            <span>Set as Active Map</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={isInstalling || !preset.mapModId}
                                                            onClick={() => handleInstallAndActivate({
                                                                id: preset.mapModId!,
                                                                name: preset.name,
                                                                mapArgument: preset.mapArgument,
                                                                author: preset.author,
                                                                description: preset.description
                                                            })}
                                                            className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md hover:shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                                                        >
                                                            {isInstalling ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    <span>Installing Mod...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Download className="w-4 h-4" />
                                                                    <span>1-Click Install & Activate</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-16 text-slate-500 space-y-2">
                                    <MapPin className="w-10 h-10 mx-auto opacity-30 text-emerald-400" />
                                    <p className="text-sm text-slate-400 font-medium">No modded maps found</p>
                                    <p className="text-xs text-slate-500">Try adjusting your search query or switch to the CurseForge tab.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal Footer Note */}
                <div className="p-3.5 px-6 border-t border-white/10 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>Installing a modded map automatically registers the mod and configures <code className="text-emerald-400">-MapModID</code> on server startup.</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ModMapHubModal;
