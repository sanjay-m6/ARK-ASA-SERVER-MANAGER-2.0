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

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
                        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-700/50 p-5 bg-slate-800/30">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                                    <HardDrive className="h-5 w-5" />
                                </div>
                                <h2 className="text-xl font-semibold text-white">
                                    {isBulk 
                                        ? t('serverManager.move.dialogTitleBulk', 'Move Multiple Servers')
                                        : t('serverManager.move.dialogTitle', 'Move Server')}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            <p className="mb-4 text-slate-300">
                                {isBulk
                                    ? t('serverManager.move.dialogDescBulk', { 
                                        count: serverCount, 
                                        defaultValue: `Are you sure you want to move ${serverCount} servers to the new location?` 
                                      })
                                    : t('serverManager.move.dialogDesc', { 
                                        name: serverName, 
                                        defaultValue: `Are you sure you want to move ${serverName} to the new location?` 
                                      })}
                            </p>

                            <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                                <div className="text-sm text-amber-200/90">
                                    <p className="font-medium text-amber-500">
                                        {t('serverManager.move.warningTitle', 'Time-consuming operation')}
                                    </p>
                                    <p className="mt-1">
                                        {t('serverManager.move.warningDesc', 'Depending on the size of the save data and server files, this operation may take several minutes. Please do not close the application during this process.')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 border-t border-slate-700/50 bg-slate-800/30 p-5">
                            <button
                                onClick={onClose}
                                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-blue-500/40 active:scale-95"
                            >
                                <Check className="h-4 w-4" />
                                {t('serverManager.move.confirmMove', 'Confirm Move')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
