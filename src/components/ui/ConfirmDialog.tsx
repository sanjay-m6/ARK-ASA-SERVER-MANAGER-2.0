import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, CheckCircle, AlertOctagon } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'success';
    isLoading?: boolean;
}

export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    variant = 'danger',
    isLoading = false,
}: ConfirmDialogProps) {
    const { t } = useTranslation();

    // Default values from translation if not provided
    const effectiveConfirmText = confirmText || t('dialogs.confirm.confirm', 'Confirm');
    const effectiveCancelText = cancelText || t('dialogs.confirm.cancel', 'Cancel');

    const variantStyles = {
        danger: {
            icon: AlertOctagon,
            badgeText: 'Critical Action',
            badgeBg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
            iconBg: 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.25)]',
            buttonBg: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.35)] hover:shadow-[0_0_28px_rgba(244,63,94,0.55)] border border-rose-400/30',
            glowColor: 'bg-rose-500/15',
            borderColor: 'border-rose-500/30',
            cardGlow: 'shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(244,63,94,0.12)]',
        },
        warning: {
            icon: AlertTriangle,
            badgeText: 'Warning',
            badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
            iconBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]',
            buttonBg: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:shadow-[0_0_28px_rgba(245,158,11,0.55)] border border-amber-400/30',
            glowColor: 'bg-amber-500/15',
            borderColor: 'border-amber-500/30',
            cardGlow: 'shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(245,158,11,0.12)]',
        },
        success: {
            icon: CheckCircle,
            badgeText: 'Confirmation',
            badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
            iconBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]',
            buttonBg: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.35)] hover:shadow-[0_0_28px_rgba(16,185,129,0.55)] border border-emerald-400/30',
            glowColor: 'bg-emerald-500/15',
            borderColor: 'border-emerald-500/30',
            cardGlow: 'shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_50px_rgba(16,185,129,0.12)]',
        },
    };

    const style = variantStyles[variant];
    const Icon = style.icon;

    if (typeof document === 'undefined') return null;

    // Parse message into main text and warning blocks if any
    const messageParts = message.split(/\n\n(?=⚠️|WARNING:)/i);
    const mainBody = messageParts[0] || message;
    const warningCallout = messageParts.length > 1 ? messageParts.slice(1).join('\n\n') : null;

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
                        onClick={isLoading ? undefined : onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md"
                    />

                    {/* Ambient Background Glow Behind Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.3 }}
                        className={cn(
                            "absolute w-96 h-96 rounded-full blur-[100px] pointer-events-none -z-10",
                            style.glowColor
                        )}
                    />

                    {/* Dialog Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.93, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className={cn(
                            "relative w-full max-w-lg overflow-hidden rounded-3xl border bg-[var(--surface)] backdrop-blur-2xl ring-1 ring-white/10 shadow-2xl",
                            style.borderColor,
                            style.cardGlow
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Decorative Top Radial Glow */}
                        <div className={cn(
                            "absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-40",
                            style.glowColor
                        )} />

                        {/* Header */}
                        <div className="relative flex items-center justify-between p-5 border-b border-[var(--border)] bg-[var(--surface-active)]/30">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className={cn("w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0", style.iconBg)}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border uppercase", style.badgeBg)}>
                                            {style.badgeText}
                                        </span>
                                    </div>
                                    <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight truncate">{title}</h2>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="w-8 h-8 rounded-full bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0 ml-2"
                                title={effectiveCancelText}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="p-5 space-y-3.5">
                            <div className="bg-[var(--bg-primary)]/70 rounded-2xl border border-[var(--border)] p-4 text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-line shadow-inner">
                                {mainBody}
                            </div>

                            {warningCallout && (
                                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs text-amber-200/90 leading-relaxed shadow-sm">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div className="whitespace-pre-line">
                                        {warningCallout.replace(/^⚠️\s*/, '')}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Action Controls */}
                        <div className="flex items-center justify-end gap-2.5 p-4 border-t border-[var(--border)] bg-[var(--surface-active)]/40">
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="px-4 py-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] border border-[var(--border)] font-medium text-xs transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                            >
                                {effectiveCancelText}
                            </button>
                            <button
                                onClick={onConfirm}
                                disabled={isLoading}
                                className={cn(
                                    "px-5 py-2 rounded-xl font-semibold text-xs transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
                                    style.buttonBg
                                )}
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <span>{effectiveConfirmText}</span>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
