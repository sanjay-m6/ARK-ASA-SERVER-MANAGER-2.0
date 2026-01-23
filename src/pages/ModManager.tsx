import React, { useState, useEffect } from 'react';
import { Search, Download, Check, X, Loader2, Package, ExternalLink, Save, BookOpen, AlertTriangle, FileText, Terminal, Copy, Info, ListChecks, Square, CheckSquare, ArrowUp, ArrowDown, Trash2, Power } from 'lucide-react';
import { cn } from '../utils/helpers';
import { searchMods, installMod, generateModConfig, applyModsToServer, getModInstallInstructions, getInstalledMods, updateModOrder, uninstallMod, toggleMod, getModDescription, copyModsToServer, type ModConfigPreview } from '../utils/tauri';
import { ModInfo } from '../types';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';

interface ServerBasic {
    id: number;
    name: string;
}

export default function ModManager() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'available' | 'installed'>('available');

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
            toast.error('Failed to load installed mods');
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
                const searchTerm = searchQuery.trim() || 'dino';
                console.log(`🔍 Searching for "${searchTerm}"...`);
                setIsLoading(true);
                try {
                    const results = await searchMods(searchTerm, 'ASA');
                    if (results.length === 1 && results[0].id === '0') {
                        toast.error('CurseForge API Key required!');
                        setAvailableMods([]);
                    } else {
                        setAvailableMods(results);
                    }
                } catch (error) {
                    console.error('❌ Failed to search mods:', error);
                    toast.error(`Search failed: ${error}`);
                    setAvailableMods([]);
                } finally {
                    setIsLoading(false);
                }
            };

            const timeoutId = setTimeout(() => {
                fetchAvailable();
            }, searchQuery.length > 0 ? 500 : 0);
            return () => clearTimeout(timeoutId);
        }
    }, [searchQuery, activeTab, selectedServerId]);

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
            toast.error('Please select a server first');
            return;
        }

        try {
            toast.loading(`Installing ${mod.name}...`, { id: `install-${mod.id}` });
            await installMod(selectedServerId, mod);
            toast.success(`${mod.name} installed!`, { id: `install-${mod.id}` });
            // If checking installed tab, refresh
            if (activeTab === 'installed') fetchInstalled();
        } catch (error) {
            toast.error(`Failed to install: ${error}`, { id: `install-${mod.id}` });
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
        toast.success(`Batch install complete: ${successCount} installed.`);
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
            toast.error(`Failed to generate config: ${error}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApplyConfig = async () => {
        if (!selectedServerId) return;
        try {
            await applyModsToServer(selectedServerId);
            toast.success('Mods applied to server configuration!');
            const preview = await generateModConfig(selectedServerId);
            setConfigPreview(preview);
        } catch (error) {
            toast.error(`Failed to apply mods: ${error}`);
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
            toast.success('Load order updated');
        } catch (error) {
            toast.error('Failed to update load order');
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
            toast.success(`Mod ${newEnabledState ? 'enabled' : 'disabled'}`);
        } catch (error) {
            toast.error(`Failed to toggle mod: ${error}`);
        }
    };

    const handleUninstallMod = async (mod: ModInfo) => {
        if (!selectedServerId || !confirm(`Are you sure you want to uninstall ${mod.name}?`)) return;

        try {
            await uninstallMod(selectedServerId, mod.id);
            toast.success('Mod uninstalled');
            fetchInstalled();
        } catch (error) {
            toast.error(`Failed to uninstall: ${error}`);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const handleTransferMods = async () => {
        if (!selectedServerId || !transferTargetId) return;

        if (selectedServerId === transferTargetId) {
            toast.error('Cannot transfer to the same server');
            return;
        }

        setIsTransferring(true);
        try {
            await copyModsToServer(selectedServerId, transferTargetId);
            toast.success('Mods transferred successfully!');
            setShowTransferDialog(false);
            setTransferTargetId(null);
        } catch (error) {
            console.error('Transfer failed:', error);
            toast.error(`Transfer failed: ${error}`);
        } finally {
            setIsTransferring(false);
        }
    };


    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
                        Mod Manager
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Browse and manage ASA Mods from CurseForge</p>
                </div>

                {/* Server Selector & Actions */}
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-3 bg-slate-800/50 p-2 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-sm pl-2">Target Server:</span>
                        <select
                            value={selectedServerId || ''}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedServerId(Number(e.target.value))}
                            className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                            {servers.map(server => (
                                <option key={server.id} value={server.id}>{server.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => setShowTransferDialog(true)}
                        disabled={!selectedServerId}
                        className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        title="Transfer Mods to Another Server"
                    >
                        <ArrowUp className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handlePreviewConfig}
                        disabled={!selectedServerId || isGenerating}
                        className="flex items-center space-x-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                    >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <span className="font-bold">Apply Changes</span>
                    </button>
                </div>
            </div>

            {/* Batch Install Floating & Progress */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-4 w-full max-w-xl pointer-events-none">
                {/* Progress Bar */}
                {isBatchInstalling && (
                    <div className="w-full bg-slate-900/90 backdrop-blur-md border border-sky-500/30 rounded-2xl p-4 shadow-2xl shadow-sky-900/20 animate-in slide-in-from-bottom-5 pointer-events-auto">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-sky-400 font-medium animate-pulse">Installing {batchProgress.currentModName}...</span>
                            <span className="text-slate-400">{batchProgress.current} / {batchProgress.total}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-300 ease-out" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                        </div>
                    </div>
                )}

                {/* Batch Action Bar */}
                {selectedModIds.size > 0 && !isBatchInstalling && activeTab === 'available' && (
                    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-full px-6 py-3 shadow-2xl shadow-sky-900/20 flex items-center gap-6 animate-in slide-in-from-bottom-5 pointer-events-auto">
                        <span className="text-white font-medium pl-2">{selectedModIds.size} mods selected</span>
                        <div className="h-6 w-px bg-slate-700" />
                        <button onClick={() => setSelectedModIds(new Set())} className="text-slate-400 hover:text-white transition-colors text-sm">Clear</button>
                        <button onClick={handleBatchInstall} disabled={!selectedServerId} className="flex items-center space-x-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-full font-bold transition-all shadow-lg shadow-sky-500/20">
                            <Download className="w-4 h-4" /> <span>Install Selected</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Mod Transfer Dialog */}
            {
                showTransferDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-sky-900/20">
                            <div className="p-6 border-b border-slate-800">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <ArrowUp className="w-5 h-5 text-sky-400" /> Transfer Mods
                                </h2>
                                <p className="text-slate-400 text-sm mt-1">Copy installed mods from {servers.find(s => s.id === selectedServerId)?.name} to another server.</p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Select Target Server</label>
                                    <select
                                        value={transferTargetId || ''}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTransferTargetId(Number(e.target.value))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    >
                                        <option value="">Select a server...</option>
                                        {servers
                                            .filter(s => s.id !== selectedServerId)
                                            .map(server => (
                                                <option key={server.id} value={server.id}>{server.name}</option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                                    <p className="text-yellow-200/80 text-sm flex items-start gap-2">
                                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                        <span>This will add all enabled mods from the current server to the target server, preserving their load order. Existing mods on the target server will be kept.</span>
                                    </p>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3">
                                <button
                                    onClick={() => setShowTransferDialog(false)}
                                    className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleTransferMods}
                                    disabled={!transferTargetId || isTransferring}
                                    className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isTransferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                                    <span>Transfer Mods</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Config Preview Modal - No Changes Here */}
            {
                showPreview && configPreview && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-sky-900/20">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                                <div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><BookOpen className="text-sky-400" /> Mod Configuration</h2><p className="text-slate-400 text-sm mt-1">Review and apply changes to your server configuration</p></div>
                                <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
                            </div>
                            {/* Content */}
                            <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
                                {configPreview.validation_errors.length > 0 && (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                        <h3 className="text-red-400 font-bold flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5" /> Validation Issues</h3>
                                        <ul className="list-disc list-inside text-red-300/80 text-sm">{configPreview.validation_errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between"><h3 className="text-white font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-sky-400" /> GameUserSettings.ini</h3><span className="text-xs text-slate-500 uppercase tracking-wider">Auto-Generated</span></div>
                                    <div className="relative group"><pre className="bg-slate-950 rounded-xl p-4 text-sm text-green-300 font-mono overflow-x-auto border border-slate-800">{configPreview.ini_section}</pre></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between"><h3 className="text-white font-medium flex items-center gap-2"><Terminal className="w-4 h-4 text-violet-400" /> Startup Command</h3></div>
                                    <div className="relative group"><pre className="bg-slate-950 rounded-xl p-4 text-sm text-violet-300 font-mono overflow-x-auto border border-slate-800 whitespace-pre-wrap break-all">{configPreview.startup_command}</pre><button onClick={() => copyToClipboard(configPreview.startup_command)} className="absolute top-2 right-2 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Copy className="w-4 h-4" /></button></div>
                                </div>

                                {/* Instructions */}
                                <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                                    <h3 className="text-white font-bold mb-4">Installation Instructions</h3>
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
                            <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3"><button onClick={() => setShowPreview(false)} className="px-6 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">Close</button><button onClick={() => { handleApplyConfig(); setShowPreview(false); }} className="px-8 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all flex items-center gap-2"><Save className="w-4 h-4" /> Apply to Server</button></div>
                        </div>
                    </div>
                )
            }

            {/* Mod Details Modal */}
            {
                selectedModDetail && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setSelectedModDetail(null)}>
                        <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col shadow-2xl shadow-sky-900/20" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <div className="relative h-64 md:h-80 shrink-0"><div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent z-10" /><img src={selectedModDetail.thumbnailUrl || 'https://steamuserimages-a.akamaihd.net/ugc/267224193367683679/61585257560F4500732813583643376510100000/'} alt={selectedModDetail.name} className="w-full h-full object-cover" /><button onClick={() => setSelectedModDetail(null)} className="absolute top-4 right-4 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"><X className="w-6 h-6" /></button><div className="absolute bottom-6 left-8 z-20"><h2 className="text-4xl font-bold text-white shadow-black drop-shadow-lg">{selectedModDetail.name}</h2><p className="text-slate-300 text-lg mt-2 font-medium drop-shadow-md">by {selectedModDetail.author}</p></div></div>
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-1 space-y-6">
                                        <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50">
                                            <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Info className="w-4 h-4 text-sky-400" /> Mod Information</h3>
                                            <div className="space-y-4 text-sm">
                                                <div className="flex justify-between border-b border-slate-700/50 pb-2"><span className="text-slate-400">Mod ID</span><span className="text-white font-mono">{selectedModDetail.id}</span></div>
                                                <div className="flex justify-between pt-1"><span className="text-slate-400">Status</span>{selectedModDetail.compatible ? <span className="text-green-400 flex items-center"><Check className="w-3 h-3 mr-1" /> Compatible</span> : <span className="text-red-400 flex items-center"><X className="w-3 h-3 mr-1" /> Check Version</span>}</div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3">
                                            <a href={selectedModDetail.curseforge_url || selectedModDetail.workshopUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-center font-bold transition-all border border-slate-700 flex items-center justify-center gap-2">
                                                <ExternalLink className="w-4 h-4" /> CurseForge
                                            </a>
                                            <button
                                                onClick={() => { handleInstallMod(selectedModDetail); setSelectedModDetail(null); }}
                                                className="flex-1 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-center font-bold transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
                                            >
                                                <Download className="w-4 h-4" /> Install
                                            </button>
                                        </div>
                                    </div>

                                    <div className="lg:col-span-2">
                                        <h3 className="text-2xl font-bold text-white mb-6">Description</h3>
                                        <div className="prose prose-invert prose-slate max-w-none text-slate-300">
                                            {isLoadingDescription && !fullDescription ? (
                                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                                    <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                                                    <p className="text-slate-400">Loading full description...</p>
                                                </div>
                                            ) : (
                                                <div dangerouslySetInnerHTML={{ __html: fullDescription || selectedModDetail.description || 'No description available.' }} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Search and Tabs */}
            <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
                {activeTab === 'available' ? (
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input type="text" value={searchQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)} placeholder="Search CurseForge mods..." className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all" />
                    </div>
                ) : (
                    <div className="text-lg text-slate-400 font-medium">Manage Installed Mods ({installedMods.length})</div>
                )}

                <div className="flex gap-4 items-center">
                    {activeTab === 'available' && (
                        <button onClick={handleSelectAll} className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                            <ListChecks className="w-4 h-4" /> <span>{selectedModIds.size === availableMods.length ? 'Deselect All' : 'Select All'}</span>
                        </button>
                    )}

                    <div className="flex p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
                        <button onClick={() => setActiveTab('available')} className={cn('px-6 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'available' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white')}>Available</button>
                        <button onClick={() => setActiveTab('installed')} className={cn('px-6 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'installed' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white')}>Installed</button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {
                activeTab === 'available' ? (
                    /* Available Mods Grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isLoading ? (
                            <div className="col-span-full flex justify-center py-20"><Loader2 className="w-10 h-10 text-sky-500 animate-spin" /></div>
                        ) : availableMods.length === 0 ? (
                            <div className="col-span-full text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-slate-300">No Mods Found</h3>
                            </div>
                        ) : (
                            availableMods.map((mod) => (
                                <div key={mod.id} onClick={() => setSelectedModDetail(mod)} className={cn("glass-panel rounded-2xl overflow-hidden group hover:border-sky-500/50 transition-all flex flex-col cursor-pointer relative", selectedModIds.has(mod.id) ? "border-sky-500/80 ring-2 ring-sky-500/20 bg-sky-900/10" : "")}>
                                    <div className="relative h-48 overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10"></div>
                                        <img src={mod.thumbnailUrl || 'https://steamuserimages-a.akamaihd.net/ugc/267224193367683679/61585257560F4500732813583643376510100000/'} alt={mod.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        <div onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleToggleSelect(mod.id); }} className="absolute top-3 left-3 z-30 p-2 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-colors cursor-pointer group/check">
                                            {selectedModIds.has(mod.id) ? <CheckSquare className="w-6 h-6 text-sky-400" /> : <Square className="w-6 h-6 text-white/50 group-hover/check:text-white" />}
                                        </div>
                                        <div className="absolute bottom-4 left-4 z-20"><h3 className="text-lg font-bold text-white leading-tight drop-shadow-md">{mod.name}</h3><p className="text-xs text-slate-300 mt-1 font-medium drop-shadow-sm">by {mod.author}</p></div>
                                    </div>
                                    <div className="p-6 flex-1 flex flex-col pointer-events-none">
                                        <div dangerouslySetInnerHTML={{ __html: mod.description || 'No description' }} className="text-slate-400 text-sm line-clamp-3 mb-4 flex-1 pointer-events-none opacity-80" />
                                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-700/50 pointer-events-auto">
                                            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleInstallMod(mod); }} className="flex items-center space-x-2 px-4 py-2 bg-sky-600/20 hover:bg-sky-500 hover:text-white text-sky-400 border border-sky-500/30 rounded-lg transition-all text-sm font-medium z-30"><Download className="w-4 h-4" /><span>Install</span></button>
                                        </div>
                                    </div>
                                </div>
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
                                <h3 className="text-xl font-semibold text-slate-300">No Installed Mods</h3>
                                <button onClick={() => setActiveTab('available')} className="mt-4 px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors">Browse Mods</button>
                            </div>
                        ) : (
                            installedMods.map((mod, index) => (
                                <div key={mod.id} className="glass-panel p-4 rounded-xl flex items-center gap-6 group hover:border-sky-500/30 transition-all">
                                    {/* Load Order & Move Buttons */}
                                    <div className="flex flex-col items-center gap-1 w-10">
                                        <button onClick={() => handleMoveMod(index, 'up')} disabled={index === 0} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ArrowUp className="w-4 h-4" /></button>
                                        <span className="text-xs font-mono text-slate-500">{index + 1}</span>
                                        <button onClick={() => handleMoveMod(index, 'down')} disabled={index === installedMods.length - 1} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white disabled:opacity-30 transition-colors"><ArrowDown className="w-4 h-4" /></button>
                                    </div>

                                    {/* Mod Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-lg font-bold text-white">{mod.name}</h3>
                                            <span className="px-2 py-0.5 bg-slate-800 rounded text-xs font-mono text-slate-400 border border-slate-700">ID: {mod.id}</span>
                                            {!mod.enabled && <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded border border-red-500/20">Disabled</span>}
                                        </div>
                                        <p className="text-slate-500 text-sm mt-1 line-clamp-1">{mod.description?.replace(/<[^>]*>?/gm, '') || 'No description'}</p>
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
                            ))
                        )}
                    </div>
                )
            }
        </div >
    );
}
