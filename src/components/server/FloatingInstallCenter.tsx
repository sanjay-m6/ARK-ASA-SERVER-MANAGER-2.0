import { useState } from 'react';
import { useInstallStore } from '../../stores/installStore';
import { Terminal, Trash2, Layers, CheckCircle, AlertCircle, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

export default function FloatingInstallCenter() {
    const { t } = useTranslation();
    const { activeInstalls, setViewingPath, removeInstall, clearCompleted } = useInstallStore();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const tasks = Object.values(activeInstalls);
    const activeCount = tasks.filter(t => !t.isComplete && !t.isError).length;
    const completedCount = tasks.filter(t => t.isComplete).length;
    const failedCount = tasks.filter(t => t.isError).length;

    return (
        <AnimatePresence>
            {tasks.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                    className="fixed bottom-22 right-6 left-6 sm:bottom-6 sm:right-22 sm:left-auto z-50 w-auto sm:w-96 flex flex-col gap-3 font-sans"
                >
                    {/* Main Header / Trigger Pill */}
                    <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl transition-all duration-300 hover:shadow-sky-500/15">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                                        <Layers className="w-5 h-5 text-white" />
                                    </div>
                                    {activeCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white ring-2 ring-slate-900 animate-pulse">
                                            {activeCount}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                        {t('installCenter.title', 'Installation Center')}
                                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        {activeCount > 0 
                                            ? t('installCenter.activeJobs', { count: activeCount, defaultValue: `${activeCount} installs running` })
                                            : t('installCenter.allDone', 'All installations complete')
                                        }
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                                {(completedCount > 0 || failedCount > 0) && (
                                    <button
                                        onClick={clearCompleted}
                                        className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all duration-200"
                                        title={t('installCenter.clearAll', 'Clear finished jobs')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsCollapsed(!isCollapsed)}
                                    className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all duration-200"
                                >
                                    {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Expanded Tasks List */}
                        <AnimatePresence initial={false}>
                            {!isCollapsed && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                    animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
                                        {tasks.map((task) => {
                                            const isRunning = !task.isComplete && !task.isError;
                                            
                                            return (
                                                <div 
                                                    key={task.installPath}
                                                    className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2.5 transition-all duration-300 hover:border-slate-700/60"
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="relative flex items-center justify-center">
                                                                {task.isComplete ? (
                                                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                                                ) : task.isError ? (
                                                                    <AlertCircle className="w-5 h-5 text-rose-400" />
                                                                ) : (
                                                                    <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                                                                )}
                                                            </div>
                                                            <div className="leading-tight">
                                                                <div className="text-xs font-bold text-white truncate max-w-[160px] sm:max-w-[200px]">
                                                                    {task.name}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-medium">
                                                                    {task.serverType} • {task.mapName}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => setViewingPath(task.installPath)}
                                                                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all duration-200"
                                                                title={t('installCenter.viewLogs', 'View Installation Logs')}
                                                            >
                                                                <Terminal className="w-3.5 h-3.5" />
                                                            </button>
                                                            {!isRunning && (
                                                                <button
                                                                    onClick={() => removeInstall(task.installPath)}
                                                                    className="p-1 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-lg transition-all duration-200"
                                                                    title={t('installCenter.dismiss', 'Dismiss')}
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Progress Bar & Stage Status */}
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <span className="text-slate-400 font-medium truncate max-w-[180px]">
                                                                {task.message || task.stage}
                                                            </span>
                                                            <span className="text-white font-bold">
                                                                {Math.round(task.progress)}%
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-500 ease-out ${
                                                                    task.isComplete 
                                                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                                                                        : task.isError 
                                                                            ? 'bg-rose-500' 
                                                                            : 'bg-gradient-to-r from-sky-500 to-indigo-500'
                                                                }`}
                                                                style={{ width: `${task.progress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
