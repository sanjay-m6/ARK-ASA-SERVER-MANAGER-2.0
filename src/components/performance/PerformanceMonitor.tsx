
import { TrendingUp, AlertTriangle, Clock, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PerformanceMonitorProps {
    data: any[];
}

export default function PerformanceMonitor({ data }: PerformanceMonitorProps) {
    if (!data || data.length === 0) return null;

    const avgCpu = (data.reduce((sum, d) => sum + d.cpu, 0) / data.length).toFixed(1);
    const avgMemory = (data.reduce((sum, d) => sum + d.memory, 0) / data.length).toFixed(1);
    const currentPlayers = data[data.length - 1].players;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white mb-1">Performance Monitor</h2>
                <p className="text-dark-400">Real-time server performance metrics</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-dark-400 text-sm">Avg CPU Usage</span>
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-3xl font-bold text-white">{avgCpu}%</div>
                    <div className="text-xs text-dark-500 mt-1">Last 100 minutes</div>
                </div>

                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-dark-400 text-sm">Avg Memory</span>
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div className="text-3xl font-bold text-white">{avgMemory}%</div>
                    <div className="text-xs text-dark-500 mt-1">Last 100 minutes</div>
                </div>

                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-dark-400 text-sm">Players Online</span>
                        <Users className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="text-3xl font-bold text-white">{currentPlayers}</div>
                    <div className="text-xs text-dark-500 mt-1">Current count</div>
                </div>
            </div>

            {/* Performance Chart */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Performance History</h3>
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
                        <Line type="monotone" dataKey="cpu" stroke="#3b82f6" name="CPU %" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="memory" stroke="#f59e0b" name="Memory %" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="players" stroke="#10b981" name="Players" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Performance Tips */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-primary-500" />
                    <span>Performance Tips</span>
                </h3>
                <ul className="space-y-2 text-sm text-dark-300">
                    <li className="flex items-start space-x-2">
                        <span className="text-green-500">✓</span>
                        <span>CPU usage is within normal range (\u003c80%)</span>
                    </li>
                    <li className="flex items-start space-x-2">
                        <span className="text-green-500">✓</span>
                        <span>Memory usage is stable</span>
                    </li>
                    <li className="flex items-start space-x-2">
                        <span className="text-yellow-500">⚠</span>
                        <span>Consider reducing view distance if CPU usage increases</span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
