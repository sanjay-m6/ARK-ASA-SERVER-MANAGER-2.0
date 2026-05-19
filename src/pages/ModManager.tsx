import React, { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Download, Check, X, Loader2, Package, ExternalLink, Save, BookOpen, AlertTriangle, FileText, Terminal, Copy, Info, ListChecks, Square, CheckSquare, ArrowUp, ArrowDown, Trash2, Power, ChevronDown, ChevronUp, Code, Shield, Upload, PackagePlus, ScanSearch, ShieldCheck } from 'lucide-react';
import { cn } from '../utils/helpers';
import { searchMods, installMod, generateModConfig, applyModsToServer, getModInstallInstructions, getInstalledMods, updateModOrder, uninstallMod, toggleMod, getModDescription, copyModsToServer, type ModConfigPreview, getModCategories, type CurseForgeCategory, checkModConflicts, exportModpack, importModpack, type ModConflict, type ModpackImportResult } from '../utils/tauri';
import { ModInfo } from '../types';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';
import { AdvancedModInput } from '../components/mods/AdvancedModInput';
import { ModWatchdogDashboard } from '../components/mods/ModWatchdogDashboard';
import ServerSelect from '../components/ui/ServerSelect';

interface ServerBasic {
    id: number;
    name: string;
}

// Custom Hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

const ModCard = memo(({
    mod,
    isSelected,
    onToggleSelect,
    onSelectDetail,
    onInstall
}: {
    mod: ModInfo,
    isSelected: boolean,
    onToggleSelect: (id: string) => void,
    onSelectDetail: (mod: ModInfo) => void,
    onInstall: (mod: ModInfo) => void
}) => {
    const { t } = useTranslation();
    return (
        <div onClick={() => onSelectDetail(mod)} className={cn("glass-panel rounded-2xl overflow-hidden group hover:border-sky-500/50 transition-all flex flex-col cursor-pointer relative", isSelected ? "border-sky-500/80 ring-2 ring-sky-500/20 bg-sky-900/10" : "")}>
            <div className="relative h-48 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10"></div>
                <img src={mod.thumbnailUrl || 'https://steamuserimages-a.akamaihd.net/ugc/267224193367683679/61585257560F4500732813583643376510100000/'} alt={mod.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleSelect(mod.id); }} className="absolute top-3 left-3 z-30 p-2 rounded-lg bg-black/40 hover:bg-black/60 transition-colors cursor-pointer group/check">
                    {isSelected ? <CheckSquare className="w-6 h-6 text-sky-400" /> : <Square className="w-6 h-6 text-white/50 group-hover/check:text-white" />}
                </div>
                <div className="absolute bottom-4 left-4 z-20"><h3 className="text-lg font-bold text-white leading-tight drop-shadow-md">{mod.name}</h3><p className="text-xs text-slate-300 mt-1 font-medium drop-shadow-sm">by {mod.author}</p></div>
            </div>
            <div className="p-6 flex-1 flex flex-col pointer-events-none">
                <div dangerouslySetInnerHTML={{ __html: mod.description || t('common.noDescription') }} className="text-slate-400 text-sm line-clamp-3 mb-4 flex-1 pointer-events-none opacity-80" />
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-700/50 pointer-events-auto">
                    <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onInstall(mod); }}
                        disabled={mod.id === '0'}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all text-sm font-medium z-30 ${mod.id === '0'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30 cursor-not-allowed'
                            : 'bg-sky-600/20 hover:bg-sky-500 hover:text-white text-sky-400 border border-sky-500/30'
                            }`}
                    >
                        {mod.id === '0' ? <AlertTriangle className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                        <span>{mod.id === '0' ? t('modManager.checkVersion') : t('common.install')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
});

export default function ModManager() {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 500);
    const [activeTab, setActiveTab] = useState<'available' | 'installed' | 'watchdog'>('available');

    // Filters
    const [categories, setCategories] = useState<CurseForgeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
    const [sortField, setSortField] = useState<number>(2); // Default Popularity
    const [sortOrder, setSortOrder] = useState<string>('desc');

    // Available Mods State
    const [availableMods, setAvailableMods] = useState<ModInfo[]>([]);

    // Installed Mods State
    const [installedMods, setInstalledMods] = useState<ModInfo[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [servers, setServers] = useState<ServerBasic[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);

    // Multi-select & Batch Install
    const [selectedModIds, setSelectedModIds] = useState<Set<string>>(new Set());
    const [isBatchInstalling, setIsBatchInstalling] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentModName: '' });

    // Mod Details Modal
    const [selectedModDetail, setSelectedModDetail] = useState<ModInfo | null>(null);
    const [fullDescription, setFullDescription] = useState<string>('');
    const [isLoadingDescription, setIsLoadingDescription] = useState(false);

    // Fetch description when modal opens
    useEffect(() => {
        if (selectedModDetail) {
            setFullDescription(''); // Reset
            setIsLoadingDescription(true);

            // Use summary as placeholder
            if (selectedModDetail.description) {
                setFullDescription(selectedModDetail.description);
            }

            const fetchDesc = async () => {
                try {
                    const desc = await getModDescription(selectedModDetail.id);
                    setFullDescription(desc);
                } catch (error) {
                    console.error('Failed to load description:', error);
                } finally {
                    setIsLoadingDescription(false);
                }
            };
            fetchDesc();
        }
    }, [selectedModDetail]);

    // Config Preview State
    const [showPreview, setShowPreview] = useState(false);
    const [configPreview, setConfigPreview] = useState<ModConfigPreview | null>(null);
    const [instructions, setInstructions] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // Mod Transfer State
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
    const [isTransferring, setIsTransferring] = useState(false);

    // Advanced Mode State
    const [showAdvancedMode, setShowAdvancedMode] = useState(false);
    const [isBulkImporting, setIsBulkImporting] = useState(false);

    // Mod Conflict Scanner State
    const [conflicts, setConflicts] = useState<ModConflict[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [showConflicts, setShowConflicts] = useState(false);

    // Modpack State
    const [showModpackExport, setShowModpackExport] = useState(false);
    const [modpackName, setModpackName] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [showModpackImport, setShowModpackImport] = useState(false);
    const [modpackJson, setModpackJson] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    // Load available categories
    useEffect(() => {
        getModCategories().then(setCategories).catch(err => console.error("Failed to load categories", err));
    }, []);

    // Load servers on mount and auto-select first one
    useEffect(() => {
        const loadServers = async () => {
            try {
                const result = await invoke<ServerBasic[]>('get_all_servers');
                setServers(result);
                if (result.length > 0 && !selectedServerId) {
                    setSelectedServerId(result[0].id);
                }
            } catch (error) {
                console.error('Failed to load servers:', error);
            }
        };
        loadServers();
    }, []);

    // Fetch Installed Mods
    const fetchInstalled = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            const result = await getInstalledMods(selectedServerId);
            setInstalledMods(result);
        } catch (error) {
            console.error('Failed to load installed mods:', error);
            toast.error(t('modManager.loadInstalledFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-load mods based on tab
    useEffect(() => {
        if (!selectedServerId) return;

        if (activeTab === 'installed') {
            fetchInstalled();
        } else {
            // Fetch Available Mods
            const fetchAvailable = async () => {
                const searchTerm = debouncedSearchQuery.trim() || '';
                // Only default to 'dino' if no filters are active? 
                // Actually user might want popular mods. If filters are active, empty search is fine.
                // If filters are inactive AND empty search, fallback to popular.
                const query = (searchTerm === '' && !selectedCategory) ? 'dino' : searchTerm;

                console.log(`🔍 Searching for "${query}"...`);
                setIsLoading(true);
                try {
                    const results = await searchMods(query, 'ASA', selectedCategory, sortField, sortOrder);
                    if (results.length === 1 && results[0].id === '0') {
                        toast.error(t('modManager.apiKeyRequired'));
                        t('common.noResults');
                        // Show the error card instead of empty list
                        setAvailableMods(results);
                    } else {
                        setAvailableMods(results);
                    }
                } catch (error) {
                    console.error('❌ Failed to search mods:', error);
                    toast.error(t('modManager.searchFailed', { error }));
                    setAvailableMods([]);
                } finally {
                    setIsLoading(false);
                }
            };

            fetchAvailable();
        }
    }, [debouncedSearchQuery, activeTab, selectedServerId, selectedCategory, sortField, sortOrder]);

    const handleToggleSelect = (modId: string) => {
        const newSelected = new Set(selectedModIds);
        if (newSelected.has(modId)) {
            newSelected.delete(modId);
        } else {
            newSelected.add(modId);
        }
        setSelectedModIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedModIds.size === availableMods.length) {
            setSelectedModIds(new Set());
        } else {
            setSelectedModIds(new Set(availableMods.map((m: ModInfo) => m.id)));
        }
    };

    const handleInstallMod = async (mod: ModInfo) => {
        if (!selectedServerId) {
            toast.error(t('modManager.selectServerFirst'));
            return;
        }

        try {
            toast.loading(t('modManager.installing', { name: mod.name }), { id: `install-${mod.id}` });
            await installMod(selectedServerId, mod);
            toast.success(t('modManager.installedSuccess', { name: mod.name }), { id: `install-${mod.id}` });
            // If checking installed tab, refresh
            if (activeTab === 'installed') fetchInstalled();
        } catch (error) {
            toast.error(t('modManager.installError', { error }), { id: `install-${mod.id}` });
        }
    };

    const handleBatchInstall = async () => {
        if (!selectedServerId || selectedModIds.size === 0) return;

        setIsBatchInstalling(true);
        const modsToInstall = availableMods.filter(m => selectedModIds.has(m.id));
        setBatchProgress({ current: 0, total: modsToInstall.length, currentModName: '' });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < modsToInstall.length; i++) {
            const mod = modsToInstall[i];
            setBatchProgress({ current: i + 1, total: modsToInstall.length, currentModName: mod.name });
            try {
                await installMod(selectedServerId, mod);
                successCount++;
            } catch (error) {
                console.error(`Failed to install ${mod.name}:`, error);
                failCount++;
            }
        }

        setIsBatchInstalling(false);
        setBatchProgress({ current: 0, total: 0, currentModName: '' });
        setSelectedModIds(new Set());
        toast.success(t('modManager.batchInstallComplete', { count: successCount }));
    };

    const handlePreviewConfig = async () => {
        if (!selectedServerId) return;
        setIsGenerating(true);
        try {
            const preview = await generateModConfig(selectedServerId);
            const inst = await getModInstallInstructions();
            setConfigPreview(preview);
            setInstructions(inst);
            setShowPreview(true);
        } catch (error) {
            toast.error(t('modManager.configGenFailed', { error }));
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApplyConfig = async () => {
        if (!selectedServerId) return;
        try {
            await applyModsToServer(selectedServerId);
            toast.success(t('modManager.modInstalled')); // Or generic success/apply message
            const preview = await generateModConfig(selectedServerId);
            setConfigPreview(preview);
        } catch (error) {
            toast.error(t('modManager.applyFailed', { error }));
        }
    };

    // Installed Mod Actions
    const handleMoveMod = async (index: number, direction: 'up' | 'down') => {
        if (!selectedServerId) return;

        const newMods = [...installedMods];
        if (direction === 'up' && index > 0) {
            [newMods[index], newMods[index - 1]] = [newMods[index - 1], newMods[index]];
        } else if (direction === 'down' && index < newMods.length - 1) {
            [newMods[index], newMods[index + 1]] = [newMods[index + 1], newMods[index]];
        } else {
            return;
        }

        // Optimistic update
        setInstalledMods(newMods);

        try {
            // Update backend
            const modIds = newMods.map(m => m.id);
            await updateModOrder(selectedServerId, modIds);
            toast.success(t('modManager.modUpdated')); // Or generic update success
        } catch (error) {
            toast.error(t('modManager.updateFailed')); // Generic update fail
            fetchInstalled(); // Revert on error
        }
    };

    const handleToggleMod = async (mod: ModInfo) => {
        if (!selectedServerId) return;
        try {
            const newEnabledState = !mod.enabled;
            await toggleMod(selectedServerId, mod.id, newEnabledState);

            // Optimistic update locally before refetch
            setInstalledMods(prev => prev.map(m =>
                m.id === mod.id ? { ...m, enabled: newEnabledState } : m
            ));

            fetchInstalled(); // Refresh to be sure
            toast.success(t('modManager.modUpdated')); // Generic toggle success
        } catch (error) {
            toast.error(t('modManager.updateFailed'));
        }
    };

    const handleUninstallMod = async (mod: ModInfo) => {
        if (!selectedServerId || !confirm(t('confirmDialog.areYouSure'))) return;

        try {
            await uninstallMod(selectedServerId, mod.id);
            toast.success(t('modManager.modUninstalled'));
            fetchInstalled();
        } catch (error) {
            toast.error(t('modManager.uninstallFailed', { error }));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('common.clipboard'));
    };

    const handleTransferMods = async () => {
        if (!selectedServerId || !transferTargetId) return;

        if (selectedServerId === transferTargetId) {
            toast.error(t('modManager.sameServerTransfer'));
            return;
        }

        setIsTransferring(true);
        try {
            await copyModsToServer(selectedServerId, transferTargetId);
            toast.success(t('modManager.transferSuccess'));
            setShowTransferDialog(false);
            setTransferTargetId(null);
        } catch (error) {
            console.error('Transfer failed:', error);
            toast.error(t('modManager.transferError', { error }));
        } finally {
            setIsTransferring(false);
        }
    };

    // === MOD CONFLICT SCANNER ===
    const handleScanConflicts = async () => {
        if (!selectedServerId) return;
        setIsScanning(true);
        try {
            const result = await checkModConflicts(selectedServerId);
            setConflicts(result);
            setShowConflicts(true);
            if (result.length === 0) {
                toast.success(t('modManager.noConflicts', 'No conflicts detected!'));
            } else {
                toast.error(t('modManager.conflictsFound', `${result.length} conflict(s) found!`));
            }
        } catch (error) {
            toast.error(`Conflict scan failed: ${error}`);
        } finally {
            setIsScanning(false);
        }
    };

    // === MODPACK EXPORT ===
    const handleExportModpack = async () => {
        if (!selectedServerId || !modpackName.trim()) return;
        setIsExporting(true);
        try {
            const json = await exportModpack(selectedServerId, modpackName.trim());
            await navigator.clipboard.writeText(json);
            toast.success(t('modManager.modpackExported', 'Modpack copied to clipboard!'));
            setShowModpackExport(false);
            setModpackName('');
        } catch (error) {
            toast.error(`Export failed: ${error}`);
        } finally {
            setIsExporting(false);
        }
    };

    // === MODPACK IMPORT ===
    const handleImportModpack = async () => {
        if (!selectedServerId || !modpackJson.trim()) return;
        setIsImporting(true);
        try {
            const result: ModpackImportResult = await importModpack(selectedServerId, modpackJson.trim());
            toast.success(
                `Modpack "${result.modpack_name}" imported! ${result.installed_count} installed, ${result.skipped_count} skipped.`
            );
            setShowModpackImport(false);
            setModpackJson('');
            if (activeTab === 'installed') fetchInstalled();
        } catch (error) {
            toast.error(`Import failed: ${error}`);
        } finally {
            setIsImporting(false);
        }
    };

    // Bulk import handler for Advanced Mode
    const handleBulkImportMods = async (modIds: string[]) => {
        if (!selectedServerId || modIds.length === 0) {
            toast.error(t('modManager.selectServerFirst'));
            return;
        }

        setIsBulkImporting(true);
        setBatchProgress({ current: 0, total: modIds.length, currentModName: '' });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];
            setBatchProgress({ current: i + 1, total: modIds.length, currentModName: `Mod ${modId}` });

            try {
                // Create a minimal ModInfo object for the bulk import
                const mod: ModInfo = {
                    id: modId,
                    name: `Mod ${modId}`,
                    author: 'Unknown',
                    description: '',
                    thumbnailUrl: '',
                    compatible: true,
                    enabled: true
                };
                await installMod(selectedServerId, mod);
                successCount++;
            } catch (error) {
                console.error(`Failed to install mod ${modId}:`, error);
                failCount++;
            }
        }

        setIsBulkImporting(false);
        setBatchProgress({ current: 0, total: 0, currentModName: '' });

        if (failCount > 0) {
            toast.success(t('modManager.batchInstallCompleteWithFailures', { success: successCount, failed: failCount }));
        } else {
            toast.success(t('modManager.batchInstallComplete', { count: successCount }));
        }

        // Refresh installed mods if on that tab
        if (activeTab === 'installed') {
            fetchInstalled();
        }
    };


    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
                        {t('modManager.title')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('modManager.subtitle')}</p>
                </div>

                {/* Server Selector & Actions */}
                <div className="flex items-center space-x-4">
                    <ServerSelect 
                        value={selectedServerId} 
                        onChange={setSelectedServerId} 
                        accentColor="sky" 
                    />

                    {/* Modpack Export */}
                    <button
                        onClick={() => setShowModpackExport(true)}
                        disabled={!selectedServerId}
                        className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        title={t('modManager.exportModpack', 'Export Modpack')}
                    >
                        <Upload className="w-5 h-5" />
                    </button>

                    {/* Modpack Import */}
                    <button
                        onClick={() => setShowModpackImport(true)}
                        disabled={!selectedServerId}
                        className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        title={t('modManager.importModpack', 'Import Modpack')}
                    >
                        <PackagePlus className="w-5 h-5" />
                    </button>

                    {/* Conflict Scanner */}
                    <button
                        onClick={handleScanConflicts}
                        disabled={!selectedServerId || isScanning}
                        className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        title={t('modManager.scanConflicts', 'Scan for Conflicts')}
                    >
                        {isScanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanSearch className="w-5 h-5" />}
                    </button>

                    <button
                        onClick={() => setShowTransferDialog(true)}
                        disabled={!selectedServerId}
                        className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        title={t('modManager.transferModsTooltip')}
                    >
                        <ArrowUp className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handlePreviewConfig}
                        disabled={!selectedServerId || isGenerating}
                        className="flex items-center space-x-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                    >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <span className="font-bold">{t('modManager.applyChanges')}</span>
                    </button>
                </div>
            </div>

            {/* Batch Install Floating & Progress */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-4 w-full max-w-xl pointer-events-none">
                {/* Progress Bar */}
                {isBatchInstalling && (
                    <div className="w-full bg-slate-900/90 border border-sky-500/30 rounded-2xl p-4 shadow-2xl shadow-sky-900/20 animate-in slide-in-from-bottom-5 pointer-events-auto">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-sky-400 font-medium animate-pulse">{t('modManager.installing', { name: batchProgress.currentModName })}</span>
                            <span className="text-slate-400">{batchProgress.current} / {batchProgress.total}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-300 ease-out" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                        </div>
                    </div>
                )}

                {/* Batch Action Bar */}
                {selectedModIds.size > 0 && !isBatchInstalling && activeTab === 'available' && (
                    <div className="bg-slate-900/90 border border-slate-700 rounded-full px-6 py-3 shadow-2xl shadow-sky-900/20 flex items-center gap-6 animate-in slide-in-from-bottom-5 pointer-events-auto">
                        <span className="text-white font-medium pl-2">{t('modManager.batchInstallComplete', { count: selectedModIds.size })}</span>
                        <div className="h-6 w-px bg-slate-700" />
                        <button onClick={() => setSelectedModIds(new Set())} className="text-slate-400 hover:text-white transition-colors text-sm">{t('modManager.clearSelection')}</button>
                        <button onClick={handleBatchInstall} disabled={!selectedServerId} className="flex items-center space-x-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-full font-bold transition-all shadow-lg shadow-sky-500/20">
                            <Download className="w-4 h-4" /> <span>{t('modManager.installSelected')}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Mod Transfer Dialog */}
            {
                showTransferDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-sky-900/20">
                            <div className="p-6 border-b border-slate-800">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <ArrowUp className="w-5 h-5 text-sky-400" /> {t('modManager.transferMods')}
                                </h2>
                                <p className="text-slate-400 text-sm mt-1">{t('modManager.transferModsTooltip')}</p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">{t('modManager.selectServer')}</label>
                                    <ServerSelect 
                                        value={transferTargetId} 
                                        onChange={(id) => setTransferTargetId(id)} 
                                        servers={servers.filter(s => s.id !== selectedServerId)}
                                        accentColor="sky" 
                                        className="w-full"
                                    />
                                </div>

                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                                    <p className="text-yellow-200/80 text-sm flex items-start gap-2">
                                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                        <span>{t('modManager.transferModsInfo')}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3">
                                <button
                                    onClick={() => setShowTransferDialog(false)}
                                    className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={handleTransferMods}
                                    disabled={!transferTargetId || isTransferring}
                                    className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isTransferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                                    <span>{t('modManager.transferMods')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Config Preview Modal - No Changes Here */}
            {
                showPreview && configPreview && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-sky-900/20">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                                <div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><BookOpen className="text-sky-400" /> {t('modManager.configTitle')}</h2><p className="text-slate-400 text-sm mt-1">{t('modManager.configSubtitle')}</p></div>
                                <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
                            </div>
                            {/* Content */}
                            <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
                                {configPreview.validation_errors.length > 0 && (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                        <h3 className="text-red-400 font-bold flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5" /> {t('modManager.validationIssues')}</h3>
                                        <ul className="list-disc list-inside text-red-300/80 text-sm">{configPreview.validation_errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between"><h3 className="text-white font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-sky-400" /> {t('modManager.gusIni')}</h3><span className="text-xs text-slate-500 uppercase tracking-wider">{t('common.autoGenerated')}</span></div>
                                    <div className="relative group"><pre className="bg-slate-950 rounded-xl p-4 text-sm text-green-300 font-mono overflow-x-auto border border-slate-800">{configPreview.ini_section}</pre></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between"><h3 className="text-white font-medium flex items-center gap-2"><Terminal className="w-4 h-4 text-violet-400" /> {t('modManager.startupCommand')}</h3></div>
                                    <div className="relative group"><pre className="bg-slate-950 rounded-xl p-4 text-sm text-violet-300 font-mono overflow-x-auto border border-slate-800 whitespace-pre-wrap break-all">{configPreview.startup_command}</pre><button onClick={() => copyToClipboard(configPreview.startup_command)} className="absolute top-2 right-2 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Copy className="w-4 h-4" /></button></div>
                                </div>

                                {/* Instructions */}
                                <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                                    <h3 className="text-white font-bold mb-4">{t('modManager.installInstructions')}</h3>
                                    <div className="space-y-3">
                                        {instructions.map((line, i) => (
                                            <p key={i} className={`text-sm ${line.startsWith('⚠️') ? 'text-amber-400 font-medium mt-4' :
                                                line.startsWith('•') ? 'text-slate-400 ml-4' :
                                                    'text-slate-300'
                                                }`}>
                                                {line}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {/* Footer */}
                            <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3"><button onClick={() => setShowPreview(false)} className="px-6 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">{t('common.close')}</button><button onClick={() => { handleApplyConfig(); setShowPreview(false); }} className="px-8 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all flex items-center gap-2"><Save className="w-4 h-4" /> {t('modManager.applyChanges')}</button></div>
                        </div>
                    </div>
                )
            }

            {/* Conflict Scanner Results Banner */}
            {showConflicts && conflicts.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 animate-in slide-in-from-top-3 duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-red-400 font-bold flex items-center gap-2 text-lg">
                            <Shield className="w-5 h-5" />
                            {t('modManager.conflictsDetected', `${conflicts.length} Mod Conflict(s) Detected`)}
                        </h3>
                        <button onClick={() => setShowConflicts(false)} className="p-1 hover:bg-red-500/20 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-red-400" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        {conflicts.map((conflict, i) => (
                            <div key={i} className={cn(
                                "p-4 rounded-xl border flex items-start gap-4",
                                conflict.severity === 'critical' ? 'bg-red-900/20 border-red-500/30' :
                                conflict.severity === 'warning' ? 'bg-amber-900/20 border-amber-500/30' :
                                'bg-blue-900/20 border-blue-500/30'
                            )}>
                                <AlertTriangle className={cn(
                                    "w-5 h-5 mt-0.5 shrink-0",
                                    conflict.severity === 'critical' ? 'text-red-400' :
                                    conflict.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                                )} />
                                <div className="flex-1">
                                    <p className="text-white font-medium">
                                        <span className="text-sky-400">{conflict.mod_a_name}</span>
                                        <span className="text-slate-500 mx-2">×</span>
                                        <span className="text-sky-400">{conflict.mod_b_name}</span>
                                    </p>
                                    <p className="text-slate-400 text-sm mt-1">{conflict.reason}</p>
                                    <span className={cn(
                                        "inline-block mt-2 px-2 py-0.5 text-xs font-bold uppercase rounded",
                                        conflict.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                                        conflict.severity === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                                        'bg-blue-500/20 text-blue-300'
                                    )}>{conflict.severity}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modpack Export Modal */}
            {showModpackExport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-sky-900/20">
                        <div className="p-6 border-b border-slate-800">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Upload className="w-5 h-5 text-sky-400" />
                                {t('modManager.exportModpack', 'Export Modpack')}
                            </h2>
                            <p className="text-slate-400 text-sm mt-1">{t('modManager.exportDesc', 'Generate a shareable JSON of your installed mods')}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">{t('modManager.modpackName', 'Modpack Name')}</label>
                                <input
                                    type="text"
                                    value={modpackName}
                                    onChange={(e) => setModpackName(e.target.value)}
                                    placeholder="My ARK Modpack"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowModpackExport(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">{t('common.cancel')}</button>
                            <button
                                onClick={handleExportModpack}
                                disabled={!modpackName.trim() || isExporting}
                                className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                                <span>{t('modManager.exportToClipboard', 'Copy to Clipboard')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modpack Import Modal */}
            {showModpackImport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-sky-900/20">
                        <div className="p-6 border-b border-slate-800">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <PackagePlus className="w-5 h-5 text-green-400" />
                                {t('modManager.importModpack', 'Import Modpack')}
                            </h2>
                            <p className="text-slate-400 text-sm mt-1">{t('modManager.importDesc', 'Paste a modpack JSON to install mods')}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">{t('modManager.modpackJson', 'Modpack JSON')}</label>
                                <textarea
                                    value={modpackJson}
                                    onChange={(e) => setModpackJson(e.target.value)}
                                    placeholder='{"name": "...", "mods": [...]}'
                                    rows={8}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                                />
                            </div>
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                                <p className="text-amber-200/80 text-sm flex items-start gap-2">
                                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{t('modManager.importWarning', 'Existing mods with the same ID will be skipped. Server restart is required.')}</span>
                                </p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowModpackImport(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">{t('common.cancel')}</button>
                            <button
                                onClick={handleImportModpack}
                                disabled={!modpackJson.trim() || isImporting}
                                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg shadow-green-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                <span>{t('modManager.importMods', 'Import Mods')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mod Details Modal */}
            {
                selectedModDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 animate-in fade-in duration-200" onClick={() => setSelectedModDetail(null)}>
                        <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col shadow-2xl shadow-sky-900/20" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <div className="relative h-64 md:h-80 shrink-0"><div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent z-10" /><img src={selectedModDetail.thumbnailUrl || 'https://steamuserimages-a.akamaihd.net/ugc/267224193367683679/61585257560F4500732813583643376510100000/'} alt={selectedModDetail.name} className="w-full h-full object-cover" /><button onClick={() => setSelectedModDetail(null)} className="absolute top-4 right-4 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"><X className="w-6 h-6" /></button><div className="absolute bottom-6 left-8 z-20"><h2 className="text-4xl font-bold text-white shadow-black drop-shadow-lg">{selectedModDetail.name}</h2><p className="text-slate-300 text-lg mt-2 font-medium drop-shadow-md">by {selectedModDetail.author}</p></div></div>
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-1 space-y-6">
                                        <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50">
                                            <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Info className="w-4 h-4 text-sky-400" /> {t('modManager.modInfo')}</h3>
                                            <div className="space-y-4 text-sm">
                                                <div className="flex justify-between border-b border-slate-700/50 pb-2"><span className="text-slate-400">{t('common.modId')}</span><span className="text-white font-mono">{selectedModDetail.id}</span></div>
                                                <div className="flex justify-between pt-1"><span className="text-slate-400">{t('common.status')}</span>{selectedModDetail.compatible ? <span className="text-green-400 flex items-center"><Check className="w-3 h-3 mr-1" /> {t('modManager.compatible')}</span> : <span className="text-red-400 flex items-center"><X className="w-3 h-3 mr-1" /> {t('modManager.checkVersion')}</span>}</div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3">
                                            <a href={selectedModDetail.curseforge_url || selectedModDetail.workshopUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-center font-bold transition-all border border-slate-700 flex items-center justify-center gap-2">
                                                <ExternalLink className="w-4 h-4" /> {t('modManager.viewOnCurseForge')}
                                            </a>
                                            <button
                                                onClick={() => { handleInstallMod(selectedModDetail); setSelectedModDetail(null); }}
                                                className="flex-1 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-center font-bold transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
                                            >
                                                <Download className="w-4 h-4" /> {t('common.install')}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="lg:col-span-2">
                                        <h3 className="text-2xl font-bold text-white mb-6">{t('common.description')}</h3>
                                        <div className="prose prose-invert prose-slate max-w-none text-slate-300">
                                            {isLoadingDescription && !fullDescription ? (
                                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                                    <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                                                    <p className="text-slate-400">{t('common.loading')}</p>
                                                </div>
                                            ) : (
                                                <div dangerouslySetInnerHTML={{ __html: fullDescription || selectedModDetail.description || t('common.noDescription') }} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Filters Section (Available Mods Only) */}
            {activeTab === 'available' && (
                <div className="mb-6 flex flex-wrap items-center gap-4 bg-[#0A0F1C]/40 p-4 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                        <ListChecks className="w-4 h-4 text-sky-400" />
                        <span className="font-semibold">{t('modManager.filters')}:</span>
                    </div>

                    {/* Category Select */}
                    <div className="relative">
                        <select
                            value={selectedCategory || ''}
                            onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : undefined)}
                            className="appearance-none bg-[#0A0F1C]/60 border border-white/10 text-slate-200 text-sm rounded-xl focus:outline-none focus:border-sky-500/50 backdrop-blur-xl transition-all shadow-lg px-4 py-2.5 pr-10 min-w-[180px] cursor-pointer hover:border-white/20"
                        >
                            <option value="" className="bg-[#0A0F1C] text-slate-200">{t('modManager.allCategories')}</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id} className="bg-[#0A0F1C] text-slate-200">
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>

                    {/* Sort Select */}
                    <div className="relative">
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(Number(e.target.value))}
                            className="appearance-none bg-[#0A0F1C]/60 border border-white/10 text-slate-200 text-sm rounded-xl focus:outline-none focus:border-sky-500/50 backdrop-blur-xl transition-all shadow-lg px-4 py-2.5 pr-10 min-w-[160px] cursor-pointer hover:border-white/20"
                        >
                            <option value={1} className="bg-[#0A0F1C] text-slate-200">{t('modManager.sort.featured')}</option>
                            <option value={2} className="bg-[#0A0F1C] text-slate-200">{t('modManager.sort.popularity')}</option>
                            <option value={3} className="bg-[#0A0F1C] text-slate-200">{t('modManager.sort.lastUpdated')}</option>
                            <option value={4} className="bg-[#0A0F1C] text-slate-200">{t('modManager.sort.name')}</option>
                            <option value={6} className="bg-[#0A0F1C] text-slate-200">{t('modManager.sort.totalDownloads')}</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>

                    {/* Sort Order */}
                    <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="p-2.5 bg-[#0A0F1C]/60 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:border-sky-500/40 backdrop-blur-xl transition-all shadow-lg hover:scale-[1.03] active:scale-[0.97]"
                        title={sortOrder === 'asc' ? t('common.ascending') : t('common.descending')}
                    >
                        {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 text-sky-400" /> : <ArrowDown className="w-4 h-4 text-sky-400" />}
                    </button>

                    {/* Clear Filters */}
                    {(selectedCategory || sortField !== 2 || sortOrder !== 'desc') && (
                        <button
                            onClick={() => {
                                setSelectedCategory(undefined);
                                setSortField(2);
                                setSortOrder('desc');
                                setSearchQuery('');
                            }}
                            className="ml-auto text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5 font-medium px-3 py-2 bg-sky-500/10 rounded-lg hover:bg-sky-500/20 border border-sky-500/20 transition-all"
                        >
                            <X className="w-3 h-3" /> {t('modManager.clearFilters')}
                        </button>
                    )}
                </div>
            )}

            {/* Advanced Mode - Bulk Mod ID Import */}
            <div className="glass-panel rounded-xl border border-slate-700/50 overflow-hidden">
                <button
                    onClick={() => setShowAdvancedMode(!showAdvancedMode)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-lg">
                            <Code className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <span className="text-white font-medium">{t('modManager.advancedMode')}</span>
                            <p className="text-slate-400 text-sm">{t('modManager.advancedModeSubtitle')}</p>
                        </div>
                    </div>
                    {showAdvancedMode ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                </button>

                {showAdvancedMode && (
                    <div className="p-6 border-t border-slate-700/50 bg-slate-900/50">
                        <AdvancedModInput
                            onImport={handleBulkImportMods}
                            isLoading={isBulkImporting}
                        />
                    </div>
                )}
            </div>


            {/* Search and Tabs */}
            <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                        placeholder={activeTab === 'available' ? t('modManager.searchMods') : t('modManager.searchMods')}
                        className="w-full pl-12 pr-4 py-3 bg-[#0A0F1C]/60 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 transition-all backdrop-blur-xl shadow-lg"
                    />
                </div>

                <div className="flex gap-4 items-center">
                    {activeTab === 'available' && (
                        <button 
                            onClick={handleSelectAll} 
                            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-[#0A0F1C]/40 border border-white/5 hover:border-white/10 hover:bg-white/5 backdrop-blur-xl transition-all shadow-md active:scale-95"
                        >
                            <ListChecks className="w-4 h-4 text-sky-400" /> 
                            <span>{selectedModIds.size === availableMods.length ? t('common.deselectAll') : t('common.selectAll')}</span>
                        </button>
                    )}

                    <div className="flex p-1 bg-[#0A0F1C]/40 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl">
                        <button 
                            onClick={() => setActiveTab('available')} 
                            className={cn(
                                'px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300', 
                                activeTab === 'available' 
                                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20 border border-sky-400/20' 
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            )}
                        >
                            {t('modManager.available')}
                        </button>
                        <button 
                            onClick={() => setActiveTab('installed')} 
                            className={cn(
                                'px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300', 
                                activeTab === 'installed' 
                                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20 border border-sky-400/20' 
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            )}
                        >
                            {t('modManager.installed')}
                        </button>
                        <button 
                            onClick={() => setActiveTab('watchdog')} 
                            className={cn(
                                'px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-1.5', 
                                activeTab === 'watchdog' 
                                    ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/20 border border-rose-400/20' 
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            )}
                        >
                            <ShieldCheck className="w-4 h-4" />
                            {t('modManager.watchdog', 'Watchdog')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {
                activeTab === 'watchdog' ? (
                    <ModWatchdogDashboard serverId={selectedServerId} />
                ) : activeTab === 'available' ? (
                    /* Available Mods Grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isLoading ? (
                            <div className="col-span-full flex justify-center py-20"><Loader2 className="w-10 h-10 text-sky-500 animate-spin" /></div>
                        ) : availableMods.length === 0 ? (
                            <div className="col-span-full text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-slate-300">{t('modManager.noModsFound')}</h3>
                            </div>
                        ) : (
                            availableMods.map((mod) => (
                                <ModCard
                                    key={mod.id}
                                    mod={mod}
                                    isSelected={selectedModIds.has(mod.id)}
                                    onToggleSelect={handleToggleSelect}
                                    onSelectDetail={setSelectedModDetail}
                                    onInstall={handleInstallMod}
                                />
                            ))
                        )}
                    </div>
                ) : (
                    /* Installed Mods List */
                    <div className="space-y-4">
                        {isLoading ? (
                            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-sky-500 animate-spin" /></div>
                        ) : installedMods.length === 0 ? (
                            <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-slate-300">{t('modManager.noModsInstalled')}</h3>
                                <button onClick={() => setActiveTab('available')} className="mt-4 px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors">{t('modManager.browse')}</button>
                            </div>
                        ) : (
                            installedMods
                                .filter(mod => !searchQuery || mod.name.toLowerCase().includes(searchQuery.toLowerCase()) || mod.id.includes(searchQuery))
                                .map((mod) => {
                                    const index = installedMods.findIndex(m => m.id === mod.id);
                                    return (
                                        <div key={mod.id} className="glass-panel p-4 rounded-xl flex items-center gap-6 group hover:border-sky-500/30 transition-all">
                                            {/* Load Order & Move Buttons */}
                                            <div className="flex flex-col items-center gap-1 w-10">
                                                <button
                                                    onClick={() => handleMoveMod(index, 'up')}
                                                    disabled={index === 0 || searchQuery.length > 0}
                                                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                                                    title={searchQuery ? "Clear search to reorder" : "Move Up"}
                                                >
                                                    <ArrowUp className="w-4 h-4" />
                                                </button>
                                                <span className="text-xs font-mono text-slate-500">{index + 1}</span>
                                                <button
                                                    onClick={() => handleMoveMod(index, 'down')}
                                                    disabled={index === installedMods.length - 1 || searchQuery.length > 0}
                                                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                                                    title={searchQuery ? "Clear search to reorder" : "Move Down"}
                                                >
                                                    <ArrowDown className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Mod Info */}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-lg font-bold text-white">{mod.name}</h3>
                                                    <span className="px-2 py-0.5 bg-slate-800 rounded text-xs font-mono text-slate-400 border border-slate-700">ID: {mod.id}</span>
                                                    {!mod.enabled && <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded border border-red-500/20">{t('common.disabled')}</span>}
                                                </div>
                                                <p className="text-slate-500 text-sm mt-1 line-clamp-1">{mod.description?.replace(/<[^>]*>?/gm, '') || t('common.noData')}</p>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => handleToggleMod(mod)}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-colors border",
                                                        mod.enabled
                                                            ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                                                            : "bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-400"
                                                    )}
                                                    title={mod.enabled ? "Disable Mod" : "Enable Mod"}
                                                >
                                                    <Power className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleUninstallMod(mod)}
                                                    className="p-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 hover:text-red-300 transition-colors"
                                                    title="Uninstall Mod"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                )
            }
        </div >
    );
}
