import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Plug,
    Download,
    ExternalLink,
    Loader2,
    Package,
    Trash2,
    Power,
    FolderOpen,
    AlertTriangle,
    XCircle,
    Server,
    RefreshCw,
    Search,
    ChevronDown,
    ChevronUp,
    Check,
    Info
} from 'lucide-react';
import { cn } from '../utils/helpers';
import {
    scanPlugins,
    selectPluginArchive,
    importPluginArchive,
    uninstallPlugin,
    togglePlugin,
    setAllPluginsEnabled,
    openPluginFolder,
    installAsaApi,
    createDefaultPlugin,
    toggleApiLoader,
    startServer,
    stopServer
} from '../utils/tauri';
import { PluginInfo, PluginScanResult } from '../types';
import toast from 'react-hot-toast';
import { openUrl } from '@tauri-apps/plugin-opener';

import { useServerStore } from '../stores/serverStore';

const PLUGIN_REPOSITORY_URL = 'https://ark-server-api.com/';

export default function PluginManager() {
    const { t } = useTranslation();
    const { servers, refreshServers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [scanResult, setScanResult] = useState<PluginScanResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isInstallingApi, setIsInstallingApi] = useState(false);
    const [isCreatingDefault, setIsCreatingDefault] = useState(false);
    const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'error' | 'missing'>('all');
    const [isActionLoading, setIsActionLoading] = useState(false);

    const selectedServer = useMemo(() => servers.find(s => s.id === selectedServerId), [servers, selectedServerId]);

    const handleStartServerAction = async () => {
        if (!selectedServerId) return;
        setIsActionLoading(true);
        try {
            await startServer(selectedServerId);
            toast.success(t('serverManager.serverStarted', 'Server started successfully'));
            await refreshServers();
        } catch (error) {
            console.error('Failed to start server:', error);
            toast.error(String(error));
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleStopServerAction = async () => {
        if (!selectedServerId) return;
        setIsActionLoading(true);
        try {
            await stopServer(selectedServerId);
            toast.success(t('serverManager.serverStopped', 'Server stopped successfully'));
            await refreshServers();
        } catch (error) {
            console.error('Failed to stop server:', error);
            toast.error(String(error));
        } finally {
            setIsActionLoading(false);
        }
    };

    // Auto-select first ASA server on mount or when servers load
    useEffect(() => {
        if (servers.length === 0) {
            refreshServers().catch(console.error);
        }
    }, []);

    const { activeServer } = useServerStore();
    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        }
    }, [activeServer]);

    // Scan/Load plugins when selected server changes
    const loadPluginData = async (silent = false) => {
        if (!selectedServerId) return;
        if (!silent) setIsLoading(true);
        try {
            const result = await scanPlugins(selectedServerId);
            setScanResult(result);
        } catch (error) {
            console.error('Failed to scan plugins:', error);
            toast.error(t('plugins.scanFailed', 'Failed to scan server plugins: {{error}}', { error: String(error) }));
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        loadPluginData();
    }, [selectedServerId]);

    // Active checks
    const isServerRunning = useMemo(() => {
        if (!selectedServer) return false;
        return ['starting', 'running', 'online', 'updating', 'restarting', 'stopping'].includes(selectedServer.status);
    }, [selectedServer]);

    // Toggle a plugin state
    const handleTogglePlugin = async (plugin: PluginInfo) => {
        if (!selectedServerId) return;

        const nextState = !plugin.enabled;
        
        // Optimistic UI update for launch mode banner responsiveness
        if (scanResult) {
            const updatedPlugins = scanResult.plugins.map(p => 
                p.id === plugin.id ? { ...p, enabled: nextState, status: nextState ? ('enabled' as const) : ('disabled' as const) } : p
            );
            const activeCount = updatedPlugins.filter(p => p.enabled && p.status === 'enabled').length;
            setScanResult({
                ...scanResult,
                plugins: updatedPlugins,
                activePluginCount: activeCount,
                launchExecutable: activeCount > 0 ? 'AsaApiLoader.exe' : 'ArkAscendedServer.exe'
            });
        }

        try {
            await togglePlugin(selectedServerId, plugin.folderName, nextState);
            toast.success(nextState ? t('plugins.enabled', 'Plugin enabled') : t('plugins.disabled', 'Plugin disabled'));
        } catch (error) {
            console.error('Failed to toggle plugin:', error);
            toast.error(String(error));
        } finally {
            // Reload canonical state
            await loadPluginData(true);
        }
    };

    // Toggle all plugins bulk helper
    const handleSetAllPlugins = async (enabled: boolean) => {
        if (!selectedServerId || !scanResult) return;

        const actionText = enabled ? t('plugins.enablingAll', 'Enabling all plugins...') : t('plugins.disablingAll', 'Disabling all plugins...');
        const toastId = toast.loading(actionText);

        try {
            await setAllPluginsEnabled(selectedServerId, enabled);
            toast.success(enabled ? t('plugins.allEnabled', 'All plugins enabled') : t('plugins.allDisabled', 'All plugins disabled'), { id: toastId });
        } catch (error) {
            console.error('Failed to toggle all plugins:', error);
            toast.error(t('plugins.toggleAllFailed', 'Failed to toggle all plugins: {{error}}', { error: String(error) }), { id: toastId });
        } finally {
            await loadPluginData();
        }
    };

    // Install ASA Server API from GitHub
    const handleInstallAsaApi = async () => {
        if (!selectedServerId) return;
        setIsInstallingApi(true);
        const toastId = toast.loading(t('plugins.installingLoader', 'Downloading and installing ASA Server API...'));
        try {
            const result = await installAsaApi(selectedServerId);
            toast.success(result, { id: toastId });
            await loadPluginData();
        } catch (error) {
            console.error('Failed to install ASA API:', error);
            toast.error(t('plugins.installLoaderFailed', 'Installation failed: {{error}}', { error: String(error) }), { id: toastId });
        } finally {
            setIsInstallingApi(false);
        }
    };

    // Import a ZIP plugin archive
    const handleImportPlugin = async () => {
        if (!selectedServerId) {
            toast.error(t('plugins.selectServerFirst', 'Please select a server first'));
            return;
        }

        try {
            const archivePath = await selectPluginArchive();
            if (!archivePath) return; // cancelled

            setIsImporting(true);
            toast.loading(t('plugins.importing', 'Importing plugin...'), { id: 'import' });

            const plugin = await importPluginArchive(selectedServerId, archivePath);
            toast.success(t('plugins.importSuccess', 'Plugin "{{name}}" imported successfully!', { name: plugin.name }), { id: 'import' });

            await loadPluginData();
        } catch (error) {
            console.error('Failed to import plugin:', error);
            toast.error(t('plugins.importFailed', 'Import failed: {{error}}', { error: String(error) }), { id: 'import' });
        } finally {
            setIsImporting(false);
        }
    };

    // Create a new default template plugin
    const handleCreateDefaultPlugin = async () => {
        if (!selectedServerId) {
            toast.error(t('plugins.selectServerFirst', 'Please select a server first'));
            return;
        }

        setIsCreatingDefault(true);
        const toastId = toast.loading(t('plugins.creatingDefault', 'Creating default plugin template...'));
        try {
            await createDefaultPlugin(selectedServerId);
            toast.success(t('plugins.createDefaultSuccess', 'DefaultPlugin template created! Configure parameters in config.json.'), { id: toastId, duration: 6000 });
            await loadPluginData();
        } catch (error) {
            console.error('Failed to create default plugin:', error);
            toast.error(t('plugins.createDefaultFailed', 'Failed to create default plugin: {{error}}', { error: String(error) }), { id: toastId });
        } finally {
            setIsCreatingDefault(false);
        }
    };

    // Uninstall a plugin
    const handleUninstallPlugin = async (plugin: PluginInfo) => {
        if (!selectedServerId) return;
        if (!confirm(t('plugins.confirmUninstall', 'Are you sure you want to uninstall "{{name}}"? This deletes its folder and config files.', { name: plugin.name }))) return;

        const toastId = toast.loading(t('plugins.uninstalling', 'Uninstalling plugin...'));
        try {
            await uninstallPlugin(selectedServerId, plugin.folderName);
            toast.success(t('plugins.uninstallSuccess', 'Plugin uninstalled successfully'), { id: toastId });
            if (expandedPluginId === plugin.id) {
                setExpandedPluginId(null);
            }
            await loadPluginData();
        } catch (error) {
            console.error('Failed to uninstall plugin:', error);
            toast.error(t('plugins.uninstallFailed', 'Failed to uninstall: {{error}}', { error: String(error) }), { id: toastId });
        }
    };

    // Open plugins directory in explorer
    const handleOpenPluginsFolder = async () => {
        if (!selectedServerId) return;
        try {
            await openPluginFolder(selectedServerId);
        } catch (error) {
            console.error('Failed to open plugins directory:', error);
            toast.error(t('plugins.openFolderFailed', 'Failed to open folder: {{error}}', { error: String(error) }));
        }
    };

    // Toggle the overall API Loader state
    const handleToggleApiLoader = async () => {
        if (!selectedServerId || !scanResult) return;
        
        const nextState = !scanResult.apiLoaderEnabled;
        
        // Optimistic UI update
        setScanResult({
            ...scanResult,
            apiLoaderEnabled: nextState,
            launchExecutable: nextState && scanResult.loaderInstalled ? 'AsaApiLoader.exe' : 'ArkAscendedServer.exe'
        });

        try {
            await toggleApiLoader(selectedServerId, nextState);
            toast.success(nextState ? t('plugins.apiLoaderEnabled', 'API Loader enabled') : t('plugins.apiLoaderDisabled', 'API Loader disabled'));
        } catch (error) {
            console.error('Failed to toggle API Loader:', error);
            toast.error(String(error));
        } finally {
            await loadPluginData(true);
        }
    };

    // Filtering plugins based on search query and status filter tab
    const filteredPlugins = useMemo(() => {
        if (!scanResult) return [];
        return scanResult.plugins.filter(plugin => {
            const matchesSearch = plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                plugin.folderName.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return false;

            switch (statusFilter) {
                case 'enabled':
                    return plugin.enabled && plugin.status === 'enabled';
                case 'disabled':
                    return !plugin.enabled && plugin.status === 'disabled';
                case 'error':
                    return plugin.status === 'error';
                case 'missing':
                    return plugin.status === 'missing';
                default:
                    return true;
            }
        });
    }, [scanResult, searchQuery, statusFilter]);

    // Helpers to check dependency status
    const getDependencyState = (depName: string) => {
        if (!scanResult) return { exists: false, enabled: false };
        const dep = scanResult.plugins.find(p => p.folderName === depName);
        return {
            exists: !!dep && dep.status !== 'missing',
            enabled: !!dep && dep.enabled && dep.status === 'enabled'
        };
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative pb-20">
            {/* Header section */}
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5">
                <div className="space-y-1">
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                        {t('plugins.title', 'Plugin Manager')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-base max-w-2xl leading-relaxed">
                        {t('plugins.subtitle', 'Manage ASA Server API plugins, toggle launch modes, and validate dependencies')}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                        onClick={handleOpenPluginsFolder}
                        disabled={!selectedServerId}
                        className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-slate-600 rounded-xl transition-all disabled:opacity-50 font-semibold text-sm cursor-pointer"
                        title={t('plugins.openFolderTooltip', 'Open Plugins directory in File Explorer')}
                    >
                        <FolderOpen className="w-4 h-4 text-violet-400" />
                        <span>{t('plugins.openFolder', 'Plugins Folder')}</span>
                    </button>

                    <button
                        onClick={handleCreateDefaultPlugin}
                        disabled={isCreatingDefault || !selectedServerId}
                        className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 hover:border-slate-600 rounded-xl transition-all disabled:opacity-50 font-semibold text-sm cursor-pointer"
                    >
                        {isCreatingDefault ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4 text-violet-400" />}
                        <span>{t('plugins.createDefault', 'Create Template')}</span>
                    </button>

                    <button
                        onClick={handleImportPlugin}
                        disabled={isImporting || !selectedServerId}
                        className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50 font-semibold text-sm cursor-pointer"
                    >
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        <span>{t('plugins.import', 'Import Plugin')}</span>
                    </button>
                </div>
            </div>

            {/* Launch banner & Warnings container */}
            {selectedServerId && scanResult && (
                <div className="space-y-4">
                    {/* Running warning */}
                    {isServerRunning && (
                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                            <Info className="w-5 h-5 text-cyan-400 shrink-0" />
                            <p className="text-cyan-200/90 text-sm font-medium">
                                {t('plugins.serverRunningWarning', 'Server is currently running/online. Changes to plugin states will take effect on next start.')}
                            </p>
                        </div>
                    )}

                    {/* Two-column Launch Status & Controls */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {/* LEFT — Launch Mode Status Panel */}
                        <div className={cn(
                            "rounded-2xl p-5 border transition-all duration-300 flex items-start gap-4",
                            scanResult.launchExecutable === 'AsaApiLoader.exe'
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        )}>
                            <div className={cn(
                                "p-3 rounded-xl shrink-0",
                                scanResult.launchExecutable === 'AsaApiLoader.exe' ? "bg-emerald-500/20" : "bg-blue-500/20"
                            )}>
                                <Plug className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-white text-base">
                                    {scanResult.launchExecutable === 'AsaApiLoader.exe'
                                        ? t('plugins.loaderLaunchMode', 'Launch Mode: Plugin Loader Active')
                                        : t('plugins.normalLaunchMode', 'Launch Mode: Normal Server Active')
                                    }
                                </h3>
                                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                                    {scanResult.launchExecutable === 'AsaApiLoader.exe'
                                        ? t('plugins.loaderLaunchDesc', 'Using {{exe}} to launch the server with hook plugins.', { exe: scanResult.launchExecutable })
                                        : t('plugins.normalLaunchDesc', 'Using {{exe}} (plugins loader disabled or missing).', { exe: scanResult.launchExecutable })
                                    }
                                </p>
                                <div className="mt-3 font-mono text-xs bg-slate-950/40 px-3 py-2 rounded-lg border border-white/5 select-all inline-block">
                                    {scanResult.launchExecutable}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT — Server Controls Panel */}
                        <div className="rounded-2xl p-5 border border-slate-800/80 bg-slate-900/30 flex flex-col justify-between gap-4">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('plugins.serverControls', 'Server Controls')}</span>
                                {selectedServer && (
                                    <span className={cn(
                                        "px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider border",
                                        isServerRunning
                                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                                            : "bg-slate-800 text-slate-400 border-slate-700"
                                    )}>
                                        {selectedServer.status || 'stopped'}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {/* Server Start/Stop */}
                                {selectedServer && (
                                    <button
                                        onClick={isServerRunning ? handleStopServerAction : handleStartServerAction}
                                        disabled={isActionLoading || selectedServer.status === 'starting' || selectedServer.status === 'updating' || selectedServer.status === 'restarting'}
                                        className={cn(
                                            "flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-md select-none",
                                            isServerRunning
                                                ? "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 hover:border-red-500/30"
                                                : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30"
                                        )}
                                    >
                                        {isActionLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Server className="w-4 h-4" />
                                        )}
                                        <span>
                                            {isServerRunning
                                                ? t('serverManager.stopServer', 'Stop Server')
                                                : t('serverManager.startServer', 'Start Server')
                                            }
                                        </span>
                                    </button>
                                )}

                                {/* API Loader Toggle */}
                                <div className="flex items-center gap-2.5 bg-slate-950/40 px-4 py-2.5 rounded-xl border border-white/5">
                                    <span className="text-xs font-semibold text-slate-350">
                                        {t('plugins.serverApiToggle', 'Server API (Loader)')}
                                    </span>
                                    <button
                                        onClick={handleToggleApiLoader}
                                        disabled={!scanResult.loaderInstalled || isServerRunning}
                                        className={cn(
                                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-550 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed",
                                            scanResult.apiLoaderEnabled ? "bg-violet-600" : "bg-slate-700"
                                        )}
                                        role="switch"
                                        aria-checked={scanResult.apiLoaderEnabled}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                scanResult.apiLoaderEnabled ? "translate-x-5" : "translate-x-0"
                                            )}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Loader warning banner */}
                    {!scanResult.loaderInstalled && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="flex items-start gap-4">
                                <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-1 md:mt-0" />
                                <div>
                                    <h4 className="text-white font-bold">{t('plugins.loaderMissing', 'ASA Server API (AsaApiLoader.exe) Not Installed')}</h4>
                                    <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                                        {t('plugins.loaderMissingDesc', 'The plugin loader is required to load enabled plugins. Toggling plugins is locked until you install the API.')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                                <button
                                    onClick={handleInstallAsaApi}
                                    disabled={isInstallingApi}
                                    className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50 font-bold text-sm cursor-pointer shrink-0"
                                >
                                    {isInstallingApi ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin animate-infinite" />
                                            <span>{t('plugins.installing', 'Installing...')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            <span>{t('plugins.autoInstallApi', 'Auto Install API')}</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => openUrl(`${PLUGIN_REPOSITORY_URL}resources/asa-server-api.31/`)}
                                    className="px-4 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-sm font-bold cursor-pointer shrink-0"
                                >
                                    {t('plugins.manualDownload', 'Manual Download')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Main plugins directory container */}
            {selectedServerId && scanResult && (
                <div className="space-y-5">
                    {/* Control and filtering bar */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/30 border border-slate-800/60 rounded-2xl p-4">
                        {/* Search and Tabs */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                            <div className="relative flex-1 max-w-lg">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder={t('plugins.searchPlaceholder', 'Filter by name or folder...')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-slate-700/70 hover:border-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 rounded-xl transition-all text-sm outline-none text-white placeholder:text-slate-500"
                                />
                            </div>

                            {/* Category Filter tabs */}
                            <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800/80 overflow-x-auto shrink-0">
                                {(['all', 'enabled', 'disabled', 'error', 'missing'] as const).map((filter) => {
                                    const count = scanResult.plugins.filter(p => {
                                        if (filter === 'all') return true;
                                        if (filter === 'enabled') return p.enabled && p.status === 'enabled';
                                        if (filter === 'disabled') return !p.enabled && p.status === 'disabled';
                                        return p.status === filter;
                                    }).length;

                                    return (
                                        <button
                                            key={filter}
                                            onClick={() => setStatusFilter(filter)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                                                statusFilter === filter
                                                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                                                    : "text-slate-400 hover:text-white border border-transparent"
                                            )}
                                        >
                                            {t(`plugins.filter.${filter}`, filter)} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bulk Enable/Disable buttons */}
                        <div className="flex items-center gap-2.5 shrink-0">
                            <button
                                onClick={() => handleSetAllPlugins(true)}
                                disabled={!scanResult.loaderInstalled || scanResult.plugins.length === 0}
                                className="px-4 py-2 bg-slate-950/50 hover:bg-slate-800 border border-slate-700/60 text-slate-300 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {t('plugins.enableAll', 'Enable All')}
                            </button>
                            <button
                                onClick={() => handleSetAllPlugins(false)}
                                disabled={!scanResult.loaderInstalled || scanResult.plugins.length === 0}
                                className="px-4 py-2 bg-slate-950/50 hover:bg-slate-800 border border-slate-700/60 text-slate-300 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {t('plugins.disableAll', 'Disable All')}
                            </button>
                            <button
                                onClick={() => loadPluginData()}
                                disabled={isLoading}
                                className="p-2.5 bg-slate-950/50 hover:bg-slate-800 border border-slate-700/60 text-slate-300 rounded-xl transition-all cursor-pointer"
                                title={t('plugins.refresh', 'Refresh list')}
                            >
                                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    {/* Plugins grid list */}
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 rounded-2xl border border-slate-800">
                            <Loader2 className="w-10 h-10 text-violet-500 animate-spin mb-4" />
                            <p className="text-slate-400 text-sm font-medium">{t('plugins.scanningFolder', 'Scanning plugins folder...')}</p>
                        </div>
                    ) : filteredPlugins.length === 0 ? (
                        <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                            <Package className="w-16 h-16 text-slate-650 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-slate-300">{t('plugins.noPlugins', 'No Plugins Discovered')}</h3>
                            <p className="text-slate-500 mt-2 mb-6 max-w-md mx-auto leading-relaxed">
                                {searchQuery || statusFilter !== 'all'
                                    ? t('plugins.noMatchingPlugins', 'No plugins matching current filters were found.')
                                    : t('plugins.noPluginsDesc', 'No plugins found in the directory. Download and import archives to activate hooks.')}
                            </p>
                            {!searchQuery && statusFilter === 'all' && (
                                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                    <button
                                        onClick={() => openUrl(PLUGIN_REPOSITORY_URL)}
                                        className="inline-flex items-center space-x-2 px-5 py-2.5 bg-violet-600/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 rounded-xl transition-all font-medium cursor-pointer text-sm"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span>{t('plugins.visitRepo', 'Browse Official Repository')}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {filteredPlugins.map((plugin) => {
                                const isExpanded = expandedPluginId === plugin.id;
                                const statusColor = {
                                    enabled: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
                                    disabled: 'bg-slate-750 text-slate-400 border-slate-700',
                                    error: 'bg-red-500/15 text-red-400 border-red-500/20',
                                    missing: 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                                }[plugin.status];

                                return (
                                    <div
                                        key={plugin.id}
                                        className={cn(
                                            "glass-panel rounded-2xl border transition-all duration-300 overflow-hidden",
                                            isExpanded ? "border-violet-500/40 shadow-lg shadow-violet-500/5 bg-slate-900/40 xl:col-span-2" : "border-slate-800 hover:border-slate-700/80 bg-slate-950/20",
                                            plugin.status === 'error' && "border-red-500/30",
                                            plugin.status === 'missing' && "border-amber-500/30"
                                        )}
                                    >
                                        {/* Card Top / Header row */}
                                        <div
                                            onClick={() => setExpandedPluginId(isExpanded ? null : plugin.id)}
                                            className="p-5 flex items-center justify-between gap-4 cursor-pointer select-none"
                                        >
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                <div className={cn(
                                                    "p-3 rounded-xl shrink-0 border transition-all",
                                                    plugin.enabled && plugin.status === 'enabled'
                                                        ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                                                        : "bg-slate-900 text-slate-500 border-slate-800"
                                                )}>
                                                    <Plug className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="text-white font-bold truncate text-base">{plugin.name}</h4>
                                                        <span className="text-xs font-mono text-slate-450 bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                                                            {plugin.folderName}
                                                        </span>
                                                        {plugin.version && (
                                                            <span className="text-xs text-slate-500 font-semibold">v{plugin.version}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {plugin.author && (
                                                            <span className="text-xs text-slate-450">{t('plugins.by', 'by {{author}}', { author: plugin.author })}</span>
                                                        )}
                                                        {plugin.author && plugin.dependencies.length > 0 && <span className="text-slate-700 text-xs">•</span>}
                                                        {plugin.dependencies.length > 0 && (
                                                            <span className="text-xs text-slate-455">
                                                                {t('plugins.depCount', '{{count}} dependencies', { count: plugin.dependencies.length })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Badges, Toggle and Arrow controls */}
                                            <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {/* Status badge */}
                                                <span className={cn(
                                                    "px-2.5 py-1 text-xs font-bold rounded-lg uppercase tracking-wider border",
                                                    statusColor
                                                )}>
                                                    {t(`plugins.status.${plugin.status}`, plugin.status)}
                                                </span>

                                                {/* Power toggle */}
                                                <button
                                                    onClick={() => handleTogglePlugin(plugin)}
                                                    disabled={!scanResult.loaderInstalled || plugin.status === 'error' || plugin.status === 'missing'}
                                                    className={cn(
                                                        "p-2 rounded-xl transition-all border shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                                                        plugin.enabled && plugin.status === 'enabled'
                                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-350"
                                                            : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-350 hover:border-slate-700"
                                                    )}
                                                    title={plugin.enabled ? t('plugins.clickToDisable', 'Disable plugin') : t('plugins.clickToEnable', 'Enable plugin')}
                                                >
                                                    <Power className="w-4 h-4" />
                                                </button>

                                                {/* Expand chevron */}
                                                <button
                                                    onClick={() => setExpandedPluginId(isExpanded ? null : plugin.id)}
                                                    className="p-1.5 hover:bg-slate-850 text-slate-500 hover:text-white rounded-lg transition-all cursor-pointer"
                                                >
                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expandable plugin details panel */}
                                        {isExpanded && (
                                            <div className="px-5 pb-5 pt-1 border-t border-slate-900 bg-slate-900/25 space-y-4 animate-in slide-in-from-top-2 duration-300">
                                                {/* Error banner inside plugin if error exists */}
                                                {plugin.statusMessage && (
                                                    <div className={cn(
                                                        "p-4 rounded-xl flex items-start gap-3 border text-sm font-medium",
                                                        plugin.status === 'error' ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                                    )}>
                                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                                        <div>
                                                            <h5 className="font-bold text-white mb-1">
                                                                {plugin.status === 'error' ? t('plugins.errorDetected', 'Plugin Loading Error') : t('plugins.missingTitle', 'Plugin Missing')}
                                                            </h5>
                                                            <p className="text-slate-300 leading-relaxed">{plugin.statusMessage}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Description */}
                                                <div>
                                                    <h5 className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-1">{t('plugins.description', 'Description')}</h5>
                                                    <p className="text-slate-300 text-sm leading-relaxed max-w-4xl">
                                                        {plugin.description || t('plugins.noDescription', 'No description provided for this plugin.')}
                                                    </p>
                                                </div>

                                                {/* Dependencies */}
                                                {plugin.dependencies.length > 0 && (
                                                    <div>
                                                        <h5 className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">{t('plugins.dependencies', 'Dependencies')}</h5>
                                                        <div className="flex flex-col gap-2 max-w-md">
                                                            {plugin.dependencies.map(dep => {
                                                                const state = getDependencyState(dep);
                                                                return (
                                                                    <div key={dep} className="flex items-center justify-between p-2.5 bg-slate-950/40 rounded-lg border border-white/5 text-sm">
                                                                        <span className="font-mono text-slate-300">{dep}</span>
                                                                        <div className="flex items-center gap-2">
                                                                            {state.exists ? (
                                                                                state.enabled ? (
                                                                                    <span className="flex items-center gap-1 text-emerald-400 font-semibold text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                                                        <Check className="w-3.5 h-3.5" />
                                                                                        <span>{t('plugins.depActive', 'Active')}</span>
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="flex items-center gap-1 text-amber-400 font-semibold text-xs bg-amber-500/10 px-2 py-0.5 rounded-full">
                                                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                                                        <span>{t('plugins.depDisabled', 'Disabled')}</span>
                                                                                    </span>
                                                                                )
                                                                            ) : (
                                                                                <span className="flex items-center gap-1 text-red-400 font-semibold text-xs bg-red-500/10 px-2 py-0.5 rounded-full">
                                                                                    <XCircle className="w-3.5 h-3.5" />
                                                                                    <span>{t('plugins.depMissing', 'Missing')}</span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Install Path */}
                                                <div>
                                                    <h5 className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-1">{t('plugins.installPath', 'Installed Path')}</h5>
                                                    <div className="flex items-center gap-3">
                                                        <code className="text-xs font-mono text-violet-300 bg-slate-955/60 border border-white/5 px-3 py-2 rounded-xl block flex-1 overflow-x-auto select-all">
                                                            {plugin.installedPath}
                                                        </code>
                                                    </div>
                                                </div>

                                                {/* Danger/Action Panel */}
                                                <div className="pt-2 flex items-center justify-between border-t border-slate-900 bg-transparent">
                                                    <div className="text-xs text-slate-500 font-mono">
                                                        {t('plugins.id', 'ID: {{id}}', { id: plugin.id })}
                                                    </div>
                                                    <button
                                                        onClick={() => handleUninstallPlugin(plugin)}
                                                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl transition-all text-xs font-bold cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        <span>{t('plugins.delete', 'Uninstall Plugin')}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Loading state when scan result is not yet available */}
            {selectedServerId && isLoading && !scanResult && (
                <div className="flex flex-col items-center justify-center py-24 glass-panel rounded-2xl border border-slate-800 animate-in fade-in duration-300">
                    <Loader2 className="w-10 h-10 text-violet-500 animate-spin mb-4" />
                    <p className="text-slate-300 text-base font-semibold">{t('plugins.scanningFolder', 'Scanning plugins folder...')}</p>
                    <p className="text-slate-500 text-sm mt-1">{t('plugins.loadingDetails', 'Checking server directory and plugin configurations.')}</p>
                </div>
            )}

            {/* Error or unable to load state */}
            {selectedServerId && !isLoading && !scanResult && (
                <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50 animate-in fade-in duration-300">
                    <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white">{t('plugins.unableToLoad', 'Plugins Unavailable')}</h3>
                    <p className="text-slate-400 mt-2 mb-6 max-w-md mx-auto leading-relaxed text-sm">
                        {t('plugins.unableToLoadDesc', 'Could not load plugin data for this server. Check that the server directory exists and is accessible.')}
                    </p>
                    <button
                        onClick={() => loadPluginData()}
                        className="inline-flex items-center space-x-2 px-5 py-2.5 bg-violet-600/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 rounded-xl transition-all font-semibold cursor-pointer text-sm"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span>{t('plugins.retry', 'Retry Scan')}</span>
                    </button>
                </div>
            )}

            {/* Inactive Server Selected details */}
            {!selectedServerId && (
                <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                    <Server className="w-16 h-16 text-slate-655 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-300">{t('plugins.noServerSelected', 'No Server Selected')}</h3>
                    <p className="text-slate-500 mt-2">{t('plugins.selectServerDesc', 'Select an ASA game server from the dropdown to audit and configure its hook plugins.')}</p>
                </div>
            )}
        </div>
    );
}
