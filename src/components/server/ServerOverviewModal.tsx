import { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Server as ServerIcon, Globe, HardDrive, Shield, Wifi, 
    Copy, Eye, EyeOff, FolderOpen, Hash
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { toast } from 'react-hot-toast';
import { openInExplorer } from '../../utils/tauri';

interface ServerOverviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    server: any; // Supports ASA (Server) and ASE (AseServer)
    publicIp?: string | null;
}

export default function ServerOverviewModal({
    isOpen,
    onClose,
    server,
    publicIp,
}: ServerOverviewModalProps) {
    const [showAdminPassword, setShowAdminPassword] = useState(false);

    if (!isOpen || !server) return null;

    const isASE = server.serverType === 'ASE' || 'mapName' in server && !('config' in server);
    const gamePort = server.ports?.gamePort ?? server.port ?? 7777;
    const queryPort = server.ports?.queryPort ?? server.queryPort ?? 27015;
    const rconPort = server.ports?.rconPort ?? server.rconPort ?? 27020;
    const mapName = server.config?.mapName ?? server.mapName ?? 'TheIsland';
    const maxPlayers = server.config?.maxPlayers ?? server.maxPlayers ?? 70;
    const playerCount = server.players?.length ?? server.playerCount ?? 0;
    const adminPassword = server.config?.adminPassword ?? server.adminPassword ?? 'N/A';
    const serverPassword = server.config?.serverPassword ?? server.serverPassword ?? 'None';
    const installPath = server.installPath || 'N/A';
    const displayIp = publicIp || '127.0.0.1';
    const clusterId = server.config?.clusterId ?? server.clusterId ?? null;

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`Copied ${label} to clipboard!`, { icon: '📋' });
    };

    const handleOpenExplorer = () => {
        if (installPath && installPath !== 'N/A') {
            openInExplorer(installPath).catch(err => {
                toast.error(`Failed to open folder: ${err}`);
            });
        }
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[88vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top Banner & Header (Fixed, shrink-0) */}
                <div className="shrink-0 relative p-5 bg-slate-900/90 border-b border-slate-800">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-sky-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "p-2.5 rounded-xl border shadow-md flex-shrink-0",
                                isASE ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-sky-500/10 border-sky-500/30 text-sky-400"
                            )}>
                                <ServerIcon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-black text-white tracking-wide truncate">{server.name}</h2>
                                    <span className={cn(
                                        "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border flex-shrink-0",
                                        isASE ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                    )}>
                                        {isASE ? 'ASE' : 'ASA'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                                    <span className="font-mono">ID: {server.id}</span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1 text-slate-300 truncate">
                                        <Hash className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                        Map: <strong className="text-white font-mono">{mapName}</strong>
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 flex-shrink-0">
                            <span className={cn(
                                "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border flex items-center gap-1.5 shadow-sm",
                                server.status === 'running' || server.status === 'online'
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                    : server.status === 'starting' || server.status === 'updating'
                                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                    : "bg-slate-800 text-slate-400 border-slate-700"
                            )}>
                                <span className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    server.status === 'running' || server.status === 'online' ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                                )} />
                                {server.status || 'STOPPED'}
                            </span>

                            <button
                                onClick={onClose}
                                className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors border border-white/5"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Modal Body - Scrollable Content (flex-1, min-h-0) */}
                <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0 custom-scrollbar">
                    
                    {/* 1. Connection & Network Overview */}
                    <div>
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-sky-400 mb-2.5 flex items-center gap-1.5">
                            <Wifi className="w-3.5 h-3.5" />
                            Connection & Network Ports
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Game Port</span>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-base font-mono font-black text-sky-400">{gamePort}</span>
                                    <button 
                                        onClick={() => handleCopy(`${gamePort}`, 'Game Port')}
                                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                        title="Copy Game Port"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Query Port</span>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-base font-mono font-black text-emerald-400">{queryPort}</span>
                                    <button 
                                        onClick={() => handleCopy(`${queryPort}`, 'Query Port')}
                                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                        title="Copy Query Port"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">RCON Port</span>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-base font-mono font-black text-purple-400">{rconPort}</span>
                                    <button 
                                        onClick={() => handleCopy(`${rconPort}`, 'RCON Port')}
                                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                        title="Copy RCON Port"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick Connection String Banner */}
                        <div className="mt-2.5 p-3 bg-slate-950/90 border border-sky-500/20 rounded-xl flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 truncate">
                                <Globe className="w-4 h-4 text-sky-400 flex-shrink-0" />
                                <span className="text-xs font-mono text-slate-300 truncate">
                                    Direct Connect: <strong className="text-white font-mono">{displayIp}:{gamePort}</strong>
                                </span>
                            </div>
                            <button
                                onClick={() => handleCopy(`${displayIp}:${gamePort}`, 'Direct Connect IP')}
                                className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy IP:Port</span>
                            </button>
                        </div>
                    </div>

                    {/* 2. Server Configuration & Security */}
                    <div>
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-sky-400 mb-2.5 flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5" />
                            Configuration & Security Details
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Map Name:</span>
                                    <span className="font-mono font-bold text-white">{mapName}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Player Capacity:</span>
                                    <span className="font-mono font-bold text-emerald-400">{playerCount} / {maxPlayers}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">BattEye Anti-Cheat:</span>
                                    <span className={cn(
                                        "font-bold px-2 py-0.5 rounded text-[10px]",
                                        server.battleye !== false ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-slate-400"
                                    )}>
                                        {server.battleye !== false ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                </div>
                            </div>

                            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Admin Password:</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-amber-400">
                                            {showAdminPassword ? adminPassword : '••••••••'}
                                        </span>
                                        <button
                                            onClick={() => setShowAdminPassword(!showAdminPassword)}
                                            className="p-1 text-slate-400 hover:text-white transition-colors"
                                        >
                                            {showAdminPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Server Password:</span>
                                    <span className="font-mono font-bold text-slate-300">{serverPassword}</span>
                                </div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Cluster ID:</span>
                                    <span className="font-mono font-bold text-purple-400">{clusterId || 'Standalone'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Storage & Local Filesystem */}
                    <div>
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-sky-400 mb-2.5 flex items-center gap-1.5">
                            <HardDrive className="w-3.5 h-3.5" />
                            Storage & File Paths
                        </h3>
                        <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Installation Folder</span>
                                    <p className="text-xs font-mono text-slate-300 truncate bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                                        {installPath}
                                    </p>
                                </div>
                                <button
                                    onClick={handleOpenExplorer}
                                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5 flex-shrink-0 shadow-sm"
                                >
                                    <FolderOpen className="w-4 h-4 text-amber-400" />
                                    <span>Open Folder</span>
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Modal Footer (Fixed, shrink-0) */}
                <div className="shrink-0 p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition-all uppercase tracking-wider"
                    >
                        Close Summary
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
