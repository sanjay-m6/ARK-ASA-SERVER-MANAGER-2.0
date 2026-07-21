import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ScrollText, RefreshCw, Loader2, Search,
    Skull, Heart, Hammer, UserPlus, UserMinus,
    ArrowUpDown, Star, AlertTriangle, Zap, Tag
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { getTribeLogs, getAllServers, type TribeLogEntry, type TribeLogResult } from '../../utils/tauri';
import toast from 'react-hot-toast';
import { useServerStore } from '../../stores/serverStore';

const EVENT_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
    tamed: { icon: Heart, color: 'text-pink-400', label: 'Tamed' },
    killed: { icon: Skull, color: 'text-red-400', label: 'Killed' },
    member_killed: { icon: Skull, color: 'text-red-500', label: 'Member Killed' },
    enemy_killed: { icon: Zap, color: 'text-orange-400', label: 'Enemy Killed' },
    destroyed: { icon: Hammer, color: 'text-amber-400', label: 'Destroyed' },
    demolished: { icon: Hammer, color: 'text-amber-500', label: 'Demolished' },
    starved: { icon: AlertTriangle, color: 'text-yellow-400', label: 'Starved' },
    claimed: { icon: Star, color: 'text-green-400', label: 'Claimed' },
    member_added: { icon: UserPlus, color: 'text-cyan-400', label: 'Member Added' },
    member_removed: { icon: UserMinus, color: 'text-slate-400', label: 'Member Left' },
    tribe_renamed: { icon: Tag, color: 'text-purple-400', label: 'Renamed' },
    transfer: { icon: ArrowUpDown, color: 'text-blue-400', label: 'Transfer' },
    other: { icon: ScrollText, color: 'text-slate-500', label: 'Event' },
};

export default function TribeLogViewer() {
    const { t } = useTranslation();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [logResult, setLogResult] = useState<TribeLogResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    const { activeServer } = useServerStore();

    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        } else {
            getAllServers()
                .then((s) => {
                    if (s.length > 0 && !selectedServerId) setSelectedServerId(s[0].id);
                })
                .catch(console.error);
        }
    }, [activeServer]);

    const loadLogs = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            const result = await getTribeLogs(selectedServerId, 500);
            setLogResult(result);
            if (result.entries.length === 0) {
                toast(t('tribeLog.noEntries', 'No tribe log entries found for this server.'), { icon: '📜' });
            }
        } catch (error) {
            toast.error(`Failed to load tribe logs: ${error}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedServerId) loadLogs();
    }, [selectedServerId]);

    const filteredEntries = (logResult?.entries || []).filter((entry) => {
        if (filterType !== 'all' && entry.event_type !== filterType) return false;
        if (searchQuery && !entry.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Group by day
    const groupedByDay = filteredEntries.reduce<Record<number, TribeLogEntry[]>>((acc, entry) => {
        if (!acc[entry.day]) acc[entry.day] = [];
        acc[entry.day].push(entry);
        return acc;
    }, {});
    const sortedDays = Object.keys(groupedByDay)
        .map(Number)
        .sort((a, b) => b - a);

    // Event type counts for filter badges
    const typeCounts = (logResult?.entries || []).reduce<Record<string, number>>((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400">
                        {t('tribeLog.title', 'Tribe Log Viewer')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('tribeLog.subtitle', 'Parse and explore your tribe history')}</p>
                </div>

                <div className="flex items-center gap-3">

                    <button
                        onClick={loadLogs}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50"
                    >
                        <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        <span>{t('common.refresh', 'Refresh')}</span>
                    </button>
                </div>
            </div>

            {/* Stats */}
            {logResult && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-violet-500/20 rounded-xl flex items-center justify-center">
                            <ScrollText className="w-6 h-6 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">{t('tribeLog.totalEntries', 'Total Entries')}</p>
                            <p className="text-2xl font-bold text-white">{logResult.total_parsed}</p>
                        </div>
                    </div>
                    <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                            <Skull className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">{t('tribeLog.deaths', 'Deaths')}</p>
                            <p className="text-2xl font-bold text-white">{(typeCounts['member_killed'] || 0) + (typeCounts['killed'] || 0)}</p>
                        </div>
                    </div>
                    <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center">
                            <Heart className="w-6 h-6 text-pink-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">{t('tribeLog.tames', 'Tames')}</p>
                            <p className="text-2xl font-bold text-white">{typeCounts['tamed'] || 0}</p>
                        </div>
                    </div>
                    <div className="glass-panel rounded-xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                            <Hammer className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm">{t('tribeLog.destroyed', 'Destroyed')}</p>
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
                        placeholder={t('tribeLog.searchPlaceholder', 'Search tribe logs...')}
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setFilterType('all')}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                            filterType === 'all'
                                ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'
                        )}
                    >
                        All
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
                                        ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
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
                    <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                </div>
            ) : filteredEntries.length === 0 ? (
                <div className="text-center py-16 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                    <ScrollText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-300">{t('tribeLog.noEntries', 'No tribe log entries found')}</h3>
                    <p className="text-slate-500 mt-2">{t('tribeLog.noEntriesDesc', 'Tribe logs will appear here after events occur in-game')}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {sortedDays.map((day) => (
                        <div key={day}>
                            {/* Day Header */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="px-3 py-1 bg-violet-500/20 text-violet-300 rounded-lg text-sm font-bold border border-violet-500/20">
                                    Day {day}
                                </div>
                                <div className="flex-1 h-px bg-slate-800"></div>
                                <span className="text-xs text-slate-500">{groupedByDay[day].length} events</span>
                            </div>

                            {/* Events */}
                            <div className="space-y-2 ml-4 border-l-2 border-slate-800 pl-4">
                                {groupedByDay[day].map((entry, idx) => {
                                    const cfg = EVENT_CONFIG[entry.event_type] || EVENT_CONFIG.other;
                                    const Icon = cfg.icon;
                                    return (
                                        <div
                                            key={idx}
                                            className="glass-panel rounded-xl p-3 hover:border-violet-500/30 transition-all group relative"
                                        >
                                            {/* Timeline dot */}
                                            <div className={cn(
                                                "absolute -left-[22px] top-4 w-3 h-3 rounded-full border-2 border-slate-900",
                                                entry.event_type === 'member_killed' || entry.event_type === 'killed' ? 'bg-red-500' :
                                                entry.event_type === 'tamed' ? 'bg-pink-500' :
                                                entry.event_type === 'destroyed' || entry.event_type === 'demolished' ? 'bg-amber-500' :
                                                'bg-slate-600'
                                            )} />

                                            <div className="flex items-start gap-3">
                                                <div className={cn("p-1.5 rounded-lg bg-slate-800/80", cfg.color)}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-medium truncate">{entry.message}</p>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className={cn(
                                                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                                            entry.event_type === 'member_killed' ? 'bg-red-500/20 text-red-300' :
                                                            entry.event_type === 'tamed' ? 'bg-pink-500/20 text-pink-300' :
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
