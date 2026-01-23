import { useState } from 'react';
import { Copy, Settings, Database, X, Server, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Server as ServerType } from '../../types';

interface CloneOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceServer: ServerType;
    allServers: ServerType[];
    onCloneServer: () => Promise<void>;
    onTransferSettings: (targetServerId: number) => Promise<void>;
    onExtractData: (targetServerId: number) => Promise<void>;
}

type ActionType = 'clone' | 'transfer' | 'extract' | null;

export default function CloneOptionsModal({
    isOpen,
    onClose,
    sourceServer,
    allServers,
    onCloneServer,
    onTransferSettings,
    onExtractData,
}: CloneOptionsModalProps) {
    const [selectedAction, setSelectedAction] = useState<ActionType>(null);
    const [targetServerId, setTargetServerId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Filter out the source server from target options
    const targetServers = allServers.filter(s => s.id !== sourceServer.id);

    const handleExecute = async () => {
        setIsLoading(true);
        try {
            if (selectedAction === 'clone') {
                await onCloneServer();
            } else if (selectedAction === 'transfer' && targetServerId) {
                await onTransferSettings(targetServerId);
            } else if (selectedAction === 'extract' && targetServerId) {
                await onExtractData(targetServerId);
            }
            onClose();
        } finally {
            setIsLoading(false);
            setSelectedAction(null);
            setTargetServerId(null);
        }
    };

    const handleClose = () => {
        setSelectedAction(null);
        setTargetServerId(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-sky-500/10 rounded-lg">
                            <Copy className="w-5 h-5 text-sky-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Server Actions</h2>
                            <p className="text-sm text-slate-400">Source: {sourceServer.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Action Selection */}
                <div className="p-5 space-y-3">
                    {/* Clone Server */}
                    <button
                        onClick={() => setSelectedAction('clone')}
                        className={cn(
                            "w-full p-4 rounded-xl border text-left transition-all",
                            selectedAction === 'clone'
                                ? "bg-sky-500/10 border-sky-500/50 shadow-lg shadow-sky-500/10"
                                : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-lg",
                                selectedAction === 'clone' ? "bg-sky-500/20" : "bg-slate-700/50"
                            )}>
                                <Copy className={cn(
                                    "w-5 h-5",
                                    selectedAction === 'clone' ? "text-sky-400" : "text-slate-400"
                                )} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Clone Server</h3>
                                <p className="text-sm text-slate-400">Create a duplicate with offset ports (+10)</p>
                            </div>
                        </div>
                    </button>

                    {/* Transfer Settings */}
                    <button
                        onClick={() => setSelectedAction('transfer')}
                        className={cn(
                            "w-full p-4 rounded-xl border text-left transition-all",
                            selectedAction === 'transfer'
                                ? "bg-violet-500/10 border-violet-500/50 shadow-lg shadow-violet-500/10"
                                : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-lg",
                                selectedAction === 'transfer' ? "bg-violet-500/20" : "bg-slate-700/50"
                            )}>
                                <Settings className={cn(
                                    "w-5 h-5",
                                    selectedAction === 'transfer' ? "text-violet-400" : "text-slate-400"
                                )} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Transfer Settings</h3>
                                <p className="text-sm text-slate-400">Copy INI config to another server</p>
                            </div>
                        </div>
                    </button>

                    {/* Extract Data */}
                    <button
                        onClick={() => setSelectedAction('extract')}
                        className={cn(
                            "w-full p-4 rounded-xl border text-left transition-all",
                            selectedAction === 'extract'
                                ? "bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/10"
                                : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-lg",
                                selectedAction === 'extract' ? "bg-amber-500/20" : "bg-slate-700/50"
                            )}>
                                <Database className={cn(
                                    "w-5 h-5",
                                    selectedAction === 'extract' ? "text-amber-400" : "text-slate-400"
                                )} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Extract Save Data</h3>
                                <p className="text-sm text-slate-400">Copy world/player data to another server</p>
                            </div>
                        </div>
                    </button>

                    {/* Target Server Selection (for transfer/extract) */}
                    {(selectedAction === 'transfer' || selectedAction === 'extract') && (
                        <div className="mt-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2 mb-3">
                                <ArrowRight className="w-4 h-4 text-slate-400" />
                                <span className="text-sm font-medium text-slate-300">Select Target Server</span>
                            </div>

                            {targetServers.length === 0 ? (
                                <p className="text-sm text-slate-500 italic">No other servers available</p>
                            ) : (
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {targetServers.map(server => (
                                        <button
                                            key={server.id}
                                            onClick={() => setTargetServerId(server.id)}
                                            className={cn(
                                                "w-full p-3 rounded-lg border text-left transition-all flex items-center gap-3",
                                                targetServerId === server.id
                                                    ? "bg-slate-700 border-slate-500"
                                                    : "bg-slate-800/50 border-slate-700 hover:bg-slate-700/50"
                                            )}
                                        >
                                            <Server className="w-4 h-4 text-slate-400" />
                                            <span className="text-sm text-white">{server.name}</span>
                                            <span className="text-xs text-slate-500 ml-auto">{server.config.mapName}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700/50 bg-slate-800/30">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExecute}
                        disabled={
                            !selectedAction ||
                            isLoading ||
                            ((selectedAction === 'transfer' || selectedAction === 'extract') && !targetServerId)
                        }
                        className={cn(
                            "px-5 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            selectedAction === 'clone' && "bg-sky-500 hover:bg-sky-400 text-white",
                            selectedAction === 'transfer' && "bg-violet-500 hover:bg-violet-400 text-white",
                            selectedAction === 'extract' && "bg-amber-500 hover:bg-amber-400 text-black",
                            !selectedAction && "bg-slate-600 text-slate-300"
                        )}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                Execute
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
