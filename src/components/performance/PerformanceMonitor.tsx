
import { TrendingUp, AlertTriangle, Clock, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PerformanceMonitorProps {
    data: any[];
}

import { useTranslation } from 'react-i18next';

export default function PerformanceMonitor({ data }: PerformanceMonitorProps) {
    const { t } = useTranslation();
    if (!data || data.length === 0) return null;

    const avgCpu = (data.reduce((sum, d) => sum + d.cpu, 0) / data.length).toFixed(1);
    const avgMemory = (data.reduce((sum, d) => sum + d.memory, 0) / data.length).toFixed(1);
    const currentPlayers = data[data.length - 1].players;

    return (
        <div className="space-y-6">

            <div>
                <h2 className="text-2xl font-bold text-white mb-1">{t('performance.title')}</h2>
                <p className="text-dark-400">{t('performance.subtitle')}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-dark-400 text-sm">{t('performance.cpu.label')}</span>
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-3xl font-bold text-white">{avgCpu}%</div>
                    <div className="text-xs text-dark-500 mt-1">{t('performance.cpu.sub')}</div>
                </div>

                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-dark-400 text-sm">{t('performance.memory.label')}</span>
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div className="text-3xl font-bold text-white">{avgMemory}%</div>
                    <div className="text-xs text-dark-500 mt-1">{t('performance.memory.sub')}</div>
                </div>

                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-dark-400 text-sm">{t('performance.players.label')}</span>
                        <Users className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="text-3xl font-bold text-white">{currentPlayers}</div>
                    <div className="text-xs text-dark-500 mt-1">{t('performance.players.sub')}</div>
                </div>
            </div>

            {/* Performance Chart */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">{t('performance.chart.title')}</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                color: '#f8fafc',
                            }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="cpu" stroke="#3b82f6" name={t('performance.chart.cpu')} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="memory" stroke="#f59e0b" name={t('performance.chart.memory')} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="players" stroke="#10b981" name={t('performance.chart.players')} strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Performance Tips */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-primary-500" />
                    <span>{t('performance.tips.title')}</span>
                </h3>
                <ul className="space-y-2 text-sm text-dark-300">
                    <li className="flex items-start space-x-2">
                        <span className="text-green-500">✓</span>
                        <span>{t('performance.tips.cpu')}</span>
                    </li>
                    <li className="flex items-start space-x-2">
                        <span className="text-green-500">✓</span>
                        <span>{t('performance.tips.memory')}</span>
                    </li>
                    <li className="flex items-start space-x-2">
                        <span className="text-yellow-500">⚠</span>
                        <span>{t('performance.tips.viewDistance')}</span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
