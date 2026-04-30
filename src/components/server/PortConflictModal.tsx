import { X, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useTranslation } from 'react-i18next';
import { ConflictCheckResult } from '../../utils/tauri';

interface PortConflictModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    result: ConflictCheckResult | null;
}

export default function PortConflictModal({
    isOpen,
    onClose,
    onConfirm,
    result,
}: PortConflictModalProps) {
    const { t } = useTranslation();

    if (!isOpen || !result) return null;

    const isHardConflict = result.has_active_conflicts;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className={cn(
                "bg-slate-900 border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200",
                isHardConflict ? "border-red-500/20" : "border-amber-500/20"
            )}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-3 rounded-xl",
                            isHardConflict ? "bg-red-500/10" : "bg-amber-500/10"
                        )}>
                            {isHardConflict ? (
                                <ShieldAlert className="w-6 h-6 text-red-400" />
                            ) : (
                                <AlertTriangle className="w-6 h-6 text-amber-400" />
                            )}
                        </div>
                        <h2 className="text-lg font-bold text-white">
                            {isHardConflict ? t('serverManager.conflicts.hardTitle', 'Critical Port Conflict') : t('serverManager.conflicts.softTitle', 'Port Conflict Warning')}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <p className="text-slate-300 leading-relaxed text-sm">
                        {isHardConflict 
                            ? t('serverManager.conflicts.hardMessage', 'One or more ports are currently in use by active processes. You cannot start this server until the conflicting processes are stopped.')
                            : t('serverManager.conflicts.softMessage', 'One or more ports are configured on other server profiles. Since those servers are currently offline, you can safely start this server.')
                        }
                    </p>

                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
                        <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700/50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            {t('serverManager.conflicts.detectedConflicts', 'Detected Conflicts')}
                        </div>
                        <div className="divide-y divide-slate-700/50 max-h-48 overflow-y-auto">
                            {result.conflicts.map((conflict, idx) => (
                                <div key={idx} className="p-4 flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-white">{conflict.port_type} Port ({conflict.port_number})</span>
                                        {conflict.is_running ? (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
                                                {t('common.status.online', 'Online')}
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-500/20 text-slate-400">
                                                {t('common.status.offline', 'Offline')}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-sm text-slate-400">
                                        {conflict.conflicting_server_name 
                                            ? `${t('serverManager.conflicts.usedBy', 'Used by:')} ${conflict.conflicting_server_name}`
                                            : t('serverManager.conflicts.unknownProcess', 'Used by an unknown external process')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700/50 bg-slate-800/30">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-all font-medium"
                    >
                        {isHardConflict ? t('common.close', 'Close') : t('dialogs.confirm.cancel', 'Cancel')}
                    </button>
                    {!isHardConflict && (
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className="px-5 py-2.5 text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-lg font-medium transition-all"
                        >
                            {t('serverManager.conflicts.startAnyway', 'Start Anyway')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
