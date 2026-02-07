import { useState, useEffect } from 'react';
// import { invoke } from '@tauri-apps/api/core'; // Removed unused import
import {
    Save,
    Trash2,
    Plus,
    Terminal,
    MessageSquare,
    RefreshCw,
    Zap,
    Activity,
    Server as ServerIcon,
    CheckCircle
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { toast } from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import {
    getAllServers,
    getSchedulerSettings,
    saveSchedulerSettings,
    getScheduledTasks,
    createScheduledTask,
    deleteScheduledTask,
    toggleScheduledTask,
    type SchedulerSettings,
    type ScheduledTask
} from '../utils/tauri';

const TASK_TYPES = [
    { value: 'restart', label: 'Server Restart', icon: RefreshCw, color: 'text-orange-400', border: 'border-orange-500/50', bg: 'bg-orange-500/10' },
    { value: 'backup', label: 'Auto Backup', icon: Terminal, color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10' },
    { value: 'save-world', label: 'Save World', icon: Save, color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' },
    { value: 'announcement', label: 'Announcement', icon: MessageSquare, color: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-500/10' },
    { value: 'destroy-wild-dinos', label: 'Destroy Wild Dinos', icon: Zap, color: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-500/10' },
    { value: 'BoostStart', label: 'Start Rate Boost', icon: Activity, color: 'text-emerald-400', border: 'border-emerald-500/50', bg: 'bg-emerald-500/10' },
    { value: 'BoostEnd', label: 'End Rate Boost', icon: Activity, color: 'text-slate-400', border: 'border-slate-500/50', bg: 'bg-slate-500/10' },
    { value: 'rcon-command', label: 'Custom RCON', icon: ServerIcon, color: 'text-cyan-400', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10' },
];

export default function Scheduler() {
    const { servers, setServers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [settings, setSettings] = useState<SchedulerSettings | null>(null);
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);

    // UI States
    const [isSaving, setIsSaving] = useState(false);
    const [nextRunCountdown, setNextRunCountdown] = useState<string>('');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

    // New Task Form State
    const [newTaskType, setNewTaskType] = useState('restart');
    const [cronSchedule, setCronSchedule] = useState('0 */6 * * *'); // Every 6 hours default
    const [customCron, setCustomCron] = useState('');
    const [preWarning, setPreWarning] = useState(5);
    const [customCommand, setCustomCommand] = useState('');
    const [announcementMsg, setAnnouncementMsg] = useState('');

    // Load servers
    useEffect(() => {
        getAllServers().then(servers => {
            setServers(servers);
            if (servers.length > 0 && !selectedServerId) {
                setSelectedServerId(servers[0].id);
            }
        }).catch(console.error);
    }, [setServers]);

    // Fetch data when server changes
    useEffect(() => {
        if (!selectedServerId) return;
        fetchSettings();
        fetchTasks();
    }, [selectedServerId]);

    const fetchSettings = async () => {
        if (!selectedServerId) return;
        try {
            const data = await getSchedulerSettings(selectedServerId);
            setSettings(data);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
            toast.error('Failed to load scheduler settings');
        }
    };

    const fetchTasks = async () => {
        if (!selectedServerId) return;
        try {
            const data = await getScheduledTasks(selectedServerId);
            setTasks(data);
        } catch (error) {
            toast.error('Failed to load scheduled tasks');
        }
    };

    // Countdown Timer logic
    useEffect(() => {
        const interval = setInterval(() => {
            if (settings?.mode === 'basic' && settings.nextRunBasic) {
                updateCountdown(settings.nextRunBasic);
            } else if (settings?.mode === 'advanced') {
                const next = calculateNextAdvancedRun();
                if (next) updateCountdown(next.toISOString());
                else setNextRunCountdown('Not scheduled');
            } else {
                setNextRunCountdown('Not scheduled');
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [settings]);

    const updateCountdown = (targetIso: string) => {
        const now = new Date().getTime();
        const target = new Date(targetIso).getTime();
        const distance = target - now;
        if (distance < 0) {
            setNextRunCountdown('Pending...');
            return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setNextRunCountdown(`${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    const calculateNextAdvancedRun = () => {
        if (!settings?.advancedTime || !settings?.advancedDays || !settings?.advancedShutdown) return null;
        const [hour, minute] = settings.advancedTime.split(':').map(Number);
        const enabledDays = settings.advancedDays.split(',').map(Number);
        const now = new Date();
        for (let i = 0; i < 14; i++) {
            const checkDate = new Date();
            checkDate.setDate(now.getDate() + i);
            checkDate.setHours(hour, minute, 0, 0);
            if (checkDate.getTime() <= now.getTime()) continue;
            if (enabledDays.includes(checkDate.getDay())) return checkDate;
        }
        return null;
    };

    const handleSave = async (newSettings: SchedulerSettings) => {
        setIsSaving(true);
        try {
            await saveSchedulerSettings(newSettings);
            setSettings(newSettings);
            toast.success('Settings saved');
        } catch (error) {
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleDay = (dayIndex: number) => {
        if (!settings) return;
        const currentDays = settings.advancedDays ? settings.advancedDays.split(',').map(Number) : [];
        let newDays = currentDays.includes(dayIndex)
            ? currentDays.filter(d => d !== dayIndex)
            : [...currentDays, dayIndex].sort();
        handleSave({ ...settings, advancedDays: newDays.join(',') });
    };

    const handleCreateTask = async () => {
        if (!selectedServerId) return;
        const cron = cronSchedule === 'custom' ? customCron : cronSchedule;
        if (!cron) {
            toast.error('Invalid schedule');
            return;
        }

        try {
            await createScheduledTask(
                selectedServerId,
                newTaskType,
                cron,
                newTaskType === 'rcon-command' ? customCommand : null,
                ['announcement', 'restart'].includes(newTaskType) && announcementMsg ? announcementMsg : null,
                preWarning
            );
            toast.success('Task created');
            setIsTaskModalOpen(false);
            fetchTasks();
        } catch (error) {
            toast.error('Failed to create task');
        }
    };

    const handleDeleteTask = async (taskId: number) => {
        if (!confirm('Are you sure you want to delete this task?')) return;
        try {
            await deleteScheduledTask(taskId);
            toast.success('Task deleted');
            fetchTasks(); // Refresh list
        } catch (error) {
            toast.error('Failed to delete task');
        }
    };

    const handleToggleTask = async (taskId: number, current: boolean) => {
        try {
            await toggleScheduledTask(taskId, !current);
            fetchTasks();
        } catch (error) {
            toast.error('Failed to toggle task');
        }
    };

    if (!settings) return <div className="p-10 text-center text-slate-500">Loading scheduler settings...</div>;

    const daysOfWeek = [
        { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
        { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 },
    ];

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500 relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                        Scheduler
                    </h1>
                    <p className="text-slate-400 mt-1">Configure automated server restarts and workflows.</p>
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
                </div>
            </div>

            {/* Basic Schedule Section */}
            <div className={cn(
                "border rounded-xl p-6 transition-all relative overflow-hidden",
                settings.mode === 'basic'
                    ? "border-green-500/50 bg-green-500/5 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                    : "border-red-500/20 bg-red-500/5 opacity-80 hover:opacity-100"
            )}>
                {settings.mode === 'basic' && (
                    <div className="absolute top-0 right-0 p-2">
                        <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-900/40 px-3 py-1 rounded-full uppercase tracking-wider">
                            <CheckCircle className="w-3 h-3" /> Active
                        </span>
                    </div>
                )}
                <h2 className={cn("text-lg font-bold mb-1", settings.mode === 'basic' ? "text-green-400" : "text-red-400")}>
                    Basic Schedule: Loop Restart
                </h2>
                <p className="text-slate-400 text-sm mb-4">Restart the server every X hours relative to the last start.</p>
                <div className="space-y-4">
                    <div className="text-sm text-slate-300">
                        <span className="text-slate-500">Warning Sequence:</span> Players are warned at
                        <span className="text-amber-400 font-mono mx-1">{settings.basicWarningMinutes}</span>
                        minute(s) before the server stops.
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        <select
                            value={settings.basicIntervalHours}
                            onChange={(e) => setSettings({ ...settings, basicIntervalHours: Number(e.target.value) })}
                            className="bg-slate-900/80 border border-slate-700 rounded px-3 py-2 text-white w-32 focus:border-green-500 focus:outline-none"
                        >
                            {[1, 2, 3, 4, 6, 8, 12, 24].map(h => (
                                <option key={h} value={h}>{h} hours</option>
                            ))}
                        </select>
                        <button
                            onClick={() => handleSave({ ...settings, mode: 'basic' })}
                            className={cn(
                                "px-4 py-2 rounded font-medium transition-colors flex items-center gap-2",
                                settings.mode === 'basic' ? "bg-green-600 hover:bg-green-500 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                            )}
                        >
                            {settings.mode === 'basic' ? "Settings Saved" : "Enable Basic Schedule"}
                        </button>
                        <div className={cn("ml-auto text-sm font-mono", settings.mode === 'basic' ? "text-green-400" : "text-slate-500")}>
                            {settings.mode === 'basic' && settings.nextRunBasic ? `Next shutdown in: ${nextRunCountdown}` : "Next shutdown not scheduled"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced Schedule Section */}
            <div className={cn(
                "border rounded-xl p-6 transition-all relative overflow-hidden",
                settings.mode === 'advanced'
                    ? "border-green-500/50 bg-green-500/5 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                    : "border-slate-800 bg-slate-900/20 opacity-90"
            )}>
                {settings.mode === 'advanced' && (
                    <div className="absolute top-0 right-0 p-2 z-10">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full uppercase tracking-wider shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                            <Activity className="w-3 h-3 animate-pulse" /> Active
                        </span>
                    </div>
                )}

                <div className="flex items-center gap-3 mb-6">
                    <div className={cn("p-2 rounded-lg transition-colors", settings.mode === 'advanced' ? "bg-green-500/10 text-green-400" : "bg-slate-800 text-slate-400")}>
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className={cn("text-lg font-bold transition-colors", settings.mode === 'advanced' ? "text-green-400" : "text-slate-200")}>
                            Advanced Schedule: Workflow
                        </h2>
                        <p className="text-slate-400 text-sm">Automated lifecycle management for your server.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Trigger Configuration */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-sky-400" /> Trigger Events
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">Shutdown Time</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="time"
                                            value={settings.advancedTime || '06:00'}
                                            onChange={(e) => setSettings({ ...settings, advancedTime: e.target.value })}
                                            className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white text-lg font-mono focus:border-sky-500 focus:outline-none w-full"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">Active Days</label>
                                    <div className="flex flex-wrap gap-2">
                                        {daysOfWeek.map((day) => {
                                            const isChecked = settings.advancedDays?.split(',').map(Number).includes(day.value);
                                            return (
                                                <button
                                                    key={day.value}
                                                    onClick={() => toggleDay(day.value)}
                                                    className={cn(
                                                        "w-9 h-9 rounded-lg text-xs font-bold transition-all border",
                                                        isChecked
                                                            ? "bg-sky-500 text-white border-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.3)]"
                                                            : "bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-300"
                                                    )}
                                                >
                                                    {day.label.slice(0, 1)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-800/50">
                                    <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">Warning Sequence</label>
                                    <div className="relative">
                                        <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                                        <input
                                            type="text"
                                            value={settings.advancedWarningMinutes || ''}
                                            onChange={(e) => setSettings({ ...settings, advancedWarningMinutes: e.target.value })}
                                            placeholder="10,5,3,1"
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:border-amber-500 focus:outline-none font-mono placeholder:text-slate-600"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1.5 ml-1">Comma-separated minutes before shutdown to warn players.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Workflow Steps */}
                    <div className="lg:col-span-7 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                <Activity className="w-4 h-4 text-purple-400" /> Execution Chain
                            </h3>
                            <div className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">
                                Sequential Execution
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Step 1: Shutdown */}
                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden",
                                settings.advancedShutdown
                                    ? "bg-red-500/5 border-red-500/30 hover:border-red-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedShutdown ? "bg-red-500 border-red-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">1</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedShutdown ? "text-white" : "text-slate-400")}>Stop Server</span>
                                        <input type="checkbox" checked={settings.advancedShutdown || false} onChange={(e) => setSettings({ ...settings, advancedShutdown: e.target.checked })} className="sr-only" />
                                        {settings.advancedShutdown && <CheckCircle className="w-4 h-4 text-red-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Gracefully save world and stop the server process.</p>
                                </div>
                                {settings.advancedShutdown && <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent pointer-events-none" />}
                            </label>

                            {/* Step 2: Update */}
                            <div className="flex justify-center -my-2 relative z-0">
                                <div className={cn("w-0.5 h-6", settings.advancedShutdown && settings.advancedUpdate ? "bg-slate-600" : "bg-slate-800")}></div>
                            </div>

                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden",
                                settings.advancedUpdate
                                    ? "bg-blue-500/5 border-blue-500/30 hover:border-blue-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedUpdate ? "bg-blue-500 border-blue-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">2</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedUpdate ? "text-white" : "text-slate-400")}>Update Server</span>
                                        <input type="checkbox" checked={settings.advancedUpdate || false} onChange={(e) => setSettings({ ...settings, advancedUpdate: e.target.checked })} className="sr-only" />
                                        {settings.advancedUpdate && <CheckCircle className="w-4 h-4 text-blue-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Run SteamCMD update to get latest patch.</p>
                                </div>
                                {settings.advancedUpdate && <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent pointer-events-none" />}
                            </label>

                            {/* Step 3: Restart */}
                            <div className="flex justify-center -my-2 relative z-0">
                                <div className={cn("w-0.5 h-6", settings.advancedUpdate && settings.advancedRestart ? "bg-slate-600" : "bg-slate-800")}></div>
                            </div>

                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden",
                                settings.advancedRestart
                                    ? "bg-green-500/5 border-green-500/30 hover:border-green-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedRestart ? "bg-green-500 border-green-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">3</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedRestart ? "text-white" : "text-slate-400")}>Start Server</span>
                                        <input type="checkbox" checked={settings.advancedRestart || false} onChange={(e) => setSettings({ ...settings, advancedRestart: e.target.checked })} className="sr-only" />
                                        {settings.advancedRestart && <CheckCircle className="w-4 h-4 text-green-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Boot up the server instance.</p>
                                </div>
                                {settings.advancedRestart && <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent pointer-events-none" />}
                            </label>

                            {/* Step 4: Maintenance */}
                            <div className="flex justify-center -my-2 relative z-0">
                                <div className={cn("w-0.5 h-6", settings.advancedRestart && settings.advancedDinoWipe ? "bg-slate-600" : "bg-slate-800")}></div>
                            </div>

                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden",
                                settings.advancedDinoWipe
                                    ? "bg-purple-500/5 border-purple-500/30 hover:border-purple-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedDinoWipe ? "bg-purple-500 border-purple-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">4</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedDinoWipe ? "text-white" : "text-slate-400")}>Destroy Wild Dinos</span>
                                        <input type="checkbox" checked={settings.advancedDinoWipe || false} onChange={(e) => setSettings({ ...settings, advancedDinoWipe: e.target.checked })} className="sr-only" />
                                        {settings.advancedDinoWipe && <CheckCircle className="w-4 h-4 text-purple-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Run 'DestroyWildDinos' command after startup.</p>
                                </div>
                                {settings.advancedDinoWipe && <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent pointer-events-none" />}
                            </label>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-800">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Status:</span>
                        <span className={cn("font-mono font-medium", settings.mode === 'advanced' ? "text-green-400" : "text-slate-400")}>
                            {settings.mode === 'advanced' ? (
                                <span className="flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    Next run: {nextRunCountdown}
                                </span>
                            ) : "Inactive"}
                        </span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleSave(settings)}
                            disabled={isSaving}
                            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                            onClick={() => handleSave({ ...settings, mode: 'advanced' })}
                            className={cn(
                                "px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2",
                                settings.mode === 'advanced'
                                    ? "bg-green-500/10 border border-green-500/50 text-green-400 cursor-default"
                                    : "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-900/20"
                            )}
                        >
                            {settings.mode === 'advanced' ? (
                                <>
                                    <CheckCircle className="w-4 h-4" /> Mode Active
                                </>
                            ) : (
                                <>
                                    <Zap className="w-4 h-4 fill-current" /> Activate Mode
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Configured Tasks List */}
            {settings.mode === 'advanced' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white">Scheduled Tasks</h3>
                        <button
                            onClick={() => setIsTaskModalOpen(true)}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Task
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tasks.map(task => {
                            const taskTypeInfo = TASK_TYPES.find(t => t.value === task.task_type) || TASK_TYPES[0];
                            const Icon = taskTypeInfo.icon;
                            return (
                                <div key={task.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 group hover:border-slate-700 transition-all">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={cn("p-2 rounded-lg", taskTypeInfo.bg)}>
                                                <Icon className={cn("w-5 h-5", taskTypeInfo.color)} />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-white">{taskTypeInfo.label}</div>
                                                <div className="text-xs text-slate-500 font-mono">{task.cron_expression}</div>
                                            </div>
                                        </div>
                                        <button onClick={() => handleToggleTask(task.id, task.enabled)} className={cn("w-8 h-4 rounded-full relative transition-colors", task.enabled ? "bg-green-500" : "bg-slate-700")}>
                                            <div className={cn("absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform", task.enabled ? "translate-x-4" : "translate-x-0")} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
                                        <span className="text-xs text-slate-500">
                                            Last run: {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
                                        </span>
                                        <button onClick={() => handleDeleteTask(task.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {tasks.length === 0 && (
                            <div className="col-span-full py-8 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
                                No additional tasks scheduled
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add Task Modal */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <h2 className="text-xl font-bold text-white mb-6">Add Scheduled Task</h2>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Task Type</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {TASK_TYPES.map(type => {
                                            const Icon = type.icon;
                                            return (
                                                <button
                                                    key={type.value}
                                                    onClick={() => setNewTaskType(type.value)}
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                                                        newTaskType === type.value
                                                            ? `bg-slate-800 ${type.border} ring-1 ring-purple-500/50`
                                                            : "bg-slate-900 border-slate-800 hover:border-slate-700"
                                                    )}
                                                >
                                                    <Icon className={cn("w-5 h-5", type.color)} />
                                                    <span className="text-sm font-medium text-slate-200">{type.label}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Schedule</label>
                                    <select
                                        value={cronSchedule}
                                        onChange={(e) => setCronSchedule(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="0 */1 * * *">Every 1 hour</option>
                                        <option value="0 */3 * * *">Every 3 hours</option>
                                        <option value="0 */6 * * *">Every 6 hours</option>
                                        <option value="0 */12 * * *">Every 12 hours</option>
                                        <option value="0 4 * * *">Daily at 4:00 AM</option>
                                        <option value="custom">Custom Cron Expression</option>
                                    </select>

                                    {cronSchedule === 'custom' && (
                                        <input
                                            type="text"
                                            value={customCron}
                                            onChange={(e) => setCustomCron(e.target.value)}
                                            placeholder="* * * * *"
                                            className="mt-3 w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white font-mono text-sm"
                                        />
                                    )}
                                </div>

                                {newTaskType === 'rcon-command' && (
                                    <div className="animate-in slide-in-from-top-2 duration-200">
                                        <label className="block text-sm font-medium text-slate-400 mb-2">RCON Command</label>
                                        <input
                                            type="text"
                                            value={customCommand}
                                            onChange={(e) => setCustomCommand(e.target.value)}
                                            placeholder="e.g. SaveWorld, Broadcast Hello"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                                        />
                                    </div>
                                )}

                                {newTaskType === 'announcement' && (
                                    <div className="animate-in slide-in-from-top-2 duration-200">
                                        <label className="block text-sm font-medium text-slate-400 mb-2">Announcement Message</label>
                                        <textarea
                                            value={announcementMsg}
                                            onChange={(e) => setAnnouncementMsg(e.target.value)}
                                            placeholder="Enter message to broadcast..."
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[80px]"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Pre-warning (minutes)</label>
                                    <input
                                        type="number"
                                        value={preWarning}
                                        onChange={(e) => setPreWarning(Number(e.target.value))}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Broadcast warning to players before task executes</p>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => setIsTaskModalOpen(false)}
                                        className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateTask}
                                        className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-purple-900/20"
                                    >
                                        Create Task
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
