import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ScrollText, RefreshCw, Loader2, Search,
    Skull, Heart, Hammer, UserPlus, UserMinus,
    ArrowUpDown, Star, AlertTriangle, Zap, Tag
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { getAseTribeLogs, type AseTribeLogEntry, type AseTribeLogResult } from '../utils/aseCommands';
import toast from 'react-hot-toast';

const EVENT_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
    tamed: { icon: Heart, color: 'text-pink-400', label: 'Tamed' },
    killed: { icon: Skull, color: 'text-red-400', label: 'Killed' },
    member_killed: { icon: Skull, color: 'text-red-500', label: 'Member Killed' },
    enemy_killed: { icon: Zap, color: 'text-amber-500', label: 'Enemy Killed' },
    destroyed: { icon: Hammer, color: 'text-amber-400', label: 'Destroyed' },
    demolished: { icon: Hammer, color: 'text-amber-500', label: 'Demolished' },
    starved: { icon: AlertTriangle, color: 'text-yellow-400', label: 'Starved' },
    claimed: { icon: Star, color: 'text-emerald-400', label: 'Claimed' },
    member_added: { icon: UserPlus, color: 'text-cyan-400', label: 'Member Joined' },
    member_removed: { icon: UserMinus, color: 'text-slate-400', label: 'Member Left' },
    tribe_renamed: { icon: Tag, color: 'text-sky-400', label: 'Renamed' },
    transfer: { icon: ArrowUpDown, color: 'text-blue-400', label: 'Transfer' },
    other: { icon: ScrollText, color: 'text-slate-500', label: 'Event' },
};

export default function ASETribeLogViewer() {
    const { t } = useTranslation();
    const { servers } = useAseServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [logResult, setLogResult] = useState<AseTribeLogResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

    const loadLogs = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            const result = await getAseTribeLogs(selectedServerId, 500);
            setLogResult(result);
            if (result.entries.length === 0) {
                toast('No active tribe log entries parsed for this ASE server.', { icon: '📜' });
            }
        } catch (error) {
            console.error('Failed to load ASE tribe logs:', error);
            toast.error(`Failed to load tribe logs: ${error}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedServerId) loadLogs();
    }, [selectedServerId]);

    const filteredEntries = (logResult?.entries || []).filter((entry) => {
        if (filterType !== 'all' && entry.eventType !== filterType) return false;
        if (searchQuery && !entry.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Group by day
    const groupedByDay = filteredEntries.reduce<Record<number, AseTribeLogEntry[]>>((acc, entry) => {
        if (!acc[entry.day]) acc[entry.day] = [];
        acc[entry.day].push(entry);
        return acc;
    }, {});
    const sortedDays = Object.keys(groupedByDay)
        .map(Number)
        .sort((a, b) => b - a);

    // Event type counts for filter badges
    const typeCounts = (logResult?.entries || []).reduce<Record<string, number>>((acc, e) => {
        acc[e.eventType] = (acc[e.eventType] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-500">
                        {t('tribeLog.title', 'ASE Tribe Log Viewer')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">
                        Parse and monitor the tribe logs from your Ark: Survival Evolved servers.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <ServerSelect
                        value={selectedServerId}
                        onChange={setSelectedServerId}
                        servers={servers}
                        accentColor="amber"
                    />
                    <button
                        onClick={loadLogs}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-2xl transition-all duration-300 shadow-lg shadow-amber-500/20 text-xs font-black uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] h-[42px] cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        <span>Refresh Logs</span>
                    </button>
                </div>
            </div>

            {/* Stats */}
            {logResult && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900/50 border border-amber-500/10 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-500/15 rounded-xl flex items-center justify-center border border-amber-500/20">
                            <ScrollText className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">Total Entries</p>
                            <p className="text-2xl font-bold text-white">{logResult.totalParsed}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 border border-amber-500/10 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center border border-red-500/20">
                            <Skull className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">Deaths</p>
                            <p className="text-2xl font-bold text-white">{(typeCounts['member_killed'] || 0) + (typeCounts['killed'] || 0)}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 border border-amber-500/10 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center border border-pink-500/20">
                            <Heart className="w-6 h-6 text-pink-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">Tames</p>
                            <p className="text-2xl font-bold text-white">{typeCounts['tamed'] || 0}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 border border-amber-500/10 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/20">
                            <Hammer className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">Structures Destroyed</p>
                            <p className="text-2xl font-bold text-white">{(typeCounts['destroyed'] || 0) + (typeCounts['demolished'] || 0)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter tribe events by keyword..."
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setFilterType('all')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                            filterType === 'all'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'
                        )}
                    >
                        All Events
                    </button>
                    {Object.entries(EVENT_CONFIG).filter(([key]) => typeCounts[key]).map(([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                            <button
                                key={key}
                                onClick={() => setFilterType(key === filterType ? 'all' : key)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                                    filterType === key
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                        : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'
                                    )}
                            >
                                <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                                <span>{cfg.label}</span>
                                <span className="ml-1 text-xs opacity-60">{typeCounts[key]}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Log Timeline */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                </div>
            ) : filteredEntries.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/20 rounded-2xl border-dashed border-2 border-slate-800">
                    <ScrollText className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-400">No events matched filters</h3>
                    <p className="text-slate-600 mt-2">Active logs will refresh dynamically as players interact on the server.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {sortedDays.map((day) => (
                        <div key={day}>
                            {/* Day Header */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="px-3 py-1 bg-amber-500/10 text-amber-300 rounded-lg text-sm font-bold border border-amber-500/20">
                                    Day {day}
                                </div>
                                <div className="flex-1 h-px bg-slate-800"></div>
                                <span className="text-xs text-slate-500">{groupedByDay[day].length} events</span>
                            </div>

                            {/* Events */}
                            <div className="space-y-2 ml-4 border-l-2 border-amber-500/10 pl-4">
                                {groupedByDay[day].map((entry, idx) => {
                                    const cfg = EVENT_CONFIG[entry.eventType] || EVENT_CONFIG.other;
                                    const Icon = cfg.icon;
                                    return (
                                        <div
                                            key={idx}
                                            className="bg-slate-900/40 border border-white/5 rounded-xl p-3 hover:border-amber-500/25 transition-all group relative"
                                        >
                                            {/* Timeline dot */}
                                            <div className={cn(
                                                "absolute -left-[22px] top-4 w-3 h-3 rounded-full border-2 border-slate-900",
                                                entry.eventType === 'member_killed' || entry.eventType === 'killed' ? 'bg-red-500' :
                                                entry.eventType === 'tamed' ? 'bg-pink-500' :
                                                entry.eventType === 'destroyed' || entry.eventType === 'demolished' ? 'bg-amber-500' :
                                                'bg-slate-600'
                                            )} />

                                            <div className="flex items-start gap-3">
                                                <div className={cn("p-1.5 rounded-lg bg-slate-800/80 border border-white/5", cfg.color)}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-medium leading-relaxed">{entry.message}</p>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <span className={cn(
                                                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                                            entry.eventType === 'member_killed' ? 'bg-red-500/20 text-red-300' :
                                                            entry.eventType === 'tamed' ? 'bg-pink-500/20 text-pink-300' :
                                                            'bg-slate-800 text-slate-400'
                                                        )}>{cfg.label}</span>
                                                        {entry.timestamp && (
                                                            <span className="text-xs text-slate-500 font-mono">{entry.timestamp}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
