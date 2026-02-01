import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, EyeOff, ExternalLink, CheckCircle, AlertCircle, HelpCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '../../utils/helpers';

interface ApiKeyCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    color: 'sky' | 'violet';
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    isVerified?: boolean;
    onVerify?: () => Promise<void>;
    verifyButtonText?: string;
    helpContent?: React.ReactNode;
    links?: {
        label: string;
        url: string;
        icon?: React.ReactNode;
    }[];
    statusMessage?: {
        type: 'success' | 'warning' | 'error' | 'info';
        text: string;
    } | null;
}

export default function ApiKeyCard({
    title,
    description,
    icon,
    color,
    value,
    onChange,
    placeholder,
    isVerified,
    onVerify,
    verifyButtonText = "Verify Key",
    helpContent,
    links,
    statusMessage
}: ApiKeyCardProps) {
    const [showKey, setShowKey] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    const themeColors = {
        sky: {
            bg: 'bg-sky-500/10',
            border: 'border-sky-500/20',
            text: 'text-sky-400',
            focus: 'focus:ring-sky-500',
            button: 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20',
        },
        violet: {
            bg: 'bg-violet-500/10',
            border: 'border-violet-500/20',
            text: 'text-violet-400',
            focus: 'focus:ring-violet-500',
            button: 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/20',
        },
    };

    const styles = themeColors[color];

    const handleVerifyClick = async () => {
        if (!onVerify) return;
        setIsVerifying(true);
        try {
            await onVerify();
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-6 lg:p-8 relative overflow-hidden group"
        >
            {/* Header */}
            <div className="flex items-start gap-5 mb-8 relative z-10">
                <div className={cn("p-4 rounded-2xl border transition-all duration-300 group-hover:scale-110", styles.bg, styles.border)}>
                    <div className={cn("w-8 h-8", styles.text)}>
                        {icon}
                    </div>
                </div>
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-2xl">
                        {description}
                    </p>
                </div>
            </div>

            {/* Input Section */}
            <div className="space-y-6 relative z-10">
                <div className="relative group/input">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 ml-1">
                        API Key Configuration
                    </label>
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within/input:text-white">
                            <Lock className="w-5 h-5" />
                        </div>
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder}
                            className={cn(
                                "w-full pl-12 pr-14 py-4 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-600 font-mono text-sm transition-all duration-300",
                                "focus:outline-none focus:ring-2 focus:border-transparent focus:bg-slate-900",
                                styles.focus
                            )}
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
                        >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Actions & Status */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        {onVerify && (
                            <button
                                onClick={handleVerifyClick}
                                disabled={!value || isVerifying}
                                className={cn(
                                    "flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto",
                                    isVerified ? "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-slate-700 hover:bg-slate-600 border border-slate-600"
                                )}
                            >
                                {isVerifying ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isVerified ? (
                                    <CheckCircle className="w-4 h-4" />
                                ) : (
                                    <CheckCircle className="w-4 h-4 opacity-50" />
                                )}
                                <span>{isVerified ? "Verified" : isVerifying ? "Verifying..." : verifyButtonText}</span>
                            </button>
                        )}

                        {links?.map((link, idx) => (
                            <a
                                key={idx}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                    "flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all font-medium w-full sm:w-auto text-sm"
                                )}
                            >
                                {link.icon || <ExternalLink className="w-4 h-4" />}
                                <span>{link.label}</span>
                            </a>
                        ))}
                    </div>

                    {statusMessage && (
                        <div className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium w-full sm:w-auto justify-center sm:justify-end",
                            statusMessage.type === 'success' && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                            statusMessage.type === 'warning' && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                            statusMessage.type === 'error' && "bg-red-500/10 text-red-400 border border-red-500/20",
                            statusMessage.type === 'info' && "bg-slate-500/10 text-slate-400 border border-slate-500/20",
                        )}>
                            {statusMessage.type === 'success' && <CheckCircle className="w-4 h-4" />}
                            {statusMessage.type === 'warning' && <AlertCircle className="w-4 h-4" />}
                            {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4" />}
                            <span>{statusMessage.text}</span>
                        </div>
                    )}
                </div>

                {/* Collapsible Help */}
                {helpContent && (
                    <div className="border-t border-slate-800/50 pt-4">
                        <button
                            onClick={() => setShowHelp(!showHelp)}
                            className="flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors group/help outline-none"
                        >
                            <HelpCircle className="w-4 h-4 group-hover/help:text-sky-400 transition-colors" />
                            <span>How do I get this key?</span>
                            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        <AnimatePresence>
                            {showHelp && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="pt-4 text-sm text-slate-400 space-y-2 pl-6 border-l-2 border-slate-800 ml-2 mt-2">
                                        {helpContent}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Background Decor */}
            <div className={cn("absolute top-0 right-0 w-64 h-64 bg-gradient-to-br opacity-5 rounded-full blur-3xl -z-0 pointer-events-none transform translate-x-1/3 -translate-y-1/3", styles.text)} />
        </motion.div>
    );
}
