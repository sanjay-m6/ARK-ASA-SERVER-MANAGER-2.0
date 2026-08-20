import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, AlertTriangle, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
interface MoveServerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isBulk?: boolean;
    serverCount?: number;
    serverName?: string;
}

export default function MoveServerDialog({
    isOpen,
    onClose,
    onConfirm,
    isBulk = false,
    serverCount = 0,
    serverName = ''
}: MoveServerDialogProps) {
    const { t } = useTranslation();

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
                    />

                    {/* Ambient Background Glow Behind Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3 }}
                        className="absolute w-96 h-96 rounded-full blur-[100px] pointer-events-none -z-10 bg-sky-500/15"
                    />

                    {/* Dialog Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.93, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-sky-500/25 bg-slate-900/95 backdrop-blur-2xl shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(14,165,233,0.12)] ring-1 ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Decorative Top Radial Orb */}
                        <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-40 bg-sky-500/15" />

                        {/* Header */}
                        <div className="relative flex items-center justify-between p-6 border-b border-white/10 bg-slate-950/40">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="w-12 h-12 rounded-2xl border border-sky-500/30 bg-sky-500/15 text-sky-400 shadow-[0_0_20px_rgba(14,165,233,0.3)] flex items-center justify-center shrink-0">
                                    <HardDrive className="h-6 w-6" />
                                </div>
                                <div className="min-w-0">
                                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider border uppercase mb-1 bg-sky-500/10 border-sky-500/30 text-sky-400">
                                        STORAGE MIGRATION
                                    </span>
                                    <h2 className="text-lg font-bold text-white tracking-tight truncate">
                                        {isBulk 
                                            ? t('serverManager.move.dialogTitleBulk', 'Move Multiple Servers')
                                            : t('serverManager.move.dialogTitle', 'Move Server')}
                                    </h2>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 ml-2"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-4">
                            <div className="bg-slate-950/50 rounded-2xl border border-white/5 p-4 text-slate-300 text-sm leading-relaxed shadow-inner">
                                {isBulk
                                    ? t('serverManager.move.dialogDescBulk', { 
                                        count: serverCount, 
                                        defaultValue: `Are you sure you want to move ${serverCount} servers to the new location?` 
                                      })
                                    : t('serverManager.move.dialogDesc', { 
                                        name: serverName, 
                                        defaultValue: `Are you sure you want to move ${serverName} to the new location?` 
                                      })}
                            </div>

                            <div className="flex items-start gap-3.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                                <div className="text-xs text-amber-200/90 leading-relaxed">
                                    <p className="font-bold text-amber-400 uppercase tracking-wider text-[11px] mb-0.5">
                                        {t('serverManager.move.warningTitle', 'Time-consuming operation')}
                                    </p>
                                    <p>
                                        {t('serverManager.move.warningDesc', 'Depending on the size of the save data and server files, this operation may take several minutes. Please do not close the application during this process.')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-slate-950/60">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/90 border border-white/10 font-bold text-xs tracking-wider uppercase transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className="px-6 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 text-white bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-[0_0_24px_rgba(14,165,233,0.4)] hover:shadow-[0_0_32px_rgba(14,165,233,0.6)] border border-sky-400/40 cursor-pointer"
                            >
                                <Check className="h-4 w-4" />
                                <span>{t('serverManager.move.confirmMove', 'Confirm Move')}</span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
