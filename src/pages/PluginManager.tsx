import { useState, useEffect } from 'react';
import { Plug, Download, ExternalLink, Loader2, Package, Trash2, Power, FolderOpen, X, AlertTriangle, CheckCircle2, XCircle, Server } from 'lucide-react';
import { cn } from '../utils/helpers';
import {
    getInstalledPlugins,
    selectPluginArchive,
    importPluginArchive,
    uninstallPlugin,
    togglePlugin,
    getPluginDirectory,
    checkAsaApiInstalled,
    getAllServers
} from '../utils/tauri';
import { PluginInfo, Server as ServerType } from '../types';
import toast from 'react-hot-toast';

// Official ASA Server API Plugin Repository URL
const PLUGIN_REPOSITORY_URL = 'https://ark-server-api.com/';

export default function PluginManager() {
    const [servers, setServers] = useState<ServerType[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [pluginDirectory, setPluginDirectory] = useState<string>('');
    const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null);
    const [asaApiInstalled, setAsaApiInstalled] = useState<boolean | null>(null);

    // Load servers on mount
    useEffect(() => {
        loadServers();
    }, []);

    // Load plugins when server selection changes
    useEffect(() => {
        if (selectedServerId) {
            loadPlugins();
            checkApiInstallation();
        } else {
            setPlugins([]);
            setPluginDirectory('');
            setAsaApiInstalled(null);
        }
    }, [selectedServerId]);

    const loadServers = async () => {
        try {
            const result = await getAllServers();
            setServers(result);
            // Auto-select first server if available
            if (result.length > 0 && !selectedServerId) {
                setSelectedServerId(result[0].id);
            }
        } catch (error) {
            console.error('Failed to load servers:', error);
            toast.error('Failed to load servers');
        }
    };

    const loadPlugins = async () => {
        if (!selectedServerId) return;

        setIsLoading(true);
        try {
            const result = await getInstalledPlugins(selectedServerId);
            setPlugins(result);
            const dir = await getPluginDirectory(selectedServerId);
            setPluginDirectory(dir);
        } catch (error) {
            console.error('Failed to load plugins:', error);
            toast.error('Failed to load plugins');
        } finally {
            setIsLoading(false);
        }
    };

    const checkApiInstallation = async () => {
        if (!selectedServerId) return;
        try {
            const installed = await checkAsaApiInstalled(selectedServerId);
            setAsaApiInstalled(installed);
        } catch (error) {
            console.error('Failed to check ASA API:', error);
            setAsaApiInstalled(false);
        }
    };

    const handleImportPlugin = async () => {
        if (!selectedServerId) {
            toast.error('Please select a server first');
            return;
        }

        try {
            const archivePath = await selectPluginArchive();
            if (!archivePath) return; // User cancelled

            setIsImporting(true);
            toast.loading('Importing plugin...', { id: 'import' });

            const plugin = await importPluginArchive(selectedServerId, archivePath);
            toast.success(`Plugin "${plugin.name}" installed!`, { id: 'import' });

            await loadPlugins();
        } catch (error) {
            console.error('Failed to import plugin:', error);
            toast.error(`Import failed: ${error}`, { id: 'import' });
        } finally {
            setIsImporting(false);
        }
    };

    const handleTogglePlugin = async (plugin: PluginInfo) => {
        if (!selectedServerId) return;

        try {
            const newState = !plugin.enabled;
            await togglePlugin(selectedServerId, plugin.id, newState);
            toast.success(`Plugin ${newState ? 'enabled' : 'disabled'}`);
            await loadPlugins();
        } catch (error) {
            console.error('Failed to toggle plugin:', error);
            toast.error(`Failed to toggle plugin: ${error}`);
        }
    };

    const handleUninstallPlugin = async (plugin: PluginInfo) => {
        if (!selectedServerId) return;
        if (!confirm(`Are you sure you want to uninstall "${plugin.name}"?`)) return;

        try {
            await uninstallPlugin(selectedServerId, plugin.id);
            toast.success('Plugin uninstalled');
            setSelectedPlugin(null);
            await loadPlugins();
        } catch (error) {
            console.error('Failed to uninstall plugin:', error);
            toast.error(`Failed to uninstall: ${error}`);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                        Plugin Manager
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Manage ASA Server API plugins per server</p>
                </div>

                <div className="flex items-center gap-4">
                    {/* Server Selector */}
                    <div className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-slate-400" />
                        <select
                            value={selectedServerId || ''}
                            onChange={(e) => setSelectedServerId(Number(e.target.value) || null)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-violet-500 focus:outline-none min-w-[200px]"
                        >
                            <option value="">Select a server...</option>
                            {servers.map(server => (
                                <option key={server.id} value={server.id}>
                                    {server.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleImportPlugin}
                        disabled={isImporting || !selectedServerId}
                        className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50"
                    >
                        {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        <span className="font-bold">Import Plugin</span>
                    </button>
                </div>
            </div>

            {/* No Server Selected */}
            {!selectedServerId && (
                <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                    <Server className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-300">No Server Selected</h3>
                    <p className="text-slate-500 mt-2">Select a server from the dropdown to manage its plugins</p>
                </div>
            )}

            {selectedServerId && (
                <>
                    {/* ASA Server API Status */}
                    <div className={cn(
                        "glass-panel rounded-2xl p-4 flex items-center gap-4 border",
                        asaApiInstalled === true && "border-green-500/20 bg-green-500/5",
                        asaApiInstalled === false && "border-amber-500/20 bg-amber-500/5",
                        asaApiInstalled === null && "border-slate-700"
                    )}>
                        {asaApiInstalled === true ? (
                            <>
                                <CheckCircle2 className="w-6 h-6 text-green-400" />
                                <div>
                                    <p className="text-white font-medium">ASA Server API Detected</p>
                                    <p className="text-slate-400 text-sm">Plugins are ready to use on this server</p>
                                </div>
                            </>
                        ) : asaApiInstalled === false ? (
                            <>
                                <XCircle className="w-6 h-6 text-amber-400" />
                                <div className="flex-1">
                                    <p className="text-white font-medium">ASA Server API Not Installed</p>
                                    <p className="text-slate-400 text-sm">
                                        Install ASA Server API first to use plugins.
                                        <a href={`${PLUGIN_REPOSITORY_URL}resources/asa-server-api.31/`} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline ml-1">
                                            Download here
                                        </a>
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                                <p className="text-slate-400">Checking ASA Server API status...</p>
                            </>
                        )}
                    </div>

                    {/* External Plugin Source Section */}
                    <div className="glass-panel rounded-2xl p-6 border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-violet-500/20 rounded-xl">
                                <ExternalLink className="w-6 h-6 text-violet-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-bold text-white mb-2">Official Plugin Repository</h2>
                                <p className="text-slate-400 mb-4">
                                    Download ASA Server API plugins from the official repository. Each plugin includes documentation and installation instructions.
                                </p>
                                <a
                                    href={PLUGIN_REPOSITORY_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-violet-600/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 rounded-xl transition-all font-medium"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Browse Plugins at ark-server-api.com</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Manual Import Instructions */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-slate-400" />
                            Manual Import Instructions
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold shrink-0">1</div>
                                <div>
                                    <p className="text-white font-medium">Download Plugin</p>
                                    <p className="text-slate-400 text-sm">Visit ark-server-api.com and download the plugin archive (.zip, .7z, or .rar)</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold shrink-0">2</div>
                                <div>
                                    <p className="text-white font-medium">Import Archive</p>
                                    <p className="text-slate-400 text-sm">Click "Import Plugin" and select the downloaded file</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold shrink-0">3</div>
                                <div>
                                    <p className="text-white font-medium">Restart Server</p>
                                    <p className="text-slate-400 text-sm">Restart your server for the plugin to take effect</p>
                                </div>
                            </div>
                        </div>

                        {pluginDirectory && (
                            <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-sm text-slate-400">
                                    <span className="font-medium text-slate-300">Plugin Directory:</span>{' '}
                                    <code className="text-violet-300 font-mono text-xs">{pluginDirectory}</code>
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Installed Plugins */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Plug className="w-5 h-5 text-violet-400" />
                                Installed Plugins ({plugins.length})
                            </h3>
                            <button
                                onClick={loadPlugins}
                                disabled={isLoading}
                                className="text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                {isLoading ? 'Loading...' : 'Refresh'}
                            </button>
                        </div>

                        {isLoading ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                            </div>
                        ) : plugins.length === 0 ? (
                            <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-slate-300">No Plugins Installed</h3>
                                <p className="text-slate-500 mt-2 mb-6">
                                    {asaApiInstalled ? 'Import a plugin archive to get started' : 'Install ASA Server API first, then import plugins'}
                                </p>
                                {asaApiInstalled && (
                                    <button
                                        onClick={handleImportPlugin}
                                        className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                                    >
                                        Import Plugin
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {plugins.map((plugin) => (
                                    <div
                                        key={plugin.id}
                                        onClick={() => setSelectedPlugin(plugin)}
                                        className={cn(
                                            "glass-panel rounded-xl p-5 cursor-pointer transition-all hover:border-violet-500/30 group",
                                            !plugin.enabled && "opacity-60"
                                        )}
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "p-2 rounded-lg",
                                                    plugin.enabled ? "bg-violet-500/20 text-violet-400" : "bg-slate-700 text-slate-500"
                                                )}>
                                                    <Plug className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="text-white font-bold">{plugin.name}</h4>
                                                    {plugin.version && (
                                                        <span className="text-xs text-slate-500">v{plugin.version}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {!plugin.enabled && (
                                                <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">Disabled</span>
                                            )}
                                        </div>

                                        {plugin.description && (
                                            <p className="text-slate-400 text-sm line-clamp-2 mb-3">{plugin.description}</p>
                                        )}

                                        {plugin.author && (
                                            <p className="text-xs text-slate-500">by {plugin.author}</p>
                                        )}

                                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-700/50">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleTogglePlugin(plugin); }}
                                                className={cn(
                                                    "p-2 rounded-lg transition-colors flex-1 flex items-center justify-center gap-2",
                                                    plugin.enabled
                                                        ? "bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                                                        : "bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-400"
                                                )}
                                            >
                                                <Power className="w-4 h-4" />
                                                <span className="text-sm font-medium">{plugin.enabled ? 'Enabled' : 'Disabled'}</span>
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUninstallPlugin(plugin); }}
                                                className="p-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
                                                title="Uninstall Plugin"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Plugin Details Modal */}
            {selectedPlugin && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedPlugin(null)}
                >
                    <div
                        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-violet-900/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-slate-800 flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-3 rounded-xl",
                                    selectedPlugin.enabled ? "bg-violet-500/20 text-violet-400" : "bg-slate-700 text-slate-500"
                                )}>
                                    <Plug className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-white">{selectedPlugin.name}</h2>
                                    {selectedPlugin.version && (
                                        <span className="text-slate-400">Version {selectedPlugin.version}</span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedPlugin(null)}
                                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {selectedPlugin.description && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-1">Description</h4>
                                    <p className="text-white">{selectedPlugin.description}</p>
                                </div>
                            )}

                            {selectedPlugin.author && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-1">Author</h4>
                                    <p className="text-white">{selectedPlugin.author}</p>
                                </div>
                            )}

                            {selectedPlugin.asaVersionCompatible && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-1">Min API Version</h4>
                                    <p className="text-white">{selectedPlugin.asaVersionCompatible}</p>
                                </div>
                            )}

                            <div>
                                <h4 className="text-sm font-medium text-slate-400 mb-1">Install Path</h4>
                                <code className="text-xs text-violet-300 font-mono bg-slate-800 px-3 py-2 rounded-lg block overflow-x-auto">
                                    {selectedPlugin.installPath}
                                </code>
                            </div>

                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-amber-200/80 text-sm">
                                    After enabling or disabling a plugin, restart your server for changes to take effect.
                                </p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-between gap-3">
                            <button
                                onClick={() => handleUninstallPlugin(selectedPlugin)}
                                className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Uninstall</span>
                            </button>
                            <button
                                onClick={() => handleTogglePlugin(selectedPlugin)}
                                className={cn(
                                    "px-6 py-2 font-bold rounded-lg shadow-lg transition-all flex items-center gap-2",
                                    selectedPlugin.enabled
                                        ? "bg-slate-700 hover:bg-slate-600 text-white"
                                        : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20"
                                )}
                            >
                                <Power className="w-4 h-4" />
                                <span>{selectedPlugin.enabled ? 'Disable Plugin' : 'Enable Plugin'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
