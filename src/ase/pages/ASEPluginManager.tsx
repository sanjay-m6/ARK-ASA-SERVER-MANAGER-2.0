import { useState, useEffect } from 'react';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { checkAseApiInstalled, getInstalledAsePlugins, type AsePluginInfo } from '../utils/aseCommands';
import { Plug, ExternalLink, Loader2, Package, X, AlertTriangle, CheckCircle2, Server } from 'lucide-react';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { openUrl } from '@tauri-apps/plugin-opener';

// Official uMod and classic ARK Server API websites
const UMOD_REPOSITORY_URL = 'https://umod.org/games/ark';
const ARKAPI_REPOSITORY_URL = 'https://arkforum.de/';

export default function ASEPluginManager() {
    const { servers } = useAseServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [plugins, setPlugins] = useState<AsePluginInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedPlugin, setSelectedPlugin] = useState<AsePluginInfo | null>(null);
    const [apiInstalled, setApiInstalled] = useState<boolean | null>(null);

    // Initialize default server
    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

    // Load plugins when server selection changes
    useEffect(() => {
        if (selectedServerId) {
            loadPlugins();
            checkApiInstallation();
        } else {
            setPlugins([]);
            setApiInstalled(null);
        }
    }, [selectedServerId]);

    const loadPlugins = async () => {
        if (!selectedServerId) return;

        setIsLoading(true);
        try {
            const result = await getInstalledAsePlugins(selectedServerId);
            setPlugins(result);
        } catch (error) {
            console.error('Failed to load ASE plugins:', error);
            toast.error('Failed to retrieve server plugins');
        } finally {
            setIsLoading(false);
        }
    };

    const checkApiInstallation = async () => {
        if (!selectedServerId) return;
        try {
            const installed = await checkAseApiInstalled(selectedServerId);
            setApiInstalled(installed);
        } catch (error) {
            console.error('Failed to check API:', error);
            setApiInstalled(false);
        }
    };

    const handleOpenRepository = (url: string) => {
        openUrl(url).catch(err => {
            console.error("Failed to open plugin website:", err);
            window.open(url, '_blank');
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-500">
                        ASE Plugins Manager
                    </h1>
                    <p className="text-slate-400 mt-2">
                        Manage classic C++ DLL plugins and C# uMod/Oxide server scripting hooks.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleOpenRepository(UMOD_REPOSITORY_URL)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all font-medium text-sm"
                    >
                        <ExternalLink className="w-4 h-4 text-amber-400" />
                        Browse uMod
                    </button>
                    <button
                        onClick={() => handleOpenRepository(ARKAPI_REPOSITORY_URL)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition-all font-medium text-sm"
                    >
                        <ExternalLink className="w-4 h-4 text-amber-400" />
                        Browse ArkAPI
                    </button>
                </div>
            </div>

            {/* Server Selector & Quick Status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-[#0A0F1C]/60 border border-white/5 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 items-center justify-between backdrop-blur-xl shadow-2xl">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                            <Server className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Active Server Instance</label>
                            <ServerSelect
                                value={selectedServerId}
                                onChange={setSelectedServerId}
                                servers={servers}
                                accentColor="amber"
                                className="w-full sm:w-60"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        {apiInstalled === true ? (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                                <CheckCircle2 className="w-4 h-4" />
                                API Framework Active
                            </span>
                        ) : apiInstalled === false ? (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-400 text-xs font-bold">
                                <AlertTriangle className="w-4 h-4" />
                                API Key/Framework Missing
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-xs">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Checking Status...
                            </span>
                        )}
                    </div>
                </div>

                <div className="bg-slate-900/60 border border-amber-500/10 rounded-2xl p-5 flex items-center justify-between backdrop-blur-sm">
                    <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Total Installed Plugins</span>
                        <h3 className="text-3xl font-extrabold text-white mt-1">{plugins.length}</h3>
                    </div>
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
                        <Plug className="w-7 h-7" />
                    </div>
                </div>
            </div>

            {/* Plugin Listing & Info Column */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* List */}
                <div className="xl:col-span-2 space-y-4">
                    {isLoading ? (
                        <div className="h-64 flex flex-col items-center justify-center border border-white/5 bg-slate-900/20 rounded-2xl">
                            <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                            <p className="text-sm text-slate-500 mt-4 font-medium">Scanning server binaries and oxide hooks...</p>
                        </div>
                    ) : plugins.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-800 bg-slate-900/10 rounded-2xl p-8 text-center">
                            <Package className="w-12 h-12 text-slate-600 mb-4" />
                            <h4 className="text-white font-bold text-lg">No plugins detected</h4>
                            <p className="text-slate-500 text-sm max-w-sm mt-1">
                                Create an ArkApi or oxide/plugins directory in your ShooterGame/Binaries/Win64 server folder to drop C# or C++ scripts.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {plugins.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => setSelectedPlugin(p)}
                                    className={cn(
                                        "group p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between h-44 shadow-lg",
                                        selectedPlugin?.id === p.id
                                            ? "bg-amber-500/10 border-amber-500/30 text-white"
                                            : "bg-slate-900/40 border-white/5 hover:border-amber-500/20 hover:bg-slate-900/60 text-slate-300"
                                    )}
                                >
                                    {/* Type tag */}
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-black/40 border border-white/5 text-amber-400 group-hover:scale-110 transition-transform">
                                                <Plug className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-white line-clamp-1">{p.name}</h3>
                                                <p className="text-[10px] text-slate-500 font-mono mt-0.5">v{p.version}</p>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase border",
                                            p.source === 'uMod'
                                                ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                                                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                        )}>
                                            {p.source}
                                        </span>
                                    </div>

                                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mt-3">
                                        {p.description || "No description provided."}
                                    </p>

                                    <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-4">
                                        <span className="text-[10px] text-slate-500 font-medium">Author: <strong className="text-slate-300">{p.author}</strong></span>
                                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            Active
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sidebar plugin info */}
                <div className="xl:col-span-1">
                    {selectedPlugin ? (
                        <div className="bg-slate-900/60 border border-amber-500/10 rounded-3xl p-6 space-y-6 backdrop-blur-sm sticky top-6 shadow-2xl animate-in slide-in-from-right duration-300">
                            <div className="flex items-start justify-between">
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
                                    <Plug className="w-8 h-8" />
                                </div>
                                <button
                                    onClick={() => setSelectedPlugin(null)}
                                    className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div>
                                <h3 className="text-xl font-bold text-white">{selectedPlugin.name}</h3>
                                <p className="text-xs text-slate-500 font-mono mt-1">ID: {selectedPlugin.id}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Version</span>
                                    <span className="text-sm font-semibold text-white mt-1 block">v{selectedPlugin.version}</span>
                                </div>
                                <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Source type</span>
                                    <span className="text-sm font-semibold text-amber-400 mt-1 block">{selectedPlugin.source}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Plugin Description</span>
                                <div className="p-4 rounded-2xl bg-black/25 border border-white/5 text-xs text-slate-300 leading-relaxed max-h-40 overflow-y-auto">
                                    {selectedPlugin.description || "This script does not have a parsed description block in its manifest file."}
                                </div>
                            </div>

                            <div className="space-y-2 border-t border-white/5 pt-5">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Author Context</span>
                                <p className="text-sm text-slate-300 font-medium">{selectedPlugin.author}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-96 border border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-slate-900/10">
                            <Plug className="w-10 h-10 text-slate-700 mb-3 animate-pulse" />
                            <h4 className="text-slate-400 font-bold text-sm">Select a Plugin</h4>
                            <p className="text-slate-600 text-xs mt-1 max-w-xs leading-relaxed">
                                Pick an active Oxide C# plugin or ArkApi binary DLL from the grid to view developer details and description properties.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
