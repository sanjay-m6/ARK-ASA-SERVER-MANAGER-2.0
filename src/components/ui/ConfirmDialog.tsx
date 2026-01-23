import { X, AlertTriangle, Trash2, CheckCircle } from 'lucide-react';
import { cn } from '../../utils/helpers';

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
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    isLoading = false,
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            icon: Trash2,
            iconBg: 'bg-red-500/10',
            iconColor: 'text-red-400',
            buttonBg: 'bg-red-500 hover:bg-red-400',
            borderColor: 'border-red-500/20',
        },
        warning: {
            icon: AlertTriangle,
            iconBg: 'bg-amber-500/10',
            iconColor: 'text-amber-400',
            buttonBg: 'bg-amber-500 hover:bg-amber-400',
            borderColor: 'border-amber-500/20',
        },
        success: {
            icon: CheckCircle,
            iconBg: 'bg-emerald-500/10',
            iconColor: 'text-emerald-400',
            buttonBg: 'bg-emerald-500 hover:bg-emerald-400',
            borderColor: 'border-emerald-500/20',
        },
    };

    const style = variantStyles[variant];
    const Icon = style.icon;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className={cn(
                "bg-slate-900 border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200",
                style.borderColor
            )}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-3 rounded-xl", style.iconBg)}>
                            <Icon className={cn("w-6 h-6", style.iconColor)} />
                        </div>
                        <h2 className="text-lg font-bold text-white">{title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-slate-300 leading-relaxed">{message}</p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700/50 bg-slate-800/30">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-5 py-2.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-all font-medium disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={cn(
                            "px-5 py-2.5 text-white rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50",
                            style.buttonBg
                        )}
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Processing...
                            </>
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
