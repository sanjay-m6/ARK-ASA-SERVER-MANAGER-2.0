import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    Layers,
    Download,
    Upload,
    X,
    Search,
    Copy,
    Trash2,
    Server as ServerIcon,
    ShieldAlert,
    Tag,
    FolderCheck,
    Check,
    CheckCircle2,
    ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Server } from '../../types';
import {
    ArkServerPreset,
    PresetExportOptions,
    PresetImportOptions,
} from '../../types/preset.types';
import {
    exportServerToPreset,
    savePresetToFile,
    loadPresetFromFile,
    parsePresetJson,
    applyPresetToServer,
    BUILT_IN_STARTER_PRESETS,
    getLocalPresets,
    saveLocalPreset,
    deleteLocalPreset,
} from '../../services/presetService';
import { cn } from '../../utils/helpers';

interface ServerPresetModalProps {
    isOpen: boolean;
    onClose: () => void;
    servers: Server[];
    initialServerId?: number;
    initialTab?: 'library' | 'export' | 'import';
    onCreateServerFromPreset?: (preset: ArkServerPreset) => void;
}

export const ServerPresetModal: React.FC<ServerPresetModalProps> = ({
    isOpen,
    onClose,
    servers,
    initialServerId,
    initialTab = 'library',
    onCreateServerFromPreset,
}) => {
    // Active Tab
    const [activeTab, setActiveTab] = useState<'library' | 'export' | 'import'>(initialTab);

    // Filter & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGameFilter, setSelectedGameFilter] = useState<'ALL' | 'ASA' | 'ASE'>('ALL');

    // Local Presets State
    const [customPresets, setCustomPresets] = useState<ArkServerPreset[]>([]);

    // Selected preset in library for quick action drawer
    const [selectedLibraryPreset, setSelectedLibraryPreset] = useState<ArkServerPreset | null>(null);

    // Reload presets whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setCustomPresets(getLocalPresets());
            if (initialTab) setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    // =========================================================================
    // EXPORT TAB STATE
    // =========================================================================
    const [exportServerId, setExportServerId] = useState<number>(() => {
        if (initialServerId && servers.some(s => s.id === initialServerId)) {
            return initialServerId;
        }
        return servers[0]?.id || 0;
    });

    const [exportMetadata, setExportMetadata] = useState({
        name: '',
        description: '',
        author: '',
        tags: 'PvE, Boosted',
    });

    const [exportOptions, setExportOptions] = useState<PresetExportOptions>({
        includeGameUserSettings: true,
        includeGameIni: true,
        includeMods: true,
        includeLaunchArgs: true,
        includeServerSettings: true,
        includePasswords: false, // Default off for safety
    });

    const [isExporting, setIsExporting] = useState(false);

    // Synchronize default export name when exportServerId changes
    useEffect(() => {
        const s = servers.find(srv => srv.id === exportServerId);
        if (s) {
            setExportMetadata(prev => ({
                ...prev,
                name: `${s.name} Template`,
                description: `Complete configuration and modpack preset extracted from ${s.name} (${s.config?.mapName || 'Custom Map'}).`,
                author: 'Server Admin',
            }));
        }
    }, [exportServerId, servers]);

    // =========================================================================
    // IMPORT TAB STATE
    // =========================================================================
    const [importedPreset, setImportedPreset] = useState<ArkServerPreset | null>(null);
    const [rawJsonInput, setRawJsonInput] = useState('');
    const [showJsonInput, setShowJsonInput] = useState(false);
    const [importTargetServerId, setImportTargetServerId] = useState<number>(() => {
        if (initialServerId && servers.some(s => s.id === initialServerId)) {
            return initialServerId;
        }
        return servers[0]?.id || 0;
    });

    const [importOptions, setImportOptions] = useState<PresetImportOptions>({
        applyConfigs: true,
        applyMods: true,
        applyServerSettings: true,
        applyLaunchArgs: true,
        createBackupFirst: true,
    });

    const [isApplying, setIsApplying] = useState(false);

    // =========================================================================
    // ALL PRESETS (Built-in + Local Saved)
    // =========================================================================
    const allPresets = useMemo(() => {
        return [...customPresets, ...BUILT_IN_STARTER_PRESETS];
    }, [customPresets]);

    const filteredPresets = useMemo(() => {
        return allPresets.filter(p => {
            const matchesGame = selectedGameFilter === 'ALL' || p.serverType === selectedGameFilter;
            const matchesSearch =
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
            return matchesGame && matchesSearch;
        });
    }, [allPresets, selectedGameFilter, searchQuery]);

    // =========================================================================
    // HANDLERS
    // =========================================================================

    const handleDownloadPreset = async () => {
        const sourceServer = servers.find(s => s.id === exportServerId);
        if (!sourceServer) {
            toast.error('Please select a valid server to export.');
            return;
        }

        setIsExporting(true);
        try {
            const parsedTags = exportMetadata.tags
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);

            const preset = await exportServerToPreset(sourceServer, exportOptions, {
                name: exportMetadata.name,
                description: exportMetadata.description,
                author: exportMetadata.author,
                tags: parsedTags,
            });

            const saved = await savePresetToFile(preset);
            if (saved) {
                toast.success(`Preset "${preset.name}" exported successfully!`);
                saveLocalPreset(preset);
                setCustomPresets(getLocalPresets());
            }
        } catch (err: any) {
            toast.error(`Export failed: ${err?.message || err}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleCopyPresetJson = async () => {
        const sourceServer = servers.find(s => s.id === exportServerId);
        if (!sourceServer) return;

        setIsExporting(true);
        try {
            const parsedTags = exportMetadata.tags
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);

            const preset = await exportServerToPreset(sourceServer, exportOptions, {
                name: exportMetadata.name,
                description: exportMetadata.description,
                author: exportMetadata.author,
                tags: parsedTags,
            });

            await navigator.clipboard.writeText(JSON.stringify(preset, null, 2));
            toast.success('Preset JSON copied to clipboard!');
        } catch (err: any) {
            toast.error(`Failed to copy: ${err?.message || err}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleSaveToLibraryOnly = async () => {
        const sourceServer = servers.find(s => s.id === exportServerId);
        if (!sourceServer) return;

        setIsExporting(true);
        try {
            const parsedTags = exportMetadata.tags
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);

            const preset = await exportServerToPreset(sourceServer, exportOptions, {
                name: exportMetadata.name,
                description: exportMetadata.description,
                author: exportMetadata.author,
                tags: parsedTags,
            });

            saveLocalPreset(preset);
            setCustomPresets(getLocalPresets());
            toast.success(`Saved "${preset.name}" to your local templates library!`);
            setActiveTab('library');
        } catch (err: any) {
            toast.error(`Save failed: ${err?.message || err}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleLoadFile = async () => {
        try {
            const loaded = await loadPresetFromFile();
            if (loaded) {
                setImportedPreset(loaded);
                toast.success(`Loaded preset: ${loaded.name}`);
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to parse preset file');
        }
    };

    const handleParseRawJson = () => {
        try {
            if (!rawJsonInput.trim()) {
                toast.error('Please paste preset JSON first.');
                return;
            }
            const parsed = parsePresetJson(rawJsonInput);
            setImportedPreset(parsed);
            setShowJsonInput(false);
            toast.success(`Loaded preset: ${parsed.name}`);
        } catch (err: any) {
            toast.error(err?.message || 'Invalid JSON format');
        }
    };

    const handleApplyPreset = async (presetToApply: ArkServerPreset, targetId?: number) => {
        const serverId = targetId || importTargetServerId;
        const targetServer = servers.find(s => s.id === serverId);

        if (!targetServer) {
            toast.error('Please select a target server to apply this template to.');
            return;
        }

        setIsApplying(true);
        try {
            const result = await applyPresetToServer(targetServer, presetToApply, importOptions);
            toast.success(
                `Template "${presetToApply.name}" applied to ${targetServer.name}! ${
                    result.backupCreated ? '(Config backup saved)' : ''
                }`
            );
            onClose();
        } catch (err: any) {
            toast.error(`Failed to apply preset: ${err?.message || err}`);
        } finally {
            setIsApplying(false);
        }
    };

    const handleDeleteCustomPreset = (presetId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this template from your local library?')) {
            deleteLocalPreset(presetId);
            setCustomPresets(getLocalPresets());
            if (selectedLibraryPreset?.id === presetId) {
                setSelectedLibraryPreset(null);
            }
            toast.success('Template removed from library');
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
                />

                {/* Modal Window */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10"
                >
                    {/* Top Decorative Accent Line */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-violet-500" />

                    {/* Modal Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shadow-inner shrink-0">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    Server Templates & Presets
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                        .arkpreset
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Package, share, and 1-click apply server rates, INI configurations, and modpacks.
                                </p>
                            </div>
                        </div>

                        {/* Navigation Tabs (Segmented Pill) */}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
                                <button
                                    onClick={() => setActiveTab('library')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                                        activeTab === 'library'
                                            ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                                    )}
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    <span>Library ({allPresets.length})</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('export')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                                        activeTab === 'export'
                                            ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                                    )}
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Export</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('import')}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer relative",
                                        activeTab === 'import'
                                            ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                                    )}
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Import & Apply</span>
                                    {importedPreset && (
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                                    )}
                                </button>
                            </div>

                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shrink-0 ml-1"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                        {/* =======================================================
                            TAB 1: PRESET LIBRARY
                            ======================================================= */}
                        {activeTab === 'library' && (
                            <div className="space-y-4">
                                {/* Search & Filter Bar */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                                    <div className="relative flex-1 w-full">
                                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Search templates by name, tags, or rates..."
                                            className="w-full pl-8.5 pr-8 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-all"
                                        />
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery('')}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[11px] text-slate-400 font-medium hidden md:inline">Platform:</span>
                                        <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700">
                                            {(['ALL', 'ASA', 'ASE'] as const).map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setSelectedGameFilter(type)}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer",
                                                        selectedGameFilter === type
                                                            ? "bg-sky-500 text-white shadow-sm"
                                                            : "text-slate-400 hover:text-slate-200"
                                                    )}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Preset Cards Grid (Balanced 3-column on desktop, 2 on tablet, 1 on mobile) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredPresets.map(preset => {
                                        const isBuiltIn = BUILT_IN_STARTER_PRESETS.some(b => b.id === preset.id);
                                        const r = preset.ratesSummary;
                                        const isSelected = selectedLibraryPreset?.id === preset.id;

                                        return (
                                            <div
                                                key={preset.id}
                                                className={cn(
                                                    "border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 group relative",
                                                    isSelected
                                                        ? "bg-sky-500/10 border-sky-500/80 shadow-lg shadow-sky-500/10"
                                                        : "bg-slate-800/40 hover:bg-slate-800/70 border-slate-700/60 hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-500/5"
                                                )}
                                            >
                                                <div>
                                                    {/* Card Header */}
                                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                                                <h3 className="text-sm font-bold text-white group-hover:text-sky-300 transition-colors truncate">
                                                                    {preset.name}
                                                                </h3>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                                                    preset.serverType === 'ASA'
                                                                        ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                                                                        : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                                                                )}>
                                                                    {preset.serverType}
                                                                </span>
                                                                {isBuiltIn ? (
                                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                                                        Official
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/25">
                                                                        Custom
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {!isBuiltIn && (
                                                            <button
                                                                onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                                                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                                                                title="Delete custom preset"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed min-h-[32px]">
                                                        {preset.description}
                                                    </p>

                                                    {/* Rates Micro-Grid (Game Telemetry Cards) */}
                                                    {r && (
                                                        <div className="grid grid-cols-4 gap-1.5 my-3">
                                                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg py-1 px-1 text-center">
                                                                <span className="text-[9px] text-slate-400 block font-medium">XP</span>
                                                                <span className="text-xs font-bold text-emerald-400">{r.xpMultiplier}x</span>
                                                            </div>
                                                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg py-1 px-1 text-center">
                                                                <span className="text-[9px] text-slate-400 block font-medium">Tame</span>
                                                                <span className="text-xs font-bold text-sky-400">{r.tamingSpeedMultiplier}x</span>
                                                            </div>
                                                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg py-1 px-1 text-center">
                                                                <span className="text-[9px] text-slate-400 block font-medium">Harvest</span>
                                                                <span className="text-xs font-bold text-amber-400">{r.harvestAmountMultiplier}x</span>
                                                            </div>
                                                            <div className="bg-slate-900/80 border border-slate-800 rounded-lg py-1 px-1 text-center">
                                                                <span className="text-[9px] text-slate-400 block font-medium">Mature</span>
                                                                <span className="text-xs font-bold text-purple-400">{r.babyMatureSpeedMultiplier}x</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Meta Info */}
                                                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-3">
                                                        <span className="truncate max-w-[120px]">By {preset.author}</span>
                                                        <span>{preset.mods.length > 0 ? `${preset.mods.length} Mods` : 'Vanilla'}</span>
                                                    </div>
                                                </div>

                                                {/* Card Actions */}
                                                <div className="flex items-center gap-2 pt-2.5 border-t border-slate-700/40">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedLibraryPreset(preset);
                                                            setImportedPreset(preset);
                                                        }}
                                                        className={cn(
                                                            "flex-1 py-2 px-3 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer",
                                                            isSelected
                                                                ? "bg-sky-500 text-white shadow-md shadow-sky-500/25"
                                                                : "bg-gradient-to-r from-sky-500/20 to-blue-600/20 hover:from-sky-500/30 hover:to-blue-600/30 text-sky-300 border border-sky-500/30 hover:border-sky-500/50"
                                                        )}
                                                    >
                                                        {isSelected ? (
                                                            <>
                                                                <Check className="w-3.5 h-3.5" />
                                                                <span>Selected</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                                                                <span>Select Template</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={() => savePresetToFile(preset)}
                                                        className="p-2 bg-slate-900/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 rounded-xl transition-all active:scale-95 cursor-pointer"
                                                        title="Export .arkpreset file"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Quick Action Bar when a template is selected */}
                                {selectedLibraryPreset && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="sticky bottom-0 bg-slate-900/95 border border-sky-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                                                <Sparkles className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-white flex items-center gap-2">
                                                    <span>Ready to Apply: {selectedLibraryPreset.name}</span>
                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 font-mono">
                                                        {selectedLibraryPreset.serverType}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-400">
                                                    Apply INIs & rules to an existing server, or deploy a new server instance.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                                            {servers.length > 0 && (
                                                <select
                                                    value={importTargetServerId}
                                                    onChange={e => setImportTargetServerId(Number(e.target.value))}
                                                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer max-w-[200px]"
                                                >
                                                    {servers
                                                        .filter(s => s.serverType === selectedLibraryPreset.serverType)
                                                        .map(s => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.name} ({s.status})
                                                            </option>
                                                        ))}
                                                </select>
                                            )}

                                            <button
                                                onClick={() => handleApplyPreset(selectedLibraryPreset, importTargetServerId)}
                                                disabled={isApplying || servers.length === 0}
                                                className="flex-1 md:flex-none px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                <span>{isApplying ? 'Applying...' : 'Apply to Server'}</span>
                                            </button>

                                            {onCreateServerFromPreset && (
                                                <button
                                                    onClick={() => {
                                                        onCreateServerFromPreset(selectedLibraryPreset);
                                                        onClose();
                                                    }}
                                                    className="px-3.5 py-2 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 font-bold text-xs rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                                                >
                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                    <span>New Server</span>
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setActiveTab('import')}
                                                className="px-3 py-2 text-slate-400 hover:text-white text-xs hover:underline cursor-pointer"
                                            >
                                                Customize Options →
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )}

                        {/* =======================================================
                            TAB 2: EXPORT SERVER TEMPLATE
                            ======================================================= */}
                        {activeTab === 'export' && (
                            <div className="space-y-5">
                                {/* Server Picker */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                        <ServerIcon className="w-3.5 h-3.5 text-sky-400" />
                                        Select Source Server to Package:
                                    </label>
                                    <select
                                        value={exportServerId}
                                        onChange={e => setExportServerId(Number(e.target.value))}
                                        className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                                    >
                                        {servers.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} ({s.serverType}) — Map: {s.config?.mapName || 'Default'} [Status: {s.status}]
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Metadata Inputs Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-800/30 p-4 rounded-2xl border border-slate-700/50">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-300">
                                            Template Name:
                                        </label>
                                        <input
                                            type="text"
                                            value={exportMetadata.name}
                                            onChange={e => setExportMetadata({ ...exportMetadata, name: e.target.value })}
                                            placeholder="e.g., My Community 5x Small Tribes"
                                            className="w-full px-3.5 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-300">
                                            Author / Community:
                                        </label>
                                        <input
                                            type="text"
                                            value={exportMetadata.author}
                                            onChange={e => setExportMetadata({ ...exportMetadata, author: e.target.value })}
                                            placeholder="e.g., ArkAdmin / Apex Gaming"
                                            className="w-full px-3.5 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                                        />
                                    </div>

                                    <div className="sm:col-span-2 space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-300">
                                            Description & Playstyle Notes:
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={exportMetadata.description}
                                            onChange={e => setExportMetadata({ ...exportMetadata, description: e.target.value })}
                                            placeholder="Provide brief notes on rates, rules, or featured mods..."
                                            className="w-full px-3.5 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 resize-none"
                                        />
                                    </div>

                                    <div className="sm:col-span-2 space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                            <Tag className="w-3.5 h-3.5 text-slate-400" />
                                            Tags (comma-separated):
                                        </label>
                                        <input
                                            type="text"
                                            value={exportMetadata.tags}
                                            onChange={e => setExportMetadata({ ...exportMetadata, tags: e.target.value })}
                                            placeholder="PvE, 5x Rates, Fast Breeding, Crossplay"
                                            className="w-full px-3.5 py-2 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                                        />
                                    </div>
                                </div>

                                {/* Components Inclusions */}
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-slate-300">Components to Include in Preset:</span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {[
                                            { key: 'includeGameUserSettings', label: 'GameUserSettings.ini', desc: 'Difficulty, rates, structure limits, PvP/PvE rules' },
                                            { key: 'includeGameIni', label: 'Game.ini', desc: 'Breeding speeds, engram unlocks, stat multipliers, dino curves' },
                                            { key: 'includeMods', label: 'Installed Modpack List', desc: 'All active CurseForge / Workshop mod IDs & load order' },
                                            { key: 'includeLaunchArgs', label: 'Launch Flags & Custom Arguments', desc: 'Extra command-line flags and parameters' },
                                            { key: 'includeServerSettings', label: 'Server Settings', desc: 'Max player count, crossplay, and BattlEye status' },
                                            { key: 'includePasswords', label: 'Include Passwords (Private)', desc: 'Admin and server passwords (OFF by default for sharing)' },
                                        ].map(item => (
                                            <label
                                                key={item.key}
                                                className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600 transition-all cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={(exportOptions as any)[item.key]}
                                                    onChange={e => setExportOptions({ ...exportOptions, [item.key]: e.target.checked })}
                                                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                                                />
                                                <div className="text-left">
                                                    <span className="text-xs font-bold text-white block">
                                                        {item.label}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 block leading-tight">
                                                        {item.desc}
                                                    </span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {exportOptions.includePasswords && (
                                    <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-400 text-xs">
                                        <ShieldAlert className="w-4 h-4 shrink-0" />
                                        <span>
                                            Warning: "Include Passwords" is enabled. Do not share this file publicly if it contains sensitive administrative credentials.
                                        </span>
                                    </div>
                                )}

                                {/* Export Action Buttons */}
                                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800">
                                    <button
                                        onClick={handleDownloadPreset}
                                        disabled={isExporting}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span>Download .arkpreset File</span>
                                    </button>

                                    <button
                                        onClick={handleSaveToLibraryOnly}
                                        disabled={isExporting}
                                        className="flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 font-bold text-xs rounded-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                    >
                                        <FolderCheck className="w-4 h-4" />
                                        <span>Save to Library</span>
                                    </button>

                                    <button
                                        onClick={handleCopyPresetJson}
                                        disabled={isExporting}
                                        className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                    >
                                        <Copy className="w-4 h-4" />
                                        <span>Copy JSON</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* =======================================================
                            TAB 3: IMPORT & APPLY PRESET
                            ======================================================= */}
                        {activeTab === 'import' && (
                            <div className="space-y-5">
                                {/* File Loading Area */}
                                {!importedPreset ? (
                                    <div className="space-y-4">
                                        <div
                                            onClick={handleLoadFile}
                                            className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 bg-slate-800/30 hover:bg-slate-800/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                                        >
                                            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 group-hover:scale-110 transition-transform mb-3">
                                                <Upload className="w-6 h-6" />
                                            </div>
                                            <span className="text-sm font-bold text-white mb-1">
                                                Click to Browse or Select .arkpreset / .json File
                                            </span>
                                            <span className="text-xs text-slate-400 max-w-sm">
                                                Opens native file selector to load your exported server preset or community template.
                                            </span>
                                        </div>

                                        <div className="text-center">
                                            <button
                                                onClick={() => setShowJsonInput(!showJsonInput)}
                                                className="text-xs text-sky-400 hover:text-sky-300 font-semibold hover:underline cursor-pointer"
                                            >
                                                {showJsonInput ? 'Hide Raw JSON Paste' : 'Or paste preset JSON directly →'}
                                            </button>
                                        </div>

                                        {showJsonInput && (
                                            <div className="space-y-2">
                                                <textarea
                                                    rows={5}
                                                    value={rawJsonInput}
                                                    onChange={e => setRawJsonInput(e.target.value)}
                                                    placeholder="Paste preset JSON code here..."
                                                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 focus:outline-none focus:border-sky-500 resize-none"
                                                />
                                                <button
                                                    onClick={handleParseRawJson}
                                                    className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                                                >
                                                    Parse & Load JSON
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Preset Loaded Preview Screen */
                                    <div className="space-y-5">
                                        <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-base font-bold text-white">
                                                            {importedPreset.name}
                                                        </h3>
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                            importedPreset.serverType === 'ASA'
                                                                ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                                                                : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                                                        )}>
                                                            {importedPreset.serverType}
                                                        </span>
                                                        {importedPreset.targetMap && (
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                                                                {importedPreset.targetMap}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                                        {importedPreset.description || 'No description provided.'}
                                                    </p>
                                                    <span className="text-[11px] text-slate-500 block mt-1">
                                                        Created by {importedPreset.author}
                                                    </span>
                                                </div>

                                                <button
                                                    onClick={() => setImportedPreset(null)}
                                                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl transition-all cursor-pointer"
                                                >
                                                    Change File
                                                </button>
                                            </div>

                                            {/* Rates Highlights */}
                                            {importedPreset.ratesSummary && (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-700/50">
                                                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                                                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">XP Rate</span>
                                                        <span className="text-sm font-bold text-emerald-400">{importedPreset.ratesSummary.xpMultiplier}x</span>
                                                    </div>
                                                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                                                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Taming</span>
                                                        <span className="text-sm font-bold text-sky-400">{importedPreset.ratesSummary.tamingSpeedMultiplier}x</span>
                                                    </div>
                                                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                                                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Harvest</span>
                                                        <span className="text-sm font-bold text-amber-400">{importedPreset.ratesSummary.harvestAmountMultiplier}x</span>
                                                    </div>
                                                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                                                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Breeding</span>
                                                        <span className="text-sm font-bold text-purple-400">{importedPreset.ratesSummary.babyMatureSpeedMultiplier}x</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Mod & Config Indicator */}
                                            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700/50">
                                                <span>Included Mods: <strong className="text-white">{importedPreset.mods.length}</strong></span>
                                                <span>Configs: {importedPreset.configs.gameUserSettings ? 'GameUserSettings ✓' : ''} {importedPreset.configs.gameIni ? 'Game.ini ✓' : ''}</span>
                                            </div>
                                        </div>

                                        {/* Apply Target Options */}
                                        <div className="space-y-4 bg-slate-800/20 p-4 rounded-2xl border border-slate-700/40">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                                    <ServerIcon className="w-3.5 h-3.5 text-sky-400" />
                                                    Apply to Existing Server:
                                                </label>
                                                <select
                                                    value={importTargetServerId}
                                                    onChange={e => setImportTargetServerId(Number(e.target.value))}
                                                    className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-700 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                                                >
                                                    {servers
                                                        .filter(s => s.serverType === importedPreset.serverType)
                                                        .map(s => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.name} ({s.serverType}) — Map: {s.config?.mapName || 'Default'} [Status: {s.status}]
                                                            </option>
                                                        ))}
                                                </select>
                                            </div>

                                            {/* Options checklist */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                                                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={importOptions.applyConfigs}
                                                        onChange={e => setImportOptions({ ...importOptions, applyConfigs: e.target.checked })}
                                                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                                                    />
                                                    <span>Write INI Configurations</span>
                                                </label>

                                                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={importOptions.applyMods}
                                                        onChange={e => setImportOptions({ ...importOptions, applyMods: e.target.checked })}
                                                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                                                    />
                                                    <span>Queue & Install Missing Mods</span>
                                                </label>

                                                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={importOptions.createBackupFirst}
                                                        onChange={e => setImportOptions({ ...importOptions, createBackupFirst: e.target.checked })}
                                                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                                                    />
                                                    <span className="text-emerald-400 font-medium">Automatic INI Backup (Recommended)</span>
                                                </label>

                                                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={importOptions.applyServerSettings}
                                                        onChange={e => setImportOptions({ ...importOptions, applyServerSettings: e.target.checked })}
                                                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                                                    />
                                                    <span>Apply Rules & Max Players</span>
                                                </label>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-slate-700/50">
                                                <button
                                                    onClick={() => handleApplyPreset(importedPreset)}
                                                    disabled={isApplying || servers.length === 0}
                                                    className="w-full sm:flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    <span>{isApplying ? 'Applying Configuration...' : 'Apply Template to Selected Server'}</span>
                                                </button>

                                                {onCreateServerFromPreset && (
                                                    <button
                                                        onClick={() => {
                                                            onCreateServerFromPreset(importedPreset);
                                                            onClose();
                                                        }}
                                                        className="w-full sm:w-auto py-3 px-4 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 font-bold text-xs rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                                                    >
                                                        <ArrowRight className="w-4 h-4" />
                                                        <span>Create New Server from Template</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
};

export default ServerPresetModal;
