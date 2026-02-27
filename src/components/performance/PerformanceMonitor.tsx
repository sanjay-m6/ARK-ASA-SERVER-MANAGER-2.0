import { useTranslation } from 'react-i18next';
import { TrendingUp, AlertTriangle, Clock, Users, Activity, Cpu, HardDrive } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PerformanceMonitorProps {
    data: any[];
}

export default function PerformanceMonitor({ data }: PerformanceMonitorProps) {
    const { t } = useTranslation();
    if (!data || data.length === 0) return null;

    const avgCpu = (data.reduce((sum, d) => sum + d.cpu, 0) / data.length).toFixed(1);
    const avgMemory = (data.reduce((sum, d) => sum + d.memory, 0) / data.length).toFixed(1);
    const currentPlayers = data[data.length - 1].players;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-sky-500/10 rounded-xl border border-sky-500/20">
                    <Activity className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">{t('performance.title', 'Performance Monitor')}</h2>
                    <p className="text-sm text-slate-400">{t('performance.subtitle', 'Real-time server performance metrics')}</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-5 rounded-xl border border-white/5 relative overflow-hidden group hover:border-sky-500/30 transition-all cursor-default">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all"></div>
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Cpu className="w-4 h-4 text-sky-400" />
                            {t('performance.cpu.label', 'Average CPU')}
                        </div>
                        <TrendingUp className="w-4 h-4 text-sky-500/50" />
                    </div>
                    <div className="text-3xl font-bold text-white relative z-10">{avgCpu}%</div>
                    <div className="text-xs text-slate-500 mt-2 relative z-10">{t('performance.cpu.sub', 'Last 100 minutes')}</div>
                </div>

                <div className="glass-panel p-5 rounded-xl border border-white/5 relative overflow-hidden group hover:border-amber-500/30 transition-all cursor-default">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <HardDrive className="w-4 h-4 text-amber-400" />
                            {t('performance.memory.label', 'Average Memory')}
                        </div>
                        <AlertTriangle className="w-4 h-4 text-amber-500/50" />
                    </div>
                    <div className="text-3xl font-bold text-white relative z-10">{avgMemory}%</div>
                    <div className="text-xs text-slate-500 mt-2 relative z-10">{t('performance.memory.sub', 'Last 100 minutes')}</div>
                </div>

                <div className="glass-panel p-5 rounded-xl border border-white/5 relative overflow-hidden group hover:border-emerald-500/30 transition-all cursor-default">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Users className="w-4 h-4 text-emerald-400" />
                            {t('performance.players.label', 'Active Players')}
                        </div>
                        <Users className="w-4 h-4 text-emerald-500/50" />
                    </div>
                    <div className="text-3xl font-bold text-white relative z-10">{currentPlayers}</div>
                    <div className="text-xs text-slate-500 mt-2 relative z-10">{t('performance.players.sub', 'Currently online')}</div>
                </div>
            </div>

            {/* Performance Chart */}
            <div className="glass-panel p-5 rounded-xl border border-white/5">
                <h3 className="text-sm font-semibold text-slate-300 mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-400" />
                    {t('performance.chart.title', 'Performance History')}
                </h3>
                <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.4} />
                            <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                            <YAxis stroke="#64748b" fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '12px',
                                    backdropFilter: 'blur(8px)',
                                    color: '#f8fafc',
                                    fontSize: '12px',
                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                                }}
                                itemStyle={{ padding: '2px 0' }}
                                formatter={(value: number) => `${value.toFixed(1)}`}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} iconType="circle" />
                            <Area type="monotone" dataKey="cpu" stroke="#38bdf8" name={t('performance.chart.cpu', 'CPU Usage (%)')} strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
                            <Area type="monotone" dataKey="memory" stroke="#fbbf24" name={t('performance.chart.memory', 'Memory Usage (%)')} strokeWidth={2} fillOpacity={1} fill="url(#colorMemory)" />
                            <Line type="monotone" dataKey="players" stroke="#10b981" name={t('performance.chart.players', 'Players')} strokeWidth={2} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Performance Tips */}
            <div className="glass-panel p-5 rounded-xl border border-white/5 bg-gradient-to-br from-slate-900/50 to-slate-800/50">
                <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    {t('performance.tips.title', 'System Diagnostics')}
                </h3>
                <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-3 text-slate-300">
                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                        <span>{t('performance.tips.cpu', 'CPU usage is within normal range (<80%)')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-slate-300">
                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                        <span>{t('performance.tips.memory', 'Memory usage is stable')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-slate-400">
                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></div>
                        <span>{t('performance.tips.viewDistance', 'Consider reducing view distance if CPU usage increases')}</span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
