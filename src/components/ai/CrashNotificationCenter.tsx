import { useState, useEffect } from 'react';
import { useCrashNotificationStore, CrashNotification } from '../../stores/crashNotificationStore';
import { 
    AlertOctagon, X, ChevronDown, ChevronUp, Cpu, 
    CheckCircle2, FileText, Check, Loader2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// Sub-component to show live human-readable elapsed time
function LastSeenTimer({ timestamp }: { timestamp: number }) {
    const [text, setText] = useState('just now');

    useEffect(() => {
        const update = () => {
            const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
            if (diff < 5) {
                setText('just now');
            } else if (diff < 60) {
                setText(`${diff} seconds ago`);
            } else {
                const mins = Math.floor(diff / 60);
                setText(`${mins} minute${mins > 1 ? 's' : ''} ago`);
            }
        };

        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [timestamp]);

    return <span>{text}</span>;
}

// Progress bar mapped from status
function getProgressPct(status: string): number {
    switch (status) {
        case 'Pending': return 10;
        case 'Queued': return 30;
        case 'Analyzing': return 55;
        case 'Generating Fix': return 80;
        case 'Completed': return 100;
        default: return 0;
    }
}

// Status description mapped from status
function getStatusLabel(status: string): string {
    switch (status) {
        case 'Pending': return 'Pending analysis...';
        case 'Queued': return 'Queued for AI...';
        case 'Analyzing': return 'Analyzing logs...';
        case 'Generating Fix': return 'Generating fix...';
        case 'Completed': return 'Diagnosis complete';
        default: return 'Idle';
    }
}

interface CardProps {
    notif: CrashNotification;
}

function CrashNotificationCard({ notif }: CardProps) {
    const { resolveNotification, dismissNotification } = useCrashNotificationStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isApplyingFix, setIsApplyingFix] = useState(false);

    const progressPct = getProgressPct(notif.status);
    const isAiDone = notif.status === 'Completed';

    const handleApplyFix = async () => {
        setIsApplyingFix(true);
        // Simulate applying AI recommended fix
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setIsApplyingFix(false);
        toast.success(`AI Recommendation applied to "${notif.serverName}" successfully!`);
        resolveNotification(notif.id);
    };

    const handleViewLogs = () => {
        toast.success(`Opening crash log files for Server "${notif.serverName}"...`);
    };

    const handleIgnore = () => {
        dismissNotification(notif.id);
        toast.success(`Dismissed crash notification for Server "${notif.serverName}"`);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="bg-[#0f172a]/95 backdrop-blur-xl border border-red-500/30 hover:border-red-500/50 rounded-2xl p-4 shadow-2xl shadow-red-950/20 flex flex-col gap-3 font-sans transition-all duration-300 w-96 select-none"
        >
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-red-500/10 text-red-500 rounded-xl animate-pulse">
                        <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-extrabold text-white leading-tight">
                            {notif.serverName}
                        </h4>
                        <p className="text-[11px] text-red-400 font-semibold tracking-wide uppercase mt-0.5">
                            {notif.crashReason} Detected
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button 
                        onClick={handleIgnore}
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                        title="Dismiss"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Merge Stats */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1 bg-slate-900/40 py-1 rounded-lg border border-slate-800/40">
                <span>Occurrences: <strong className="text-white font-bold">{notif.occurrences}</strong></span>
                <span>Last Seen: <strong className="text-slate-300"><LastSeenTimer timestamp={notif.lastSeen} /></strong></span>
            </div>

            {/* AI Progress Tracker */}
            <div className="flex flex-col gap-1.5 px-0.5">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                        {getStatusLabel(notif.status)}
                    </span>
                    <span className="text-cyan-400 font-extrabold text-[10px]">
                        {progressPct}%
                    </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                    <div 
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                            isAiDone 
                                ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 shadow-md shadow-cyan-400/20' 
                                : 'bg-cyan-500 animate-pulse'
                        }`}
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            {/* Expandable Section */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden flex flex-col gap-3.5 border-t border-slate-800/60 pt-3"
                    >
                        {/* Crash Context */}
                        <div className="flex flex-col gap-1 text-[11px]">
                            <span className="text-slate-400 font-semibold">Crash Signature:</span>
                            <div className="flex gap-2 text-slate-300 font-medium">
                                <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] truncate max-w-[120px]" title="Executable">
                                    {notif.executableName}
                                </span>
                                <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px] truncate max-w-[150px]" title="Exception">
                                    {notif.exceptionType}
                                </span>
                            </div>
                        </div>

                        {/* Stack Trace / Details */}
                        <div className="flex flex-col gap-1 text-[11px]">
                            <span className="text-slate-400 font-semibold">Log Snippet:</span>
                            <pre className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-[10px] text-slate-300 font-mono overflow-x-auto max-h-24 theme-scrollbar">
                                {notif.stackTrace}
                            </pre>
                        </div>

                        {/* AI Diagnosis Details */}
                        {notif.diagnosis && (
                            <div className="flex flex-col gap-2.5 bg-slate-900/60 border border-slate-850 p-3 rounded-xl">
                                <div className="flex items-center justify-between text-xs border-b border-slate-800/40 pb-1.5">
                                    <span className="font-extrabold text-cyan-400 flex items-center gap-1.5">
                                        <Cpu className="w-4 h-4" /> AI Co-Pilot Recommendation
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                        {notif.diagnosis.confidenceScore}% Confidence
                                    </span>
                                </div>

                                <div className="text-[11px] flex flex-col gap-1">
                                    <span className="text-slate-400 font-semibold">Root Cause:</span>
                                    <span className="text-slate-200 font-medium leading-relaxed">{notif.diagnosis.rootCause}</span>
                                </div>

                                <div className="text-[11px] flex flex-col gap-1 mt-1">
                                    <span className="text-slate-400 font-semibold">Recommended Fix:</span>
                                    <span className="text-slate-200 font-medium leading-relaxed bg-slate-950/60 p-2 rounded border border-slate-800/60 block whitespace-pre-wrap">
                                        {notif.diagnosis.recommendedFix}
                                    </span>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 mt-2">
                                    <button 
                                        disabled={isApplyingFix}
                                        onClick={handleApplyFix}
                                        className="flex-1 py-1.5 px-3 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {isApplyingFix ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Check className="w-3.5 h-3.5" />
                                        )}
                                        {isApplyingFix ? 'Applying...' : 'Apply Fix'}
                                    </button>
                                    <button 
                                        onClick={handleViewLogs}
                                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1 hover:scale-[1.02]"
                                        title="View Logs"
                                    >
                                        <FileText className="w-3.5 h-3.5" /> Logs
                                    </button>
                                    <button 
                                        onClick={() => resolveNotification(notif.id)}
                                        className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1 hover:scale-[1.02]"
                                        title="Mark Resolved"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default function CrashNotificationCenter() {
    const { activeNotifications } = useCrashNotificationStore();

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3.5 max-w-[95vw] pointer-events-none">
            <div className="flex flex-col gap-3.5 pointer-events-auto">
                <AnimatePresence mode="popLayout">
                    {activeNotifications.map((notif) => (
                        <CrashNotificationCard key={notif.id} notif={notif} />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
