import { useState, useEffect } from 'react';
import {
    Calendar,
    Clock,
    Plus,
    Trash2,
    Play,
    Pause,
    RefreshCw,
    Save,
    MessageSquare,
    Server,
    HardDrive,
    Zap
} from 'lucide-react';
import { cn } from '../utils/helpers';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { invoke } from '@tauri-apps/api/core';
import { getAllServers } from '../utils/tauri';

interface ScheduledTask {
    id: number;
    serverId: number;
    taskType: 'restart' | 'backup' | 'rcon-command' | 'announcement' | 'save-world' | 'destroy-wild-dinos';
    cronExpression: string;
    command?: string;
    message?: string;
    preWarningMinutes: number;
    enabled: boolean;
    lastRun?: string;
    nextRun?: string;
}

const TASK_TYPES = [
    { value: 'restart', label: 'Server Restart', icon: RefreshCw, color: 'text-orange-400' },
    { value: 'backup', label: 'Auto Backup', icon: HardDrive, color: 'text-blue-400' },
    { value: 'save-world', label: 'Save World', icon: Save, color: 'text-green-400' },
    { value: 'announcement', label: 'Announcement', icon: MessageSquare, color: 'text-purple-400' },
    { value: 'destroy-wild-dinos', label: 'Destroy Wild Dinos', icon: Zap, color: 'text-red-400' },
    { value: 'rcon-command', label: 'Custom RCON', icon: Server, color: 'text-cyan-400' },
];

const CRON_PRESETS = [
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every 6 hours', value: '0 */6 * * *' },
    { label: 'Every 12 hours', value: '0 */12 * * *' },
    { label: 'Daily at midnight', value: '0 0 * * *' },
    { label: 'Daily at 6 AM', value: '0 6 * * *' },
    { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
];

export default function Scheduler() {
    const { servers, setServers } = useServerStore();
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [_isLoading, setIsLoading] = useState(true);

    // Form state
    const [newTask, setNewTask] = useState<{
        taskType: ScheduledTask['taskType'];
        cronExpression: string;
        command: string;
        message: string;
        preWarningMinutes: number;
    }>({
        taskType: 'restart',
        cronExpression: '0 */6 * * *',
        command: '',
        message: '',
        preWarningMinutes: 5,
    });

    // Load servers
    useEffect(() => {
        getAllServers().then(setServers).catch(console.error);
    }, [setServers]);

    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

    // Fetch tasks from backend
    const fetchTasks = async () => {
        if (!selectedServerId) return;

        setIsLoading(true);
        try {
            const data = await invoke<ScheduledTask[]>('get_scheduled_tasks', { serverId: selectedServerId });
            setTasks(data);
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [selectedServerId]);

    const toggleTask = async (taskId: number, currentEnabled: boolean) => {
        try {
            await invoke('toggle_scheduled_task', { taskId, enabled: !currentEnabled });
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, enabled: !t.enabled } : t
            ));
            toast.success('Task updated');
        } catch (error) {
            toast.error(`Failed to update task: ${error}`);
        }
    };

    const deleteTask = async (taskId: number) => {
        try {
            await invoke('delete_scheduled_task', { taskId });
            setTasks(prev => prev.filter(t => t.id !== taskId));
            toast.success('Task deleted');
        } catch (error) {
            toast.error(`Failed to delete task: ${error}`);
        }
    };

    const addTask = async () => {
        if (!selectedServerId) return;

        try {
            const task = await invoke<ScheduledTask>('create_scheduled_task', {
                request: {
                    serverId: selectedServerId,
                    taskType: newTask.taskType,
                    cronExpression: newTask.cronExpression,
                    command: newTask.command || null,
                    message: newTask.message || null,
                    preWarningMinutes: newTask.preWarningMinutes,
                }
            });

            setTasks(prev => [task, ...prev]);
            setShowAddModal(false);
            setNewTask({
                taskType: 'restart',
                cronExpression: '0 */6 * * *',
                command: '',
                message: '',
                preWarningMinutes: 5,
            });
            toast.success('Scheduled task created');
        } catch (error) {
            toast.error(`Failed to create task: ${error}`);
        }
    };

    const getTaskTypeInfo = (type: string) => {
        return TASK_TYPES.find(t => t.value === type) || TASK_TYPES[0];
    };

    const formatNextRun = (isoDate?: string) => {
        if (!isoDate) return 'Not scheduled';
        const date = new Date(isoDate);
        const now = new Date();
        const diff = date.getTime() - now.getTime();

        if (diff < 0) return 'Overdue';
        if (diff < 3600000) return `In ${Math.round(diff / 60000)} minutes`;
        if (diff < 86400000) return `In ${Math.round(diff / 3600000)} hours`;
        return date.toLocaleDateString();
    };

    const serverTasks = tasks.filter(t => t.serverId === selectedServerId);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                        Task Scheduler
                    </h1>
                    <p className="text-slate-400 mt-1">Automate server restarts, backups, and commands</p>
                </div>

                <div className="flex items-center gap-4">
                    <select
                        value={selectedServerId || ''}
                        onChange={(e) => setSelectedServerId(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                        {servers.map(server => (
                            <option key={server.id} value={server.id}>{server.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-purple-500/20"
                    >
                        <Plus className="w-4 h-4" />
                        Add Task
                    </button>
                </div>
            </div>

            {/* Tasks Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {serverTasks.map((task) => {
                    const typeInfo = getTaskTypeInfo(task.taskType);
                    const TypeIcon = typeInfo.icon;

                    return (
                        <div
                            key={task.id}
                            className={cn(
                                "glass-panel rounded-xl p-5 border transition-all",
                                task.enabled
                                    ? "border-slate-700/50"
                                    : "border-slate-800/50 opacity-60"
                            )}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg",
                                        task.enabled ? "bg-slate-800/50" : "bg-slate-900/50"
                                    )}>
                                        <TypeIcon className={cn("w-5 h-5", typeInfo.color)} />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-white">{typeInfo.label}</h3>
                                        <p className="text-xs text-slate-500 font-mono">{task.cronExpression}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => toggleTask(task.id, task.enabled)}
                                    className={cn(
                                        "p-2 rounded-lg transition-colors",
                                        task.enabled
                                            ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                                            : "bg-slate-800/50 text-slate-500 hover:bg-slate-700/50"
                                    )}
                                >
                                    {task.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                </button>
                            </div>

                            {task.message && (
                                <p className="text-sm text-slate-400 mb-3 truncate">
                                    "{task.message}"
                                </p>
                            )}

                            <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>Next: {formatNextRun(task.nextRun)}</span>
                                </div>
                                {task.preWarningMinutes > 0 && (
                                    <span className="text-amber-400">
                                        {task.preWarningMinutes}m warning
                                    </span>
                                )}
                            </div>

                            <button
                                onClick={() => deleteTask(task.id)}
                                className="w-full py-2 text-sm text-red-400 hover:bg-red-600/10 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4 inline mr-2" />
                                Delete
                            </button>
                        </div>
                    );
                })}

                {serverTasks.length === 0 && (
                    <div className="col-span-full glass-panel rounded-xl p-12 text-center">
                        <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">No Scheduled Tasks</h3>
                        <p className="text-slate-400 mb-4">
                            Create automated tasks for restarts, backups, and more
                        </p>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="px-6 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-colors"
                        >
                            Create First Task
                        </button>
                    </div>
                )}
            </div>

            {/* Add Task Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass-panel rounded-2xl p-6 w-full max-w-lg mx-4">
                        <h2 className="text-xl font-bold text-white mb-6">Add Scheduled Task</h2>

                        <div className="space-y-4">
                            {/* Task Type */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Task Type</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {TASK_TYPES.map((type) => (
                                        <button
                                            key={type.value}
                                            onClick={() => setNewTask(prev => ({ ...prev, taskType: type.value as any }))}
                                            className={cn(
                                                "flex items-center gap-2 p-3 rounded-lg border transition-colors text-left",
                                                newTask.taskType === type.value
                                                    ? "bg-purple-600/20 border-purple-500/50 text-white"
                                                    : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600"
                                            )}
                                        >
                                            <type.icon className={cn("w-4 h-4", type.color)} />
                                            <span className="text-sm">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Schedule */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Schedule</label>
                                <select
                                    value={newTask.cronExpression}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, cronExpression: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    {CRON_PRESETS.map((preset) => (
                                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Pre-warning */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Pre-warning (minutes)
                                </label>
                                <input
                                    type="number"
                                    value={newTask.preWarningMinutes}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, preWarningMinutes: parseInt(e.target.value) || 0 }))}
                                    min={0}
                                    max={60}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Broadcast warning to players before task executes
                                </p>
                            </div>

                            {/* Message (for announcements) */}
                            {newTask.taskType === 'announcement' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                                    <textarea
                                        value={newTask.message}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, message: e.target.value }))}
                                        rows={3}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                                        placeholder="Enter announcement message..."
                                    />
                                </div>
                            )}

                            {/* Custom Command */}
                            {newTask.taskType === 'rcon-command' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">RCON Command</label>
                                    <input
                                        type="text"
                                        value={newTask.command}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, command: e.target.value }))}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        placeholder="e.g., ServerChat Hello World"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-2 text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addTask}
                                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
                            >
                                Create Task
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
