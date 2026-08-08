import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, ShieldAlert, Wand2, Server } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useTranslation } from 'react-i18next';
import { ConflictCheckResult } from '../../utils/tauri';
import { allocateNextAvailablePorts, ServerPortConfig, MinimalServerProfile } from '../../utils/portAllocator';

interface PortConflictModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onAutoFix?: (newPorts: ServerPortConfig) => void;
    result: ConflictCheckResult | null;
    existingServers?: MinimalServerProfile[];
    currentServerId?: number;
}

export default function PortConflictModal({
    isOpen,
    onClose,
    onConfirm,
    onAutoFix,
    result,
    existingServers = [],
    currentServerId,
}: PortConflictModalProps) {
    const { t } = useTranslation();

    // Calculate recommended next available ports for auto-fix
    const suggestedPorts = useMemo(() => {
        if (!isOpen) return null;
        return allocateNextAvailablePorts(existingServers, {
            excludeServerId: currentServerId,
        });
    }, [isOpen, existingServers, currentServerId]);

    if (!isOpen || !result) return null;

    const isHardConflict = result.has_active_conflicts;

    const handleAutoFixClick = () => {
        if (onAutoFix && suggestedPorts) {
            onAutoFix(suggestedPorts);
            onClose();
        }
    };

    const modalContent = (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className={cn(
                "bg-slate-900/95 border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 backdrop-blur-xl",
                isHardConflict ? "border-red-500/30 shadow-red-950/20" : "border-amber-500/30 shadow-amber-950/20"
            )}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10 bg-slate-950/40">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-3 rounded-xl border shadow-inner",
                            isHardConflict 
                                ? "bg-red-500/10 border-red-500/20 text-red-400" 
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        )}>
                            {isHardConflict ? (
                                <ShieldAlert className="w-6 h-6" />
                            ) : (
                                <AlertTriangle className="w-6 h-6" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-wide">
                                {isHardConflict 
                                    ? t('serverManager.conflicts.hardTitle', 'Critical Port Conflict') 
                                    : t('serverManager.conflicts.softTitle', 'Port Conflict Warning')}
                            </h2>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                {result.conflicts.length} conflicting port{result.conflicts.length > 1 ? 's' : ''} detected
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    <p className="text-slate-300 leading-relaxed text-sm">
                        {isHardConflict 
                            ? t('serverManager.conflicts.hardMessage', 'One or more configured ports are currently active in another server or process. Reassign ports automatically to resolve.')
                            : t('serverManager.conflicts.softMessage', 'One or more ports are configured on offline server profiles. You can reassign free ports or start anyway.')
                        }
                    </p>

                    {/* Detected Conflicts List */}
                    <div className="bg-slate-950/60 rounded-xl border border-white/10 overflow-hidden shadow-inner">
                        <div className="px-4 py-2.5 bg-slate-900/80 border-b border-white/5 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            <span>{t('serverManager.conflicts.detectedConflicts', 'Detected Conflicts')}</span>
                            <span className="text-[10px] font-mono text-slate-500">{result.conflicts.length} Total</span>
                        </div>
                        <div className="divide-y divide-white/5 max-h-40 overflow-y-auto">
                            {result.conflicts.map((conflict, idx) => (
                                <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-white/5">
                                            <Server className="w-4 h-4 text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-xs text-white">
                                                {conflict.port_type} Port <span className="font-mono text-cyan-400">({conflict.port_number})</span>
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                {conflict.conflicting_server_name 
                                                    ? `${t('serverManager.conflicts.usedBy', 'Used by:')} ${conflict.conflicting_server_name}`
                                                    : t('serverManager.conflicts.unknownProcess', 'Used by unknown external process')}
                                            </div>
                                        </div>
                                    </div>
                                    {conflict.is_running ? (
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                                            {t('common.status.online', 'Online')}
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-slate-800 text-slate-400 border border-white/5 shrink-0">
                                            {t('common.status.offline', 'Offline')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Auto-Fix Available Allocation Preview */}
                    {onAutoFix && suggestedPorts && (
                        <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-4 space-y-2.5 relative overflow-hidden shadow-lg shadow-sky-950/20">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wider">
                                    <Wand2 className="w-4 h-4 text-sky-400" />
                                    <span>Recommended Auto-Port Allocation</span>
                                </div>
                                <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-bold uppercase border border-sky-500/30">
                                    Conflict-Free
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-1">
                                <div className="bg-slate-900/80 p-2 rounded-lg border border-sky-500/20 text-center">
                                    <div className="text-[10px] font-medium text-slate-400 uppercase">Game</div>
                                    <div className="text-xs font-bold font-mono text-emerald-400">{suggestedPorts.gamePort}</div>
                                </div>
                                <div className="bg-slate-900/80 p-2 rounded-lg border border-sky-500/20 text-center">
                                    <div className="text-[10px] font-medium text-slate-400 uppercase">Query</div>
                                    <div className="text-xs font-bold font-mono text-cyan-400">{suggestedPorts.queryPort}</div>
                                </div>
                                <div className="bg-slate-900/80 p-2 rounded-lg border border-sky-500/20 text-center">
                                    <div className="text-[10px] font-medium text-slate-400 uppercase">RCON</div>
                                    <div className="text-xs font-bold font-mono text-amber-400">{suggestedPorts.rconPort}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 p-5 border-t border-white/10 bg-slate-950/60">
                    <button
                        onClick={onClose}
                        className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    >
                        {t('dialogs.confirm.cancel', 'Cancel')}
                    </button>

                    {!isHardConflict && (
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all"
                        >
                            {t('serverManager.conflicts.startAnyway', 'Start Anyway')}
                        </button>
                    )}

                    {onAutoFix && suggestedPorts && (
                        <button
                            onClick={handleAutoFixClick}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-sky-500/25 transition-all hover:scale-[1.02] active:scale-95"
                        >
                            <Wand2 className="w-4 h-4 text-white" />
                            <span>Auto-Fix Ports & Start</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
