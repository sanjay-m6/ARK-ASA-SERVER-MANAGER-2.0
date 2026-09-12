import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    X,
    Upload,
    Shield,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    Terminal,
    Sparkles,
    Square,
    CheckSquare
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { pushModUpdates, type ModUpdateInfo, type PushModUpdatesResult } from '../../utils/tauri';
import toast from 'react-hot-toast';

interface PushModUpdatesModalProps {
    isOpen: boolean;
    serverId: number;
    serverName: string;
    isServerRunning: boolean;
    modsToUpdate: ModUpdateInfo[];
    onClose: () => void;
    onSuccess: (result: PushModUpdatesResult) => void;
}

export default function PushModUpdatesModal({
    isOpen,
    serverId,
    serverName,
    isServerRunning,
    modsToUpdate,
    onClose,
    onSuccess,
}: PushModUpdatesModalProps) {
    const { t } = useTranslation();

    const [selectedModIds, setSelectedModIds] = useState<Set<string>>(() => {
        return new Set(modsToUpdate.map(m => m.modId));
    });

    const [restartServer, setRestartServer] = useState(isServerRunning);
    const [warningMinutes, setWarningMinutes] = useState<number>(1);
    const [isPushing, setIsPushing] = useState(false);
    const [pushStep, setPushStep] = useState<string>('');

    React.useEffect(() => {
        if (isOpen) {
            setSelectedModIds(new Set(modsToUpdate.map(m => m.modId)));
            setRestartServer(isServerRunning);
            setIsPushing(false);
            setPushStep('');
        }
    }, [isOpen, modsToUpdate, isServerRunning]);

    if (!isOpen) return null;

    const handleToggleMod = (modId: string) => {
        const next = new Set(selectedModIds);
        if (next.has(modId)) {
            next.delete(modId);
        } else {
            next.add(modId);
        }
        setSelectedModIds(next);
    };

    const handleToggleAll = () => {
        if (selectedModIds.size === modsToUpdate.length) {
            setSelectedModIds(new Set());
        } else {
            setSelectedModIds(new Set(modsToUpdate.map(m => m.modId)));
        }
    };

    const formatDate = (isoStr?: string) => {
        if (!isoStr) return 'Unknown';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return isoStr;
        }
    };

    const handleExecutePush = async () => {
        if (selectedModIds.size === 0) {
            toast.error(t('modManager.selectAtLeastOneMod', 'Please select at least one mod to update.'));
            return;
        }

        setIsPushing(true);
        setPushStep(t('modManager.pushStepBackup', 'Creating rollback backups & clearing stale cache...'));

        try {
            if (isServerRunning && restartServer && warningMinutes > 0) {
                setPushStep(
                    t('modManager.pushStepWarning', 'Broadcasting in-game warnings & countdown ({{mins}}m)...', { mins: warningMinutes })
                );
            }

            const targetIds = Array.from(selectedModIds);
            const result = await pushModUpdates(
                serverId,
                targetIds,
                restartServer,
                warningMinutes
            );

            if (result.success) {
                toast.success(result.message, { duration: 5000 });
                onSuccess(result);
                onClose();
            } else {
                toast.error(result.message || t('modManager.updateFailed', 'Failed to push mod updates'));
            }
        } catch (err: unknown) {
            console.error('Failed to push mod updates:', err);
            const errorMsg = typeof err === 'string' ? err : (err as Error)?.message || 'Failed to push updates';
            toast.error(errorMsg);
        } finally {
            setIsPushing(false);
            setPushStep('');
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-950/40">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl text-emerald-400">
                            <Upload className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-white">
                                    {t('modManager.pushUpdatesTitle', 'Push Mod Updates')}
                                </h3>
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5",
                                    isServerRunning
                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                        : "bg-slate-800 text-slate-400 border-slate-700"
                                )}>
                                    <span className={cn(
                                        "w-2 h-2 rounded-full",
                                        isServerRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                                    )} />
                                    {isServerRunning ? t('common.serverRunning', 'Server Online') : t('common.serverOffline', 'Server Offline')}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {serverName} &bull; {selectedModIds.size} of {modsToUpdate.length} mod(s) selected
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={isPushing}
                        className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Protection Highlight Banner */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <span className="font-bold text-emerald-300 block mb-0.5">Rollback Protection</span>
                                <span className="text-slate-300 leading-relaxed">
                                    Current files will be backed up into <code className="text-emerald-400 font-mono">ModBackups/</code> before updating.
                                </span>
                            </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-start gap-3">
                            <Sparkles className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <span className="font-bold text-sky-300 block mb-0.5">Fresh Pak Purge</span>
                                <span className="text-slate-300 leading-relaxed">
                                    Clears stale mod cache in <code className="text-sky-400 font-mono">ShooterGame/Mods/</code> to prevent crash-on-boot.
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Mod Selection List */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                Mods to Update ({selectedModIds.size}/{modsToUpdate.length})
                            </label>
                            <button
                                type="button"
                                onClick={handleToggleAll}
                                className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1"
                            >
                                {selectedModIds.size === modsToUpdate.length ? (
                                    <>
                                        <Square className="w-3.5 h-3.5" />
                                        <span>Deselect All</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        <span>Select All</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {modsToUpdate.map((mod) => {
                                const isSelected = selectedModIds.has(mod.modId);
                                return (
                                    <div
                                        key={mod.modId}
                                        onClick={() => handleToggleMod(mod.modId)}
                                        className={cn(
                                            "p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer",
                                            isSelected
                                                ? "bg-slate-800/90 border-emerald-500/40 shadow-sm"
                                                : "bg-slate-900/50 border-white/5 opacity-60 hover:opacity-100"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="text-emerald-400 shrink-0">
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                                                ) : (
                                                    <Square className="w-4 h-4 text-slate-500" />
                                                )}
                                            </div>

                                            {mod.thumbnailUrl ? (
                                                <img
                                                    src={mod.thumbnailUrl}
                                                    alt={mod.name}
                                                    className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0"
                                                />
                                            ) : (
                                                <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                                                    <Terminal className="w-4 h-4" />
                                                </div>
                                            )}

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white text-sm truncate">{mod.name}</span>
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 font-mono text-[10px] border border-white/10">
                                                        #{mod.modId}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                                    {mod.latestVersion && (
                                                        <span className="text-emerald-400 font-semibold truncate">
                                                            {mod.latestVersion}
                                                        </span>
                                                    )}
                                                    {mod.latestUpdatedAt && (
                                                        <span>Updated: {formatDate(mod.latestUpdatedAt)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0">
                                            Update Available
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Server Running Restart Workflow */}
                    {isServerRunning ? (
                        <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 text-sky-400" />
                                    <span className="text-sm font-bold text-white">Restart Server to Apply Immediately</span>
                                </div>
                                <input
                                    type="checkbox"
                                    id="restartToggle"
                                    checked={restartServer}
                                    onChange={(e) => setRestartServer(e.target.checked)}
                                    className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900 cursor-pointer"
                                />
                            </div>

                            {restartServer ? (
                                <div className="space-y-3 pt-2 border-t border-white/5 text-xs text-slate-300">
                                    <p className="leading-relaxed">
                                        The manager will send in-game warning broadcasts via RCON, safely save the world (<code className="text-emerald-400 font-mono">saveworld</code>), gracefully stop, clear cache, and reboot.
                                    </p>

                                    <div className="flex items-center gap-3">
                                        <span className="text-slate-400 font-medium">In-Game Warning Countdown:</span>
                                        <div className="flex items-center gap-1.5">
                                            {[0, 1, 3, 5].map((mins) => (
                                                <button
                                                    key={mins}
                                                    type="button"
                                                    onClick={() => setWarningMinutes(mins)}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                                                        warningMinutes === mins
                                                            ? "bg-sky-500 text-white shadow-sm"
                                                            : "bg-slate-800 text-slate-400 hover:text-white"
                                                    )}
                                                >
                                                    {mins === 0 ? 'Immediate' : `${mins} min`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="pt-2 border-t border-white/5 text-xs text-amber-300/90 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                    <span>Server will NOT restart now. Stale cache is wiped; updates take effect on next server boot.</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2 text-xs text-slate-300">
                            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Server is Offline & Ready</span>
                            </div>
                            <p className="leading-relaxed">
                                Pushing updates will purge outdated pak cache and update your local configurations. The server will download the latest mod files upon next startup.
                            </p>
                        </div>
                    )}

                    {/* In-flight step feedback */}
                    {isPushing && (
                        <div className="p-3.5 rounded-2xl bg-sky-950/50 border border-sky-500/30 flex items-center gap-3 text-sky-300 text-xs animate-pulse">
                            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                            <span className="font-semibold">{pushStep}</span>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-5 border-t border-white/10 bg-slate-950/50 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPushing}
                        className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors disabled:opacity-40"
                    >
                        {t('common.cancel', 'Cancel')}
                    </button>

                    <button
                        type="button"
                        onClick={handleExecutePush}
                        disabled={isPushing || selectedModIds.size === 0}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isPushing ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>{t('modManager.pushingUpdates', 'Pushing Updates...')}</span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                <span>
                                    {t('modManager.pushUpdatesBtn', 'Push {{count}} Mod Update(s)', { count: selectedModIds.size })}
                                </span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
