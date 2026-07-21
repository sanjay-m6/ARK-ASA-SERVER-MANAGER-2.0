import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AlertTriangle, X, Minimize2, LogOut, CheckSquare, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useServerStore } from '../../stores/serverStore';

interface CloseAppModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CloseAppModal({ isOpen, onClose }: CloseAppModalProps) {
    const { servers } = useServerStore();
    const runningServers = servers.filter((s) => s.status === 'running' || s.status === 'online').length;

    const [selectedAction, setSelectedAction] = useState<'tray' | 'exit'>('tray');
    const [rememberChoice, setRememberChoice] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (rememberChoice) {
            localStorage.setItem('rememberCloseAction', 'true');
            localStorage.setItem('closeActionPreference', selectedAction);
        }

        const appWindow = getCurrentWindow();

        if (selectedAction === 'tray') {
            onClose();
            try {
                await appWindow.hide();
            } catch (err) {
                console.error("Failed to hide window to tray:", err);
                await appWindow.minimize();
            }
        } else {
            try {
                await appWindow.close();
            } catch (err) {
                console.error("Failed to close window:", err);
            }
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6"
                >
                    {/* Top Close X button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Header Icon & Title */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Close Application?</h3>
                            <p className="text-xs text-slate-400">Choose how you want to handle closing the application</p>
                        </div>
                    </div>

                    {/* Active Servers Warning Alert */}
                    {runningServers > 0 && (
                        <div className="mb-4 p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                            <div className="text-xs text-amber-200">
                                <p className="font-semibold text-amber-300">Warning: {runningServers} Active Server{runningServers > 1 ? 's' : ''} Running</p>
                                <p className="text-amber-200/80 mt-0.5">Completely exiting will stop background cross-chat relays and RCON monitoring.</p>
                            </div>
                        </div>
                    )}

                    {/* Action Selection */}
                    <div className="space-y-3 my-4">
                        {/* Option 1: Tray */}
                        <button
                            type="button"
                            onClick={() => setSelectedAction('tray')}
                            className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                                selectedAction === 'tray'
                                    ? 'bg-purple-600/20 border-purple-500 text-white shadow-md shadow-purple-500/10'
                                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedAction === 'tray' ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                    <Minimize2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="font-semibold text-sm block text-white">Minimize to System Tray</span>
                                    <span className="text-xs text-slate-400">Keeps game servers & cross-chat running silently in background</span>
                                </div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedAction === 'tray' ? 'border-purple-400 bg-purple-500' : 'border-slate-600'}`}>
                                {selectedAction === 'tray' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                        </button>

                        {/* Option 2: Exit */}
                        <button
                            type="button"
                            onClick={() => setSelectedAction('exit')}
                            className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                                selectedAction === 'exit'
                                    ? 'bg-rose-600/20 border-rose-500 text-white shadow-md shadow-rose-500/10'
                                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedAction === 'exit' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                    <LogOut className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="font-semibold text-sm block text-white">Exit Application Completely</span>
                                    <span className="text-xs text-slate-400">Shut down all application processes and exit</span>
                                </div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedAction === 'exit' ? 'border-rose-400 bg-rose-500' : 'border-slate-600'}`}>
                                {selectedAction === 'exit' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                        </button>
                    </div>

                    {/* Don't ask again Checkbox */}
                    <label className="flex items-center gap-2.5 my-4 cursor-pointer select-none group">
                        <button
                            type="button"
                            onClick={() => setRememberChoice(!rememberChoice)}
                            className="text-purple-400 focus:outline-none"
                        >
                            {rememberChoice ? (
                                <CheckSquare className="w-5 h-5 text-purple-400" />
                            ) : (
                                <Square className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                            )}
                        </button>
                        <span className="text-xs text-slate-300 font-medium group-hover:text-white transition-colors">
                            Remember this choice (Don't ask me again)
                        </span>
                    </label>

                    {/* Dialog Action Buttons */}
                    <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-purple-500/20 transition-all"
                        >
                            Confirm Action
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
