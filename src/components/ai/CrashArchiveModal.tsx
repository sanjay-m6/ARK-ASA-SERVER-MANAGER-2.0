import { useState } from 'react';
import { useCrashNotificationStore } from '../../stores/crashNotificationStore';
import { X, Search, FileDown, Trash2, Calendar, HardDrive, Cpu, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function CrashArchiveModal() {
    const { archive, isArchiveOpen, setArchiveOpen, clearArchive } = useCrashNotificationStore();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Resolved' | 'Archived'>('All');
    const [expandedIds, setExpandedIds] = useState<string[]>([]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleExportJson = () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(archive, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `ai_copilot_crash_history_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            toast.success('Crash history exported successfully!');
        } catch {
            toast.error('Failed to export crash history.');
        }
    };

    const handleClearHistory = () => {
        if (confirm('Are you sure you want to clear the entire crash history archive? This cannot be undone.')) {
            clearArchive();
            toast.success('Crash history archive cleared.');
        }
    };

    const filtered = archive.filter(item => {
        const matchesSearch = 
            item.serverName.toLowerCase().includes(search.toLowerCase()) ||
            item.crashReason.toLowerCase().includes(search.toLowerCase()) ||
            item.exceptionType.toLowerCase().includes(search.toLowerCase()) ||
            item.executableName.toLowerCase().includes(search.toLowerCase()) ||
            (item.diagnosis?.rootCause && item.diagnosis.rootCause.toLowerCase().includes(search.toLowerCase()));

        const matchesStatus = 
            statusFilter === 'All' || 
            item.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (!isArchiveOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                onClick={() => setArchiveOpen(false)}
            />

            {/* Modal Body */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative bg-[#0b1329] border border-slate-800 rounded-3xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl font-sans"
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl">
                            <Cpu className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">AI Co-Pilot Crash Archive</h2>
                            <p className="text-[11px] text-slate-400 font-medium">Review and inspect historical crash events and automated diagnoses</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setArchiveOpen(false)}
                        className="p-1.5 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 bg-slate-950/40 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search server name, type, root cause..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                        />
                    </div>

                    {/* Filter & Actions */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 py-2 px-3 focus:outline-none focus:border-cyan-500/50"
                        >
                            <option value="All">All Statuses</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Archived">Archived (Dismissed)</option>
                        </select>

                        <button
                            onClick={handleExportJson}
                            disabled={archive.length === 0}
                            className="flex items-center gap-1.5 py-2 px-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
                            title="Export to JSON"
                        >
                            <FileDown className="w-3.5 h-3.5" /> Export JSON
                        </button>

                        <button
                            onClick={handleClearHistory}
                            disabled={archive.length === 0}
                            className="flex items-center gap-1.5 py-2 px-3.5 bg-rose-950/30 hover:bg-rose-950/50 disabled:opacity-50 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
                            title="Clear Archive"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Clear History
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 theme-scrollbar bg-[#020617]/30">
                    {filtered.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-3.5">
                            <div className="p-4 bg-slate-900/60 text-slate-500 rounded-full border border-slate-850">
                                <HelpCircle className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">No Crashes Logged</h3>
                                <p className="text-xs text-slate-400 max-w-[280px] mt-1">Crashes that are resolved or dismissed will appear here for future inspection.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {filtered.map((item) => {
                                const isExpanded = expandedIds.includes(item.id);
                                return (
                                    <div 
                                        key={item.id} 
                                        className="bg-[#0f172a]/80 border border-slate-800/80 rounded-2xl overflow-hidden hover:border-slate-700/60 transition-all duration-200"
                                    >
                                        {/* Row Header */}
                                        <div 
                                            onClick={() => toggleExpand(item.id)}
                                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-900/20 transition-all"
                                        >
                                            <div className="flex items-start sm:items-center gap-3.5">
                                                <div className={`p-2 rounded-xl border ${
                                                    item.status === 'Resolved' 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                                }`}>
                                                    {item.status === 'Resolved' ? (
                                                        <ShieldCheck className="w-4 h-4" />
                                                    ) : (
                                                        <AlertTriangle className="w-4 h-4" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-extrabold text-white text-xs leading-none">
                                                            {item.serverName}
                                                        </span>
                                                        <span className="bg-slate-900 text-slate-400 border border-slate-800 text-[9px] px-1.5 py-0.5 rounded font-mono font-medium">
                                                            {item.crashHash}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1 font-medium flex-wrap">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3.5 h-3.5" />
                                                            {new Date(item.timestamp).toLocaleString()}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <HardDrive className="w-3.5 h-3.5" />
                                                            {item.executableName}
                                                        </span>
                                                        <span>Occurrences: <strong className="text-white font-bold">{item.occurrences}</strong></span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                                <span className={`text-[10px] font-bold py-1 px-2.5 rounded-full border ${
                                                    item.status === 'Resolved'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : 'bg-slate-800 text-slate-400 border-slate-700/60'
                                                }`}>
                                                    {item.status}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expandable Diagnosis */}
                                        <AnimatePresence initial={false}>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                    className="overflow-hidden border-t border-slate-800/60 bg-slate-950/20"
                                                >
                                                    <div className="p-4 flex flex-col gap-4 text-xs">
                                                        <div className="flex flex-col gap-1 text-[11px]">
                                                            <span className="text-slate-400 font-semibold">Crash Reason / Exception:</span>
                                                            <span className="text-red-400 font-bold bg-slate-900 border border-slate-800 px-2 py-0.5 rounded w-max">
                                                                {item.crashReason} ({item.exceptionType})
                                                            </span>
                                                        </div>

                                                        {item.diagnosis ? (
                                                            <div className="flex flex-col gap-3 bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
                                                                <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5">
                                                                    <span className="font-extrabold text-cyan-400 flex items-center gap-1.5">
                                                                        <Cpu className="w-4 h-4" /> AI Diagnosis Summary
                                                                    </span>
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                                                        {item.diagnosis.confidenceScore}% Confidence
                                                                    </span>
                                                                </div>

                                                                <div className="text-[11px] flex flex-col gap-1">
                                                                    <span className="text-slate-400 font-semibold">Root Cause:</span>
                                                                    <span className="text-slate-200 font-medium leading-relaxed">{item.diagnosis.rootCause}</span>
                                                                </div>

                                                                <div className="text-[11px] flex flex-col gap-1">
                                                                    <span className="text-slate-400 font-semibold">Recommended Fix:</span>
                                                                    <span className="text-slate-200 font-medium leading-relaxed bg-slate-950/60 p-2.5 rounded border border-slate-800 block whitespace-pre-wrap font-mono">
                                                                        {item.diagnosis.recommendedFix}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-slate-500 italic text-[11px]">No diagnosis generated.</div>
                                                        )}

                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-slate-400 font-semibold text-[11px]">Log Trace / Exception Dump:</span>
                                                            <pre className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-[10px] text-slate-300 font-mono overflow-x-auto max-h-36 theme-scrollbar select-text">
                                                                {item.stackTrace}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
                    <button
                        onClick={() => setArchiveOpen(false)}
                        className="py-1.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all"
                    >
                        Close Archive
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
