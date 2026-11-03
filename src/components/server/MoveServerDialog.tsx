import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, AlertTriangle, X, Check, FolderOpen, FolderInput, Edit3, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MoveServerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (destinationPath?: string) => void;
    isBulk?: boolean;
    serverCount?: number;
    serverName?: string;
    currentPath?: string;
    targetPath?: string;
    onBrowseFolder?: () => void;
}

export default function MoveServerDialog({
    isOpen,
    onClose,
    onConfirm,
    isBulk = false,
    serverCount = 0,
    serverName = '',
    currentPath = '',
    targetPath = '',
    onBrowseFolder
}: MoveServerDialogProps) {
    const { t } = useTranslation();

    // Editable folder name state for single-server move
    const [customFolderName, setCustomFolderName] = useState('');
    const [baseDirectory, setBaseDirectory] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        const effectiveTarget = targetPath || currentPath || '';
        if (effectiveTarget) {
            const normalized = effectiveTarget.replace(/\\/g, '/').replace(/\/+$/, '');
            const lastSlash = normalized.lastIndexOf('/');
            if (lastSlash !== -1) {
                setBaseDirectory(normalized.substring(0, lastSlash));
                setCustomFolderName(normalized.substring(lastSlash + 1));
            } else {
                setBaseDirectory(normalized);
                setCustomFolderName('');
            }
        }
    }, [isOpen, targetPath, currentPath]);

    if (typeof document === 'undefined') return null;

    const computedTargetPath = baseDirectory && customFolderName 
        ? `${baseDirectory}/${customFolderName}`.replace(/\//g, '\\')
        : (targetPath || currentPath);

    const handleConfirm = () => {
        onConfirm(computedTargetPath);
        onClose();
    };

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
                                        {t('serverManager.move.storageMigration', 'STORAGE MIGRATION')}
                                    </span>
                                    <h2 className="text-lg font-bold text-white tracking-tight truncate">
                                        {isBulk 
                                            ? t('serverManager.move.dialogTitleBulk', 'Move Multiple Servers')
                                            : t('serverManager.move.dialogTitle', 'Move / Rename Server Folder')}
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
                                        defaultValue: `Change the folder name or relocate the server installation for "${serverName}".` 
                                      })}
                            </div>

                            {/* Path and Folder Name Details */}
                            {!isBulk && (currentPath || targetPath) && (
                                <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 space-y-3 shadow-inner">
                                    {currentPath && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                                                {t('serverManager.move.currentLocation', 'Current Folder Path')}
                                            </span>
                                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-white/5 text-slate-300 font-mono text-xs break-all select-all">
                                                <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span className="truncate" title={currentPath}>{currentPath}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Editable Destination Folder Name */}
                                    <div className="space-y-1.5 pt-1">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] uppercase font-bold tracking-wider text-sky-400 flex items-center gap-1.5">
                                                <Edit3 className="w-3 h-3 text-sky-400" />
                                                <span>{t('serverManager.move.targetFolderName', 'Folder Name')}</span>
                                            </label>
                                            {onBrowseFolder && (
                                                <button
                                                    type="button"
                                                    onClick={onBrowseFolder}
                                                    className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                                                >
                                                    <FolderInput className="w-3 h-3" />
                                                    <span>{t('common.browse', 'Browse Folder...')}</span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={customFolderName}
                                                onChange={(e) => setCustomFolderName(e.target.value.replace(/[\\/:*?"<>|]/g, ''))}
                                                placeholder="e.g. server1, TheIsland..."
                                                className="w-full px-3 py-2 bg-slate-900 border border-sky-500/30 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 shadow-inner"
                                            />
                                        </div>

                                        {/* Resulting Destination Preview */}
                                        <div className="pt-1.5 flex items-start gap-1.5 text-[11px] text-slate-400">
                                            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                                                    {t('serverManager.move.newLocation', 'New Path Preview')}:
                                                </span>
                                                <span className="font-mono text-emerald-400 break-all select-all font-semibold">
                                                    {computedTargetPath}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isBulk && targetPath && (
                                <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 space-y-2 shadow-inner">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400 block">
                                            {t('serverManager.move.destinationDirectory', 'Destination Directory')}
                                        </span>
                                        {onBrowseFolder && (
                                            <button
                                                type="button"
                                                onClick={onBrowseFolder}
                                                className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                                            >
                                                <FolderInput className="w-3 h-3" />
                                                <span>{t('common.browse', 'Browse...')}</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-white/5 text-emerald-400 font-mono text-xs break-all select-all">
                                        <FolderInput className="w-4 h-4 text-sky-400 shrink-0" />
                                        <span className="truncate font-semibold" title={targetPath}>{targetPath}</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-start gap-3.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                                <div className="text-xs text-amber-200/90 leading-relaxed">
                                    <p className="font-bold text-amber-400 uppercase tracking-wider text-[11px] mb-0.5">
                                        {t('serverManager.move.warningTitle', 'Safe Migration')}
                                    </p>
                                    <p>
                                        {t('serverManager.move.warningDesc', 'Renaming on the same drive is instant. Across different drives, files will be copied safely. Please ensure the server remains stopped during this process.')}
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
                                onClick={handleConfirm}
                                disabled={!computedTargetPath}
                                className="px-6 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 text-white bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-[0_0_24px_rgba(14,165,233,0.4)] hover:shadow-[0_0_32px_rgba(14,165,233,0.6)] border border-sky-400/40 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            >
                                <Check className="h-4 w-4" />
                                <span>{t('serverManager.move.confirmMove', 'Confirm Move / Rename')}</span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
