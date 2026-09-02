import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    AlertTriangle,
    ShieldAlert,
    Wand2,
    RefreshCw,
    CheckCircle2,
    Flame,
    Terminal,
    ChevronDown,
    ChevronRight,
    Info,
    Check,
    Layers,
    Cpu
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useTranslation } from 'react-i18next';
import { diagnoseServerCrash, repairAndRecoverServer } from '../../utils/tauri';
import { CrashDiagnosisReport, ServerRepairOptions } from '../../types';
import { toast } from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';

interface CrashDoctorModalProps {
    isOpen: boolean;
    serverId: number | null;
    serverName?: string;
    onClose: () => void;
    onRepaired?: () => void;
}

export default function CrashDoctorModal({
    isOpen,
    serverId,
    serverName,
    onClose,
    onRepaired,
}: CrashDoctorModalProps) {
    const { t } = useTranslation();

    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<CrashDiagnosisReport | null>(null);
    const [repairing, setRepairing] = useState(false);
    const [repairLogs, setRepairLogs] = useState<string[]>([]);
    const [repairSuccess, setRepairSuccess] = useState(false);
    const [showLogTail, setShowLogTail] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [options, setOptions] = useState<ServerRepairOptions>({
        quarantine_proxy_dlls: true,
        clear_mod_cache: true,
        validate_steam_files: false,
        wipe_wild_dinos: true,
        launch_no_mods: false,
        launch_after_repair: true,
    });

    const runDiagnosis = useCallback(async () => {
        if (!serverId) return;
        setLoading(true);
        setRepairSuccess(false);
        setRepairLogs([]);
        try {
            const data = await diagnoseServerCrash(serverId);
            setReport(data);
            // Adjust defaults based on diagnosis
            setOptions(prev => ({
                ...prev,
                quarantine_proxy_dlls: data.active_proxy_dlls && data.active_proxy_dlls.length > 0,
                clear_mod_cache: data.mod_cache_folder_count > 0,
                wipe_wild_dinos: true,
                validate_steam_files: data.issues.some(i => i.id === 'engine_assertion_failure' || i.id === 'access_violation'),
            }));
        } catch (err: any) {
            console.error('Crash diagnosis failed:', err);
            toast.error(typeof err === 'string' ? err : err?.message || 'Failed to diagnose server');
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    useEffect(() => {
        if (isOpen && serverId) {
            runDiagnosis();
        }
    }, [isOpen, serverId, runDiagnosis]);

    // Listen to real-time server logs during recovery
    useEffect(() => {
        if (!isOpen || !serverId) return;

        let unlisten: (() => void) | undefined;
        listen<{ server_id: number; line: string }>('server_log', (event) => {
            if (event.payload.server_id === serverId) {
                setRepairLogs((prev) => [...prev.slice(-40), event.payload.line]);
            }
        }).then((fn) => {
            unlisten = fn;
        });

        return () => {
            if (unlisten) unlisten();
        };
    }, [isOpen, serverId]);

    if (!isOpen || !serverId) return null;

    const handleExecuteRepair = async () => {
        setRepairing(true);
        setRepairLogs(['[Crash Doctor] Initializing repair sequence...']);
        try {
            await repairAndRecoverServer(serverId, options);
            setRepairSuccess(true);
            toast.success(t('crashDoctor.repairSuccess', 'Server environment healed and startup initiated!'));
            if (onRepaired) {
                onRepaired();
            }
        } catch (err: any) {
            console.error('Server repair error:', err);
            toast.error(typeof err === 'string' ? err : err?.message || 'Failed to recover server');
        } finally {
            setRepairing(false);
        }
    };

    const modalContent = (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900/95 border border-rose-500/30 rounded-2xl shadow-[0_0_50px_rgba(244,63,94,0.15)] w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 backdrop-blur-xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10 bg-slate-950/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-inner">
                            <ShieldAlert className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-white tracking-wide">
                                    {t('crashDoctor.title', 'Crash Doctor & Map Recovery')}
                                </h2>
                                {report?.server_type && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        {report.server_type}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                {serverName || report?.server_name} &bull; Map: <span className="text-slate-200 font-semibold">{report?.map_name || 'Loading...'}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={runDiagnosis}
                            disabled={loading || repairing}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all disabled:opacity-50"
                            title={t('crashDoctor.refresh', 'Re-scan and diagnose')}
                        >
                            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-rose-400")} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                    {loading ? (
                        <div className="py-16 flex flex-col items-center justify-center space-y-4">
                            <div className="relative">
                                <div className="w-12 h-12 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin" />
                                <ShieldAlert className="w-6 h-6 text-rose-400 absolute inset-0 m-auto" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-semibold text-slate-200">Analyzing crash dump and server logs...</p>
                                <p className="text-xs text-slate-400 mt-1">Inspecting proxy DLL hooks, mod cache, and world save integrity</p>
                            </div>
                        </div>
                    ) : report ? (
                        <>
                            {/* Primary Cause Banner */}
                            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/30 shadow-inner flex items-start gap-3.5">
                                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 mt-0.5 shrink-0">
                                    <Flame className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                                            Detected Primary Cause
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-bold text-white mt-0.5">
                                        {report.primary_cause}
                                    </h3>
                                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                        {report.recommended_action}
                                    </p>
                                </div>
                            </div>

                            {/* Key Diagnostic Metrics */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {/* Proxy DLL Status */}
                                <div className={cn(
                                    "p-3 rounded-xl border flex flex-col justify-between",
                                    report.active_proxy_dlls.length > 0 
                                        ? "bg-rose-950/20 border-rose-500/30" 
                                        : "bg-slate-950/40 border-white/5"
                                )}>
                                    <div className="flex items-center justify-between text-slate-400">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider">Proxy DLLs</span>
                                        <Cpu className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="mt-2">
                                        <div className={cn(
                                            "text-sm font-bold",
                                            report.active_proxy_dlls.length > 0 ? "text-rose-400" : "text-emerald-400"
                                        )}>
                                            {report.active_proxy_dlls.length > 0 ? `${report.active_proxy_dlls.length} Active (Crashing)` : "Clean (Quarantined)"}
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                                            {report.active_proxy_dlls.join(', ') || 'No active hooks'}
                                        </div>
                                    </div>
                                </div>

                                {/* Mod Cache */}
                                <div className="p-3 rounded-xl border bg-slate-950/40 border-white/5 flex flex-col justify-between">
                                    <div className="flex items-center justify-between text-slate-400">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider">Mod Cache</span>
                                        <Layers className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="mt-2">
                                        <div className="text-sm font-bold text-white">
                                            {report.mod_cache_folder_count} Cached
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            {(report.mod_cache_size_bytes / (1024 * 1024)).toFixed(1)} MB compiled
                                        </div>
                                    </div>
                                </div>

                                {/* Save World Integrity */}
                                <div className="p-3 rounded-xl border bg-slate-950/40 border-white/5 flex flex-col justify-between">
                                    <div className="flex items-center justify-between text-slate-400">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider">World Save</span>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="mt-2">
                                        <div className="text-sm font-bold text-white">
                                            {report.primary_save_exists ? "Map Save OK" : "New / Fresh Map"}
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            {(report.total_save_size_bytes / (1024 * 1024)).toFixed(1)} MB ({report.save_file_count} files)
                                        </div>
                                    </div>
                                </div>

                                {/* Fatal Errors Logged */}
                                <div className={cn(
                                    "p-3 rounded-xl border flex flex-col justify-between",
                                    report.fatal_error_lines.length > 0
                                        ? "bg-amber-950/20 border-amber-500/30"
                                        : "bg-slate-950/40 border-white/5"
                                )}>
                                    <div className="flex items-center justify-between text-slate-400">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider">Crash Errors</span>
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="mt-2">
                                        <div className={cn(
                                            "text-sm font-bold",
                                            report.fatal_error_lines.length > 0 ? "text-amber-400" : "text-slate-300"
                                        )}>
                                            {report.fatal_error_lines.length} Detected
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                                            {report.fatal_error_lines.length > 0 ? 'In ShooterGame.log' : 'No assert errors'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Issues Breakdown List */}
                            {report.issues.length > 0 && (
                                <div className="space-y-2.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                        <Info className="w-3.5 h-3.5 text-rose-400" />
                                        Identified Crash Factors ({report.issues.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {report.issues.map((issue) => (
                                            <div
                                                key={issue.id}
                                                className="p-3.5 rounded-xl bg-slate-950/50 border border-white/5 hover:border-white/10 transition-all flex items-start gap-3"
                                            >
                                                <div className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mt-0.5 shrink-0",
                                                    issue.severity === 'critical' ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                                                    issue.severity === 'high' ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                                                    "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                                                )}>
                                                    {issue.severity}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h5 className="text-xs font-bold text-slate-200">{issue.title}</h5>
                                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{issue.description}</p>
                                                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                                                        <Check className="w-3 h-3 shrink-0" />
                                                        <span>{issue.fix}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Log Excerpt Viewer */}
                            {report.fatal_error_lines.length > 0 && (
                                <div className="rounded-xl border border-white/10 bg-slate-950/70 overflow-hidden">
                                    <button
                                        onClick={() => setShowLogTail(!showLogTail)}
                                        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:bg-white/5 transition-all"
                                    >
                                        <div className="flex items-center gap-2 text-rose-400">
                                            <Terminal className="w-4 h-4" />
                                            <span>Recent Crash Logs & Fatal Error Callstack ({report.fatal_error_lines.length} lines)</span>
                                        </div>
                                        {showLogTail ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                    {showLogTail && (
                                        <div className="p-3 border-t border-white/5 bg-black/50 text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                                            {report.fatal_error_lines.map((line, idx) => (
                                                <div key={idx} className="text-rose-300/90 whitespace-pre-wrap break-all">
                                                    {line}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Advanced Options Toggle */}
                            <div className="pt-1">
                                <button
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                                >
                                    {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    <span>Customize Healing Pipeline Options</span>
                                </button>

                                {showAdvanced && (
                                    <div className="mt-3 p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-3 animate-in fade-in duration-150">
                                        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={options.quarantine_proxy_dlls}
                                                onChange={(e) => setOptions({ ...options, quarantine_proxy_dlls: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                                            />
                                            <div>
                                                <span className="font-semibold text-white">Quarantine Proxy DLLs (.disabled)</span>
                                                <span className="block text-[11px] text-slate-400">Safely disables version.dll, dxgi.dll, winhttp.dll to prevent immediate process crash</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={options.clear_mod_cache}
                                                onChange={(e) => setOptions({ ...options, clear_mod_cache: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                                            />
                                            <div>
                                                <span className="font-semibold text-white">Purge CFCore Mod Cache</span>
                                                <span className="block text-[11px] text-slate-400">Cleans ShooterGame/Binaries/Win64/ShooterGame/Mods to recompile fresh mod assets</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={options.wipe_wild_dinos}
                                                onChange={(e) => setOptions({ ...options, wipe_wild_dinos: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                                            />
                                            <div>
                                                <span className="font-semibold text-white">Launch with Wild Dino Wipe (-ForceRespawnDinos)</span>
                                                <span className="block text-[11px] text-slate-400">Purges corrupt spawn actors that crash world loading on updated maps</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={options.validate_steam_files}
                                                onChange={(e) => setOptions({ ...options, validate_steam_files: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                                            />
                                            <div>
                                                <span className="font-semibold text-white">Run SteamCMD Full File Verification (validate)</span>
                                                <span className="block text-[11px] text-slate-400">Repairs missing or incomplete game engine binaries (takes 2-5 minutes)</span>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={options.launch_no_mods}
                                                onChange={(e) => setOptions({ ...options, launch_no_mods: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                                            />
                                            <div>
                                                <span className="font-semibold text-white">Safe Recovery Mode (Start Without Mods)</span>
                                                <span className="block text-[11px] text-slate-400">Boots pure vanilla map to verify base game and save file health</span>
                                            </div>
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* Repair Real-time Console Log Output */}
                            {repairLogs.length > 0 && (
                                <div className="p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto custom-scrollbar space-y-1 shadow-inner">
                                    {repairLogs.map((log, idx) => (
                                        <div key={idx} className="leading-tight text-emerald-400/90">
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : null}
                </div>

                {/* Footer Controls */}
                <div className="p-5 border-t border-white/10 bg-slate-950/60 shrink-0 flex items-center justify-between gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                    >
                        {repairSuccess ? t('common.close', 'Close') : t('common.cancel', 'Cancel')}
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExecuteRepair}
                            disabled={repairing || loading}
                            className={cn(
                                "px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer",
                                repairSuccess
                                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50"
                                    : "bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-950/50 hover:scale-[1.02] active:scale-[0.98]",
                                (repairing || loading) && "opacity-50 pointer-events-none"
                            )}
                        >
                            {repairing ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Healing Server Environment...</span>
                                </>
                            ) : repairSuccess ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Healed & Launched Cleanly</span>
                                </>
                            ) : (
                                <>
                                    <Wand2 className="w-4 h-4" />
                                    <span>1-Click Auto-Fix & Launch Map</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
