import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, Download, CheckCircle, RefreshCw, X, AlertCircle, ExternalLink, Loader2, FileText, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export interface AppUpdateInfo {
    current_version: String;
    latest_version: String;
    update_available: boolean;
    release_notes: String;
    release_date: String;
    download_url?: string;
}

interface AppUpdateModalProps {
    isOpen: boolean;
    onClose: () => void;
    autoCheckOnMount?: boolean;
}

function formatInlineMarkdown(str: string) {
    // Regex split for **bold** and `code`
    const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);

    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const boldText = part.slice(2, -2);
            return (
                <span key={index} className="font-semibold text-white bg-slate-800/80 px-1.5 py-0.5 rounded border border-white/10">
                    {boldText}
                </span>
            );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            const codeText = part.slice(1, -1);
            return (
                <code key={index} className="font-mono text-[11px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20 px-1.5 py-0.5 rounded-md">
                    {codeText}
                </code>
            );
        }
        return part;
    });
}

function renderFormattedMarkdown(text: string) {
    if (!text) return null;

    const lines = text.split('\n');

    return (
        <div className="space-y-2.5 text-xs leading-relaxed text-slate-300 select-text">
            {lines.map((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={idx} className="h-1" />;

                // ## Header
                if (trimmed.startsWith('## ')) {
                    const title = trimmed.replace(/^##\s+/, '');
                    return (
                        <h4 key={idx} className="text-sm font-bold text-sky-400 flex items-center gap-2 pt-2 pb-1 border-b border-sky-500/20">
                            {formatInlineMarkdown(title)}
                        </h4>
                    );
                }

                // ### Header
                if (trimmed.startsWith('### ')) {
                    const title = trimmed.replace(/^###\s+/, '');
                    return (
                        <h5 key={idx} className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 mt-3 mb-1 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                            {formatInlineMarkdown(title)}
                        </h5>
                    );
                }

                // List item '- ' or '* '
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                    const itemText = trimmed.replace(/^[-*]\s+/, '');
                    return (
                        <div key={idx} className="flex items-start gap-2.5 pl-1 group">
                            <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0 group-hover:scale-125 transition-transform" />
                            <div className="flex-1 text-slate-200">
                                {formatInlineMarkdown(itemText)}
                            </div>
                        </div>
                    );
                }

                // Normal paragraph
                return (
                    <p key={idx} className="text-slate-300 leading-relaxed">
                        {formatInlineMarkdown(trimmed)}
                    </p>
                );
            })}
        </div>
    );
}

export default function AppUpdateModal({ isOpen, onClose }: AppUpdateModalProps) {
    const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const checkUpdates = async () => {
        setIsChecking(true);
        setErrorMsg(null);
        try {
            const info = await invoke<AppUpdateInfo>('check_app_update');
            setUpdateInfo(info);
            if (info.update_available) {
                toast.success(`New update available: v${info.latest_version}`);
            } else {
                toast.success('Your ARK Server Manager is up to date!');
            }
        } catch (err) {
            console.error("Failed to check updates:", err);
            setErrorMsg(err instanceof Error ? err.message : String(err));
            toast.error("Failed to check for updates");
        } finally {
            setIsChecking(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            checkUpdates();
        }
    }, [isOpen]);

    const handleInstallUpdate = async () => {
        setIsInstalling(true);
        try {
            toast.loading('Downloading and installing application update...');
            await invoke('install_app_update');
            toast.success('Update installed! Restarting application...');
        } catch (err) {
            console.error("Failed to install update:", err);
            toast.error('Automated update installation requires binary release. Opening download page...');
            if (updateInfo?.download_url) {
                window.open(updateInfo.download_url, '_blank');
            }
        } finally {
            setIsInstalling(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6"
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Modal Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                Application Updates
                                {isChecking && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
                            </h3>
                            <p className="text-xs text-slate-400">Check for and install the latest features & security improvements</p>
                        </div>
                    </div>

                    {/* Content Area */}
                    {isChecking ? (
                        <div className="py-12 text-center space-y-3">
                            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
                            <p className="text-sm font-medium text-slate-300">Checking GitHub for latest release...</p>
                        </div>
                    ) : updateInfo ? (
                        <div className="space-y-4">
                            {/* Version Comparison Card */}
                            <div className="p-4 rounded-xl border bg-slate-950/60 border-slate-800 flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Installed Version</span>
                                    <span className="text-lg font-bold font-mono text-slate-200">v{updateInfo.current_version}</span>
                                </div>

                                <div className="text-center px-4">
                                    <div className="w-8 h-px bg-slate-700 mx-auto mb-1" />
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                                        {updateInfo.update_available ? 'UPDATE READY' : 'LATEST'}
                                    </span>
                                </div>

                                <div className="text-right">
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Latest Version</span>
                                    <span className={`text-lg font-bold font-mono ${updateInfo.update_available ? 'text-emerald-400' : 'text-slate-200'}`}>
                                        v{updateInfo.latest_version}
                                    </span>
                                </div>
                            </div>

                            {/* Status Banner */}
                            {updateInfo.update_available ? (
                                <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-3">
                                    <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-emerald-300">New Version Available!</p>
                                        <p className="text-[11px] text-emerald-200/80">Version {updateInfo.latest_version} is available with performance upgrades and new tools.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-white">Up to Date</p>
                                        <p className="text-[11px] text-slate-400">You are currently running the latest version of ARK Server Manager 2.0.</p>
                                    </div>
                                </div>
                            )}

                            {/* Release Notes Header & Formatted Body */}
                            {updateInfo.release_notes && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <FileText className="w-3.5 h-3.5 text-sky-400" />
                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Release Notes</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(String(updateInfo.release_notes));
                                                toast.success("Release notes copied to clipboard!", { icon: "📋" });
                                            }}
                                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 border border-slate-700 shadow-sm"
                                            title="Copy release notes to clipboard"
                                        >
                                            <Copy className="w-3 h-3 text-sky-400" />
                                            <span>Copy Notes</span>
                                        </button>
                                    </div>

                                    <div className="p-4 bg-slate-950/90 border border-slate-800/90 rounded-2xl max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600 shadow-inner">
                                        {renderFormattedMarkdown(String(updateInfo.release_notes))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : errorMsg ? (
                        <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-center gap-3 text-xs text-rose-300">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <p>{errorMsg}</p>
                        </div>
                    ) : null}

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-800">
                        <button
                            onClick={checkUpdates}
                            disabled={isChecking}
                            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                            <span>Re-Check</span>
                        </button>

                        <div className="flex items-center gap-2">
                            {updateInfo?.download_url && (
                                <a
                                    href={updateInfo.download_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
                                    title="Open GitHub Release Page"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            )}

                            {updateInfo?.update_available ? (
                                <button
                                    onClick={handleInstallUpdate}
                                    disabled={isInstalling}
                                    className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all"
                                >
                                    {isInstalling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    <span>Install Update Now</span>
                                </button>
                            ) : (
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md transition-all"
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
