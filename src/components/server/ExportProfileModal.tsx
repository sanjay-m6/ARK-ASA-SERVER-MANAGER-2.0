import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Download,
    X,
    Search,
    Code,
    Copy,
    Save,
    ShieldAlert,
    Layers,
    Puzzle,
    Radio,
    Settings,
    Cpu,
    Check,
    FileJson,
    Server as ServerIcon,
    RefreshCw,
    SlidersHorizontal,
    Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Server, ProfileExportOptions } from '../../types';
import { exportServerProfiles, saveProfilesToFile } from '../../utils/tauri';

interface ExportProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    servers: Server[];
    initialSelectedServerIds?: number[];
}

export const ExportProfileModal: React.FC<ExportProfileModalProps> = ({
    isOpen,
    onClose,
    servers,
    initialSelectedServerIds = [],
}) => {
    const { t } = useTranslation();

    // Selection State
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'ALL' | 'ASA' | 'ASE'>('ALL');

    // Export Options State
    const [options, setOptions] = useState<ProfileExportOptions>({
        includeConfig: true,
        includePorts: true,
        includeMods: true,
        includeAutomation: true,
        includeCluster: true,
        includePasswords: false, // Default off for safety
    });

    // UI Tab State ('setup' | 'preview')
    const [activeTab, setActiveTab] = useState<'setup' | 'preview'>('setup');
    const [jsonPreview, setJsonPreview] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Sync selected server IDs when modal opens
    useEffect(() => {
        if (isOpen) {
            if (initialSelectedServerIds && initialSelectedServerIds.length > 0) {
                setSelectedIds(initialSelectedServerIds);
            } else {
                setSelectedIds(servers.map(s => s.id));
            }
        }
    }, [isOpen, initialSelectedServerIds, servers]);

    // Filtered Servers List
    const filteredServers = useMemo(() => {
        return servers.filter(s => {
            const matchesSearch =
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.config?.mapName && s.config.mapName.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesType = filterType === 'ALL' || s.serverType === filterType;
            return matchesSearch && matchesType;
        });
    }, [servers, searchQuery, filterType]);

    // Generate Export JSON Payload
    const generateExportJson = async (): Promise<string> => {
        const targetServers = servers.filter(s => selectedIds.includes(s.id));
        if (targetServers.length === 0) return '';
        setIsGenerating(true);
        try {
            const json = await exportServerProfiles(targetServers, options);
            setJsonPreview(json);
            return json;
        } catch (err) {
            toast.error(`Failed to generate profile export: ${err}`);
            return '';
        } finally {
            setIsGenerating(false);
        }
    };

    // Auto-update JSON preview when active tab changes or options change
    useEffect(() => {
        if (activeTab === 'preview' && selectedIds.length > 0) {
            generateExportJson();
        }
    }, [activeTab, selectedIds, options]);

    // Selection Handlers
    const handleSelectAll = () => {
        setSelectedIds(servers.map(s => s.id));
    };

    const handleDeselectAll = () => {
        setSelectedIds([]);
    };

    const handleToggleServer = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleToggleOption = (key: keyof ProfileExportOptions) => {
        setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Save Export File Action
    const handleSaveFile = async () => {
        if (selectedIds.length === 0) {
            toast.error(t('exportProfile.noSelection', 'Please select at least one server profile to export.'));
            return;
        }
        setIsSaving(true);
        try {
            const json = await generateExportJson();
            if (!json) return;

            const selectedCount = selectedIds.length;
            const defaultFilename =
                selectedCount === 1
                    ? `ark_profile_${servers.find(s => s.id === selectedIds[0])?.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() || 'server'}.json`
                    : `ark_server_profiles_${selectedCount}_bundle.json`;

            const success = await saveProfilesToFile(json, defaultFilename);
            if (success) {
                toast.success(
                    t('exportProfile.saveSuccess', 'Exported {{count}} profile(s) successfully!', {
                        count: selectedCount,
                    })
                );
                onClose();
            }
        } catch (err) {
            toast.error(`Failed to save export file: ${err}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Copy to Clipboard Action
    const handleCopyClipboard = async () => {
        if (selectedIds.length === 0) {
            toast.error(t('exportProfile.noSelection', 'Please select at least one server profile to export.'));
            return;
        }
        try {
            const json = await generateExportJson();
            if (!json) return;

            await navigator.clipboard.writeText(json);
            toast.success(
                t('exportProfile.copySuccess', 'Copied {{count}} server profile(s) to clipboard!', {
                    count: selectedIds.length,
                }),
                { icon: '📋' }
            );
        } catch (err) {
            toast.error(`Clipboard copy failed: ${err}`);
        }
    };

    if (!isOpen) return null;

    const selectedCount = selectedIds.length;
    const jsonByteSize = new Blob([jsonPreview]).size;
    const estimatedKb = (jsonByteSize / 1024).toFixed(1);

    const modalContent = (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
                >
                    {/* Top Decorative Accent Line */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500"></div>

                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shadow-inner">
                                <Download className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    {t('exportProfile.modalTitle', 'Export Server Profiles')}
                                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                        v2.0
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {t(
                                        'exportProfile.modalSubtitle',
                                        'Export server configurations, network ports, rates, and modlists to a JSON profile bundle'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
                            <button
                                onClick={() => setActiveTab('setup')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    activeTab === 'setup'
                                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                }`}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                {t('exportProfile.tabs.setup', 'Setup & Selection')}
                            </button>
                            <button
                                onClick={() => setActiveTab('preview')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    activeTab === 'preview'
                                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                }`}
                            >
                                <Code className="w-3.5 h-3.5" />
                                {t('exportProfile.tabs.preview', 'JSON Preview')}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all ml-1 cursor-pointer"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                        {activeTab === 'setup' ? (
                            <>
                                {/* Quick Presets & Profile Counter Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleSelectAll}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                            {t('exportProfile.actions.selectAll', 'Export All Profiles')} ({servers.length})
                                        </button>
                                        <button
                                            onClick={handleDeselectAll}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/40 hover:bg-slate-700/70 text-slate-300 border border-slate-600/50 rounded-lg text-xs font-medium transition-all cursor-pointer"
                                        >
                                            {t('exportProfile.actions.clear', 'Clear Selection')}
                                        </button>
                                    </div>

                                    {/* Search & Filter */}
                                    <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
                                        <div className="relative flex-1">
                                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                placeholder={t('exportProfile.searchPlaceholder', 'Filter servers...')}
                                                className="w-full pl-8 pr-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                                            />
                                        </div>
                                        <select
                                            value={filterType}
                                            onChange={e => setFilterType(e.target.value as any)}
                                            className="px-2.5 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-violet-500 cursor-pointer"
                                        >
                                            <option value="ALL">All Types</option>
                                            <option value="ASA">ASA Only</option>
                                            <option value="ASE">ASE Only</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Server Selection Section */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                            <ServerIcon className="w-4 h-4 text-violet-400" />
                                            {t('exportProfile.selectServersTitle', '1. Select Profiles to Include')}
                                        </h3>
                                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                            {selectedCount} of {servers.length} Selected
                                        </span>
                                    </div>

                                    {filteredServers.length === 0 ? (
                                        <div className="text-center py-8 bg-slate-800/20 border border-slate-800 rounded-xl">
                                            <p className="text-xs text-slate-400">No servers match your search filter.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                                            {filteredServers.map(server => {
                                                const isChecked = selectedIds.includes(server.id);
                                                return (
                                                    <div
                                                        key={server.id}
                                                        onClick={() => handleToggleServer(server.id)}
                                                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                                                            isChecked
                                                                ? 'bg-violet-950/40 border-violet-500/60 shadow-md shadow-violet-950/20'
                                                                : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div
                                                                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                                                                    isChecked
                                                                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/40'
                                                                        : 'border border-slate-600 bg-slate-800'
                                                                }`}
                                                            >
                                                                {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                            </div>
                                                            <div className="truncate">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-bold text-white truncate">
                                                                        {server.name}
                                                                    </span>
                                                                    <span
                                                                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                                                            server.serverType === 'ASA'
                                                                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                                                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                        }`}
                                                                    >
                                                                        {server.serverType}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                                                    <span>Map: {server.config?.mapName || 'TheIsland'}</span>
                                                                    <span>•</span>
                                                                    <span>Port: {server.ports?.gamePort || 7777}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Export Module Options Section */}
                                <div>
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                                        <Layers className="w-4 h-4 text-violet-400" />
                                        {t('exportProfile.optionsTitle', '2. Choose Modules & Components to Include')}
                                    </h3>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {/* Game Configs & Rates */}
                                        <div
                                            onClick={() => handleToggleOption('includeConfig')}
                                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                                options.includeConfig
                                                    ? 'bg-slate-800/90 border-violet-500/50 shadow-md shadow-violet-950/10'
                                                    : 'bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-violet-400">
                                                    <Settings className="w-4 h-4" />
                                                    <span className="text-xs font-bold text-white">Game Config & Rates</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                                        options.includeConfig
                                                            ? 'bg-violet-600 border-violet-500 text-white'
                                                            : 'border-slate-700 bg-slate-900'
                                                    }`}
                                                >
                                                    {options.includeConfig && <Check className="w-3 h-3 stroke-[3]" />}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-normal">
                                                Map, max players, multipliers, custom args, and gameplay flags.
                                            </p>
                                        </div>

                                        {/* Ports & Network */}
                                        <div
                                            onClick={() => handleToggleOption('includePorts')}
                                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                                options.includePorts
                                                    ? 'bg-slate-800/90 border-violet-500/50 shadow-md shadow-violet-950/10'
                                                    : 'bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-sky-400">
                                                    <Radio className="w-4 h-4" />
                                                    <span className="text-xs font-bold text-white">Network & Ports</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                                        options.includePorts
                                                            ? 'bg-violet-600 border-violet-500 text-white'
                                                            : 'border-slate-700 bg-slate-900'
                                                    }`}
                                                >
                                                    {options.includePorts && <Check className="w-3 h-3 stroke-[3]" />}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-normal">
                                                Game Port, Query Port, RCON Port, and Peer Port bindings.
                                            </p>
                                        </div>

                                        {/* Installed Mods */}
                                        <div
                                            onClick={() => handleToggleOption('includeMods')}
                                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                                options.includeMods
                                                    ? 'bg-slate-800/90 border-violet-500/50 shadow-md shadow-violet-950/10'
                                                    : 'bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-emerald-400">
                                                    <Puzzle className="w-4 h-4" />
                                                    <span className="text-xs font-bold text-white">Installed Mods List</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                                        options.includeMods
                                                            ? 'bg-violet-600 border-violet-500 text-white'
                                                            : 'border-slate-700 bg-slate-900'
                                                    }`}
                                                >
                                                    {options.includeMods && <Check className="w-3 h-3 stroke-[3]" />}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-normal">
                                                Installed CurseForge mod IDs, names, and active mod order.
                                            </p>
                                        </div>

                                        {/* Automation & Schedules */}
                                        <div
                                            onClick={() => handleToggleOption('includeAutomation')}
                                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                                options.includeAutomation
                                                    ? 'bg-slate-800/90 border-violet-500/50 shadow-md shadow-violet-950/10'
                                                    : 'bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-amber-400">
                                                    <Cpu className="w-4 h-4" />
                                                    <span className="text-xs font-bold text-white">Automation & Rules</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                                        options.includeAutomation
                                                            ? 'bg-violet-600 border-violet-500 text-white'
                                                            : 'border-slate-700 bg-slate-900'
                                                    }`}
                                                >
                                                    {options.includeAutomation && <Check className="w-3 h-3 stroke-[3]" />}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-normal">
                                                Auto-start, auto-stop, intelligent mode, delays, priorities.
                                            </p>
                                        </div>

                                        {/* Cluster Integration */}
                                        <div
                                            onClick={() => handleToggleOption('includeCluster')}
                                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                                options.includeCluster
                                                    ? 'bg-slate-800/90 border-violet-500/50 shadow-md shadow-violet-950/10'
                                                    : 'bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-indigo-400">
                                                    <Layers className="w-4 h-4" />
                                                    <span className="text-xs font-bold text-white">Cluster Settings</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                                        options.includeCluster
                                                            ? 'bg-violet-600 border-violet-500 text-white'
                                                            : 'border-slate-700 bg-slate-900'
                                                    }`}
                                                >
                                                    {options.includeCluster && <Check className="w-3 h-3 stroke-[3]" />}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-normal">
                                                Cluster ID, paths, item/dino/survivor transfer restrictions.
                                            </p>
                                        </div>

                                        {/* Sensitive Passwords Toggle */}
                                        <div
                                            onClick={() => handleToggleOption('includePasswords')}
                                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                                options.includePasswords
                                                    ? 'bg-amber-950/30 border-amber-500/50 shadow-md shadow-amber-950/20'
                                                    : 'bg-slate-900/40 border-slate-800 opacity-70 hover:opacity-100'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-amber-400">
                                                    <ShieldAlert className="w-4 h-4" />
                                                    <span className="text-xs font-bold text-white">Include Passwords</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                                        options.includePasswords
                                                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                                                            : 'border-slate-700 bg-slate-900'
                                                    }`}
                                                >
                                                    {options.includePasswords && <Check className="w-3 h-3 stroke-[3]" />}
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-normal">
                                                {options.includePasswords ? (
                                                    <span className="text-amber-400 font-semibold">
                                                        ⚠️ Passwords WILL be included in cleartext JSON.
                                                    </span>
                                                ) : (
                                                    <span>Admin & Server Passwords masked for safe sharing.</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* Live JSON Preview Tab */
                            <div className="space-y-4">
                                <div className="flex items-center justify-between bg-slate-800/50 px-4 py-2.5 rounded-xl border border-slate-700/60">
                                    <div className="flex items-center gap-3">
                                        <FileJson className="w-4 h-4 text-violet-400" />
                                        <span className="text-xs font-bold text-white">Export Bundle Preview</span>
                                    </div>

                                    <div className="flex items-center gap-3 text-xs">
                                        <span className="text-slate-400">
                                            Profiles: <strong className="text-white">{selectedCount}</strong>
                                        </span>
                                        <span className="text-slate-400">
                                            Est. Size: <strong className="text-white">{estimatedKb} KB</strong>
                                        </span>
                                        <button
                                            onClick={() => generateExportJson()}
                                            disabled={isGenerating}
                                            className="flex items-center gap-1 text-violet-400 hover:text-violet-300 text-xs font-semibold cursor-pointer"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                                            Refresh
                                        </button>
                                    </div>
                                </div>

                                <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 max-h-[380px] overflow-auto leading-relaxed">
                                    {isGenerating ? (
                                        <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                                            <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
                                            <span>Building Profile JSON Bundle...</span>
                                        </div>
                                    ) : jsonPreview ? (
                                        <pre className="whitespace-pre-wrap">{jsonPreview}</pre>
                                    ) : (
                                        <div className="text-center py-12 text-slate-500">
                                            No server selected for JSON preview.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Modal Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90 backdrop-blur-md">
                        <div className="text-xs text-slate-400">
                            {selectedCount > 0 ? (
                                <span>
                                    Ready to export <strong className="text-white">{selectedCount}</strong> profile(s).
                                </span>
                            ) : (
                                <span className="text-amber-400">No profiles selected.</span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCopyClipboard}
                                disabled={selectedCount === 0 || isGenerating}
                                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                            >
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                {t('exportProfile.buttons.copy', 'Copy JSON')}
                            </button>

                            <button
                                onClick={handleSaveFile}
                                disabled={selectedCount === 0 || isGenerating || isSaving}
                                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-violet-600/20 transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                            >
                                {isSaving ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {t('exportProfile.buttons.save', 'Save to File (.json)')}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );

    return createPortal(modalContent, document.body);
};

export default ExportProfileModal;
