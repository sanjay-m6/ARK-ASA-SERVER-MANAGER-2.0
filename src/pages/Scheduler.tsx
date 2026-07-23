import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
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
    CheckCircle,
    Download,
    AlertTriangle,
    Shield,
    Pencil,
    ChevronDown,
    Check,
    Clock,
    Calendar,
    X
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
    { value: 'restart', labelKey: 'scheduler.restart', icon: RefreshCw, color: 'text-orange-400', border: 'border-orange-500/50', bg: 'bg-orange-500/10' },
    { value: 'AutoUpdateMods', labelKey: 'scheduler.autoUpdateMods', icon: Download, color: 'text-cyan-400', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10' },
    { value: 'backup', labelKey: 'scheduler.backup', icon: Terminal, color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10' },
    { value: 'save-world', labelKey: 'scheduler.saveWorld', icon: Save, color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' },
    { value: 'announcement', labelKey: 'scheduler.broadcast', icon: MessageSquare, color: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-500/10' },
    { value: 'destroy-wild-dinos', labelKey: 'scheduler.destroyDinos', icon: Zap, color: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-500/10' },
    { value: 'rcon-command', labelKey: 'scheduler.rconCommand', icon: ServerIcon, color: 'text-cyan-400', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10' },
];

interface CustomSelectOption {
    value: string | number;
    label: string;
    desc?: string;
    icon?: any;
}

function CustomDropdown({
    options,
    value,
    onChange,
    placeholder = 'Select option...',
    className
}: {
    options: CustomSelectOption[];
    value: string | number;
    onChange: (val: any) => void;
    placeholder?: string;
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(o => String(o.value) === String(value)) || options[0];

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.custom-dropdown-container')) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className={cn("relative custom-dropdown-container", isOpen && "z-50", className)}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-slate-900/90 border border-slate-700/70 hover:border-purple-500/50 rounded-xl px-4 py-2.5 text-white flex items-center justify-between transition-all text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/50 shadow-sm"
            >
                <div className="flex items-center gap-2.5 truncate">
                    {selectedOption?.icon && (
                        <selectedOption.icon className="w-4 h-4 text-purple-400 shrink-0" />
                    )}
                    <span className="truncate">{selectedOption?.label || placeholder}</span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-[110] left-0 right-0 mt-2 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-purple-950/40 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1 max-h-60 overflow-y-auto">
                    {options.map((opt) => {
                        const isSelected = String(opt.value) === String(value);
                        const Icon = opt.icon;
                        return (
                            <button
                                key={String(opt.value)}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left text-xs font-semibold group",
                                    isSelected
                                        ? "bg-purple-600/20 border border-purple-500/40 text-white shadow-sm"
                                        : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                                )}
                            >
                                <div className="flex items-center gap-2.5 truncate">
                                    {Icon && <Icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-purple-400" : "text-slate-400 group-hover:text-purple-400")} />}
                                    <div>
                                        <div className="truncate font-medium">{opt.label}</div>
                                        {opt.desc && <div className="text-[10px] text-slate-500 group-hover:text-slate-400 font-normal">{opt.desc}</div>}
                                    </div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-purple-400 shrink-0 ml-2" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function Scheduler() {
    const { t } = useTranslation();
    
    const getTaskTypeLabel = (labelKey: string) => {
        if (labelKey === 'scheduler.boostStart') return t('scheduler.boostStart', 'Boost Event Start');
        if (labelKey === 'scheduler.boostEnd') return t('scheduler.boostEnd', 'Boost Event End');
        if (labelKey === 'scheduler.saveWorld') return t('scheduler.saveWorld', 'Save World');
        return t(labelKey);
    };

    const { servers, setServers, activeServer } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);

    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        }
    }, [activeServer]);
    const [settings, setSettings] = useState<SchedulerSettings | null>(null);
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);

    // UI States
    const [isSaving, setIsSaving] = useState(false);
    const [nextRunCountdown, setNextRunCountdown] = useState<string>('');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

    // New Task Form State
    const [newTaskName, setNewTaskName] = useState('');
    const [newTaskType, setNewTaskType] = useState('restart');
    const [cronSchedule, setCronSchedule] = useState('0 */6 * * *'); // Every 6 hours default
    const [customCron, setCustomCron] = useState('');
    const [preWarning, setPreWarning] = useState(5);
    const [customCommand, setCustomCommand] = useState('');
    const [announcementMsg, setAnnouncementMsg] = useState('');

    // Delete Confirmation State
    const [taskToDelete, setTaskToDelete] = useState<number | null>(null);

    // Edit Task State
    const [editingTaskId, setEditingTaskId] = useState<number | null>(null);

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
            const normalized: SchedulerSettings = {
                serverId: selectedServerId,
                mode: data?.mode || 'disabled',
                basicIntervalHours: data?.basicIntervalHours ?? 6,
                basicWarningMinutes: data?.basicWarningMinutes || '30,10,5,1',
                nextRunBasic: data?.nextRunBasic ?? null,
                advancedTime: data?.advancedTime || '06:00',
                advancedDays: (data?.advancedDays && data.advancedDays.trim() !== '') ? data.advancedDays : '0,1,2,3,4,5,6',
                advancedWarningMinutes: data?.advancedWarningMinutes || '30,15,10,5,1',
                advancedShutdown: data?.advancedShutdown ?? false,
                advancedBackup: data?.advancedBackup ?? false,
                advancedUpdate: data?.advancedUpdate ?? false,
                advancedRestart: data?.advancedRestart ?? false,
                advancedDinoWipe: data?.advancedDinoWipe ?? false,
                watchdogEnabled: data?.watchdogEnabled ?? false,
            };
            setSettings(normalized);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
            toast.error(t('scheduler.loadFailed', 'Failed to load scheduler settings'));
            // Fallback to default settings so the UI is not blocked on a loading state
            setSettings({
                serverId: selectedServerId,
                mode: 'disabled',
                basicIntervalHours: 6,
                basicWarningMinutes: '30,10,5,1',
                nextRunBasic: null,
                advancedTime: '06:00',
                advancedDays: '0,1,2,3,4,5,6',
                advancedWarningMinutes: '30,15,10,5,1',
                advancedShutdown: false,
                advancedBackup: false,
                advancedUpdate: false,
                advancedRestart: false,
                advancedDinoWipe: false,
                watchdogEnabled: false,
            });
        }
    };

    const fetchTasks = async () => {
        if (!selectedServerId) return;
        try {
            const data = await getScheduledTasks(selectedServerId);
            setTasks(data);
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
            toast.error(t('scheduler.loadTasksFailed', 'Failed to load scheduled tasks'));
            setTasks([]);
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
                else setNextRunCountdown(t('scheduler.notScheduled'));
            } else {
                setNextRunCountdown(t('scheduler.notScheduled'));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [settings]);

    const updateCountdown = (targetIso: string) => {
        const now = new Date().getTime();
        const target = new Date(targetIso).getTime();
        const distance = target - now;
        if (distance < 0) {
            setNextRunCountdown(t('scheduler.pending'));
            return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setNextRunCountdown(`${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    const calculateNextAdvancedRun = () => {
        if (!settings?.advancedTime) return null;
        const hasStep = settings.advancedShutdown || settings.advancedBackup || settings.advancedUpdate || settings.advancedRestart || settings.advancedDinoWipe;
        if (!hasStep) return null;
        const [hour, minute] = settings.advancedTime.split(':').map(Number);
        const rawDays = settings.advancedDays?.trim();
        const enabledDays = rawDays && rawDays.length > 0 ? rawDays.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6];
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
            toast.success(t('scheduler.saveSuccess'));
        } catch (error) {
            toast.error(t('scheduler.saveFailed'));
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
            toast.error(t('scheduler.invalidSchedule'));
            return;
        }

        try {
            await createScheduledTask(
                selectedServerId,
                newTaskName || null,
                newTaskType,
                cron,
                newTaskType === 'rcon-command' ? customCommand : null,
                announcementMsg.trim() ? announcementMsg.trim() : null,
                preWarning
            );
            if (editingTaskId !== null) {
                await deleteScheduledTask(editingTaskId);
            }
            toast.success(editingTaskId !== null ? t('scheduler.taskUpdated', 'Task updated successfully') : t('scheduler.taskCreated'));
            setIsTaskModalOpen(false);
            setEditingTaskId(null);
            setNewTaskName('');
            setNewTaskType('restart');
            setCronSchedule('0 */6 * * *');
            setCustomCron('');
            setPreWarning(5);
            setCustomCommand('');
            setAnnouncementMsg('');
            fetchTasks();
        } catch (error) {
            toast.error(t('scheduler.createFailed', { error: String(error) }));
        }
    };

    const handleDeleteClick = (taskId: number) => {
        setTaskToDelete(taskId);
    };

    const confirmDeleteTask = async () => {
        if (!taskToDelete) return;
        try {
            await deleteScheduledTask(taskToDelete);
            toast.success(t('scheduler.taskDeleted'));
            fetchTasks(); // Refresh list
        } catch (error) {
            toast.error(t('scheduler.deleteFailed', { error: String(error) }));
        } finally {
            setTaskToDelete(null);
        }
    };

    const handleToggleTask = async (taskId: number, current: boolean) => {
        try {
            await toggleScheduledTask(taskId, !current);
            fetchTasks();
        } catch (error) {
            toast.error(t('scheduler.toggleFailed'));
        }
    };

    const handleEditTask = (task: ScheduledTask) => {
        setEditingTaskId(task.id);
        setNewTaskName(task.taskName || '');
        setNewTaskType(task.taskType);
        // Determine if cron matches a preset or is custom
        const presetCrons = ['0 */1 * * *', '0 */3 * * *', '0 */6 * * *', '0 */12 * * *', '0 4 * * *', '@online'];
        if (presetCrons.includes(task.cronExpression)) {
            setCronSchedule(task.cronExpression);
            setCustomCron('');
        } else {
            setCronSchedule('custom');
            setCustomCron(task.cronExpression);
        }
        setCustomCommand(task.command || '');
        setAnnouncementMsg(task.message || '');
        setPreWarning(task.preWarningMinutes || 0);
        setIsTaskModalOpen(true);
    };

    if (servers.length === 0) {
        return (
            <div className="space-y-6 pb-20 animate-in fade-in duration-500 relative">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                            {t('scheduler.title')}
                        </h1>
                        <p className="text-slate-400 mt-1">{t('scheduler.subtitle')}</p>
                    </div>
                </div>

                <div className="border border-slate-800 rounded-xl p-10 text-center bg-slate-900/20">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4 animate-bounce" />
                    <h3 className="text-lg font-bold text-white mb-2">{t('scheduler.noServers', 'No Servers Found')}</h3>
                    <p className="text-slate-400 text-sm max-w-md mx-auto">
                        {t('scheduler.noServersDesc', 'Please create a server in Server Manager first to configure scheduled tasks.')}
                    </p>
                </div>
            </div>
        );
    }

    if (!settings) return <div className="p-10 text-center text-slate-500">{t('common.loading', 'Loading...')}</div>;

    // Days of week moved after t is available if needed, but labels are hardcoded 3-letter. 
    // Usually these are fine, or we can use dayjs/date-fns/Intl. But for now keeping as is or translating short days.
    const daysOfWeek = [
        { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
        { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 },
    ];

    const describeCron = (cron: string): string => {
        if (!cron || cron.trim() === '') return 'Type a custom expression or pick a quick preset below';
        const trimmed = cron.trim();

        // Standard presets
        if (trimmed === '@online') return 'Executes immediately whenever the server starts up';
        if (trimmed === '* * * * *') return 'Executes every minute';
        if (trimmed === '*/5 * * * *') return 'Executes every 5 minutes';
        if (trimmed === '*/15 * * * *') return 'Executes every 15 minutes';
        if (trimmed === '*/30 * * * *') return 'Executes every 30 minutes';
        if (trimmed === '0 * * * *') return 'Executes every hour at minute 0';
        if (trimmed === '0 */2 * * *') return 'Executes every 2 hours at minute 0';
        if (trimmed === '0 */3 * * *') return 'Executes every 3 hours at minute 0';
        if (trimmed === '0 */4 * * *') return 'Executes every 4 hours at minute 0';
        if (trimmed === '0 */6 * * *') return 'Executes every 6 hours at minute 0';
        if (trimmed === '0 */12 * * *') return 'Executes every 12 hours at minute 0';
        if (trimmed === '0 0 * * *') return 'Executes every day at midnight (00:00)';

        const parts = trimmed.split(/\s+/);
        if (parts.length === 5) {
            const [min, hr, dom, m, dow] = parts;
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            // 1. Check interval minutes (e.g. */10 * * * *)
            if (min.startsWith('*/') && hr === '*' && (dom === '*' || dom === '0') && (m === '*' || m === '0') && (dow === '*' || dow === '0')) {
                return `Executes every ${min.replace('*/', '')} minutes`;
            }

            // 2. Check interval hours (e.g. 0 */4 * * *)
            if (hr.startsWith('*/') && (dom === '*' || dom === '0') && (m === '*' || m === '0') && (dow === '*' || dow === '0')) {
                const mStr = min === '*' ? '0' : min;
                return `Executes every ${hr.replace('*/', '')} hours at minute ${mStr}`;
            }

            // 3. Time formatting (e.g. 0 12 or 30 4)
            let timeStr = '';
            if (!isNaN(Number(hr)) && !isNaN(Number(min))) {
                const hNum = Number(hr);
                const mNum = Number(min);
                const ampm = hNum >= 12 ? 'PM' : 'AM';
                const displayH = hNum % 12 === 0 ? 12 : hNum % 12;
                const displayM = mNum < 10 ? `0${mNum}` : `${mNum}`;
                timeStr = `${displayH}:${displayM} ${ampm}`;
            } else if (hr === '*' && !isNaN(Number(min))) {
                timeStr = `at minute ${min} of every hour`;
            }

            // Daily at HH:MM
            if (timeStr && (dom === '*' || dom === '0') && (m === '*' || m === '0') && (dow === '*' || dow === '0')) {
                return `Executes daily at ${timeStr}`;
            }

            // Weekly on specific Day of Week (e.g. 0 3 * * 0)
            if (timeStr && (dom === '*' || dom === '0') && (m === '*' || m === '0') && !isNaN(Number(dow))) {
                const dayName = days[Number(dow) % 7] || `Day ${dow}`;
                return `Executes every ${dayName} at ${timeStr}`;
            }

            // Specific Day of Month (e.g. 0 0 1 * *)
            if (timeStr && !isNaN(Number(dom)) && Number(dom) > 0 && (m === '*' || m === '0') && (dow === '*' || dow === '0')) {
                return `Executes on day ${dom} of every month at ${timeStr}`;
            }
        }

        return `Custom schedule: "${trimmed}"`;
    };

    const applyStandard6hPreset = () => {
        if (!settings) return;
        handleSave({
            ...settings,
            mode: 'basic',
            basicIntervalHours: 6,
            basicWarningMinutes: '15,10,5,1'
        });
        toast.success(t('scheduler.presetApplied', 'Applied 6-Hour Maintenance Loop Preset'));
    };

    const applyDailyMaintenancePreset = () => {
        if (!settings) return;
        handleSave({
            ...settings,
            mode: 'advanced',
            advancedTime: '03:00',
            advancedDays: '0,1,2,3,4,5,6',
            advancedWarningMinutes: '15,10,5,1',
            advancedShutdown: true,
            advancedBackup: true,
            advancedUpdate: true,
            advancedRestart: true,
            advancedDinoWipe: true
        });
        toast.success(t('scheduler.presetApplied', 'Applied Daily 3:00 AM Maintenance Chain Preset'));
    };

    const applyHourlyDinoWipeTask = async () => {
        if (!selectedServerId) return;
        try {
            await createScheduledTask(
                selectedServerId,
                'Hourly Wild Dino Wipe',
                'destroy-wild-dinos',
                '0 * * * *',
                null,
                null,
                0
            );
            toast.success(t('scheduler.taskCreated', 'Created Hourly Dino Wipe Task'));
            fetchTasks();
        } catch (err) {
            toast.error('Failed to create task');
        }
    };

    const apply3hSaveWorldTask = async () => {
        if (!selectedServerId) return;
        try {
            await createScheduledTask(
                selectedServerId,
                '3-Hour World Save Snapshot',
                'save-world',
                '0 */3 * * *',
                null,
                null,
                0
            );
            toast.success(t('scheduler.taskCreated', 'Created 3-Hour World Save Task'));
            fetchTasks();
        } catch (err) {
            toast.error('Failed to create task');
        }
    };

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500 relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 flex items-center gap-3">
                        <Activity className="w-8 h-8 text-purple-400" />
                        {t('scheduler.title')}
                    </h1>
                    <p className="text-slate-400 mt-1">{t('scheduler.subtitle')}</p>
                </div>
                {activeServer && (
                    <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 px-4 py-2 rounded-xl">
                        <ServerIcon className="w-4 h-4 text-purple-400" />
                        <div>
                            <div className="text-xs font-bold text-white">{activeServer.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">ID #{activeServer.id} • Port {activeServer.ports?.gamePort || 7777}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Preset One-Click Automation Recipes */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" /> 1-Click Automation Preset Recipes
                    </h2>
                    <span className="text-[10px] text-slate-400 font-mono">Select a pre-configured template to activate instantly</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <button
                        onClick={applyStandard6hPreset}
                        className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-green-500/50 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-green-400 mb-1">
                            <RefreshCw className="w-4 h-4 text-green-400 group-hover:rotate-180 transition-transform duration-500" />
                            6-Hour Maintenance Loop
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight">Restarts server every 6 hrs with 15m, 10m, 5m, 1m warnings & RCON SaveWorld.</p>
                    </button>

                    <button
                        onClick={applyDailyMaintenancePreset}
                        className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-purple-500/50 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-purple-400 mb-1">
                            <Shield className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                            Daily 3 AM Full Pipeline
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight">SaveWorld → Graceful Stop → Pre-Backup → SteamCMD Mod Update → Dino Wipe.</p>
                    </button>

                    <button
                        onClick={applyHourlyDinoWipeTask}
                        className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-red-500/50 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-red-400 mb-1">
                            <Zap className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
                            Hourly Wild Dino Wipe
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight">Runs DestroyWildDinos RCON command every hour on minute 0.</p>
                    </button>

                    <button
                        onClick={apply3hSaveWorldTask}
                        className="flex flex-col text-left p-3.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/50 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-400 mb-1">
                            <Save className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                            3-Hour Save Snapshot
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight">Issues RCON SaveWorld every 3 hours to prevent data loss.</p>
                    </button>
                </div>
            </div>

            {/* Master Scheduler Engine Mode Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-4 h-4 text-purple-400" /> Scheduler Engine Status
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Switch between Disabled, Basic Loop Restart, or Advanced Maintenance Chain mode.</p>
                </div>
                <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-2xl border border-slate-800 shadow-inner">
                    <button
                        onClick={() => handleSave({ ...settings, mode: 'disabled' })}
                        className={cn(
                            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                            settings.mode === 'disabled'
                                ? "bg-red-500/20 text-red-400 border border-red-500/50 shadow-sm"
                                : "text-slate-400 hover:text-white hover:bg-slate-800/80"
                        )}
                    >
                        <X className="w-3.5 h-3.5" /> Disabled (Off)
                    </button>

                    <button
                        onClick={() => handleSave({ ...settings, mode: 'basic' })}
                        className={cn(
                            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                            settings.mode === 'basic'
                                ? "bg-green-500/20 text-green-400 border border-green-500/50 shadow-sm"
                                : "text-slate-400 hover:text-white hover:bg-slate-800/80"
                        )}
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Basic Loop Mode
                    </button>

                    <button
                        onClick={() => handleSave({ ...settings, mode: 'advanced' })}
                        className={cn(
                            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                            settings.mode === 'advanced'
                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/50 shadow-sm"
                                : "text-slate-400 hover:text-white hover:bg-slate-800/80"
                        )}
                    >
                        <Zap className="w-3.5 h-3.5" /> Advanced Pipeline
                    </button>
                </div>
            </div>

            {/* Basic Schedule Section */}
            <div className={cn(
                "border rounded-xl p-6 transition-all relative z-10",
                settings.mode === 'basic'
                    ? "border-green-500/50 bg-green-500/5 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                    : "border-slate-800/80 bg-slate-900/10 opacity-70 hover:opacity-100 hover:border-slate-700/50"
            )}>
                <div className="flex items-center justify-between mb-2">
                    <h2 className={cn("text-lg font-bold", settings.mode === 'basic' ? "text-green-400" : "text-slate-300")}>
                        {t('scheduler.basicTitle')}
                    </h2>
                    {settings.mode === 'basic' ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-900/40 px-3 py-1 rounded-full uppercase tracking-wider border border-green-500/30">
                            <CheckCircle className="w-3 h-3" /> ACTIVE
                        </span>
                    ) : (
                        <span className="text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full uppercase tracking-wider">
                            INACTIVE
                        </span>
                    )}
                </div>
                <p className="text-slate-400 text-sm mb-4">{t('scheduler.basicDesc')}</p>
                <div className="space-y-4">
                    <div className="text-sm text-slate-300">
                        <span className="text-slate-500">{t('scheduler.warningSequence')}</span> {t('scheduler.warningMessage')}
                        <span className="text-amber-400 font-mono mx-1">{settings.basicWarningMinutes}</span>
                        {t('scheduler.warningSuffix')}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        <CustomDropdown
                            options={[1, 2, 3, 4, 6, 8, 12, 24].map(h => ({
                                value: h,
                                label: `${h} ${h === 1 ? 'Hour' : 'Hours'}`,
                                desc: `Restarts every ${h} ${h === 1 ? 'hour' : 'hours'}`,
                                icon: Clock
                            }))}
                            value={settings.basicIntervalHours}
                            onChange={(val) => setSettings({ ...settings, basicIntervalHours: Number(val) })}
                            className="w-44"
                        />
                        <button
                            onClick={() => handleSave({ ...settings, mode: 'basic' })}
                            className={cn(
                                "px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:outline-none shadow-sm",
                                settings.mode === 'basic' ? "bg-green-600 hover:bg-green-500 text-white shadow-green-900/20" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                            )}
                        >
                            <Save className="w-4 h-4" />
                            {settings.mode === 'basic' ? t('common.saveChanges', 'Save Settings') : t('scheduler.enableBasic', 'Enable Basic Mode')}
                        </button>
                        {settings.mode === 'basic' && (
                            <button
                                onClick={() => handleSave({ ...settings, mode: 'disabled' })}
                                className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
                            >
                                <X className="w-4 h-4" /> Disable Basic Schedule
                            </button>
                        )}
                        <div className={cn("ml-auto text-sm font-mono", settings.mode === 'basic' ? "text-green-400" : "text-slate-500")}>
                            {settings.mode === 'basic' && settings.nextRunBasic ? t('scheduler.nextShutdown', { time: nextRunCountdown }) : t('scheduler.nextShutdownNone')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced Schedule Section */}
            <div className={cn(
                "border rounded-xl p-6 transition-all relative overflow-hidden",
                settings.mode === 'advanced'
                    ? "border-purple-500/50 bg-purple-500/5 shadow-[0_0_20px_rgba(168,85,247,0.1)]"
                    : "border-slate-800/80 bg-slate-900/10 opacity-70 hover:opacity-100 hover:border-slate-700/50"
            )}>
                {settings.mode === 'advanced' && (
                    <div className="absolute top-0 right-0 p-2 z-10">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full uppercase tracking-wider shadow-[0_0_10px_rgba(168,85,247,0.2)]">
                            <Activity className="w-3 h-3 animate-pulse" /> {t('common.active')}
                        </span>
                    </div>
                )}

                <div className="flex items-center gap-3 mb-6">
                    <div className={cn("p-2 rounded-lg transition-colors", settings.mode === 'advanced' ? "bg-purple-500/10 text-purple-400" : "bg-slate-800/80 text-slate-400")}>
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className={cn("text-lg font-bold transition-colors", settings.mode === 'advanced' ? "text-purple-400" : "text-slate-200")}>
                            {t('scheduler.advancedTitle')}
                        </h2>
                        <p className="text-slate-400 text-sm">{t('scheduler.advancedDesc')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Trigger Configuration */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-sky-400" /> {t('scheduler.triggerEvents')}
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="advanced-shutdown-time" className="block text-xs font-semibold text-slate-500 mb-2 uppercase">{t('scheduler.shutdownTime')}</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            id="advanced-shutdown-time"
                                            type="time"
                                            value={settings.advancedTime || '06:00'}
                                            onChange={(e) => setSettings({ ...settings, advancedTime: e.target.value })}
                                            className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white text-lg font-mono focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 focus:outline-none w-full transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <span className="block text-xs font-semibold text-slate-500 mb-2 uppercase">{t('scheduler.activeDays')}</span>
                                    <div className="flex flex-wrap gap-2" role="group" aria-label={t('scheduler.activeDays', 'Active Days')}>
                                        {daysOfWeek.map((day) => {
                                            const isChecked = settings.advancedDays?.split(',').map(Number).includes(day.value);
                                            return (
                                                <button
                                                    key={day.value}
                                                    type="button"
                                                    onClick={() => toggleDay(day.value)}
                                                    aria-pressed={isChecked}
                                                    aria-label={day.label}
                                                    className={cn(
                                                        "w-9 h-9 rounded-lg text-xs font-bold transition-all border focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none",
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
                                    <label htmlFor="advanced-warning-sequence" className="block text-xs font-semibold text-slate-500 mb-2 uppercase">{t('scheduler.warningSequence')}</label>
                                    <div className="relative">
                                        <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                                        <input
                                            id="advanced-warning-sequence"
                                            type="text"
                                            value={settings.advancedWarningMinutes || ''}
                                            onChange={(e) => setSettings({ ...settings, advancedWarningMinutes: e.target.value })}
                                            placeholder="10,5,3,1"
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 focus:outline-none font-mono placeholder:text-slate-600 transition-all"
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
                                <Activity className="w-4 h-4 text-purple-400" /> {t('scheduler.executionChain')}
                            </h3>
                            <div className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">
                                {t('scheduler.sequentialExecution')}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Step 1: Shutdown */}
                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden focus-within:ring-2 focus-within:ring-red-500/50 focus-within:border-red-500/50",
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
                                        <span className={cn("font-bold text-sm", settings.advancedShutdown ? "text-white" : "text-slate-400")}>{t('scheduler.stopServer')}</span>
                                        <input id="step-shutdown-checkbox" type="checkbox" checked={settings.advancedShutdown || false} onChange={(e) => setSettings({ ...settings, advancedShutdown: e.target.checked })} className="sr-only" />
                                        {settings.advancedShutdown && <CheckCircle className="w-4 h-4 text-red-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{t('scheduler.stopServerDesc')}</p>
                                </div>
                                {settings.advancedShutdown && <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent pointer-events-none" />}
                            </label>

                            {/* Step 2: Backup */}
                            <div className="flex justify-center -my-2 relative z-0">
                                <div className={cn("w-0.5 h-6", settings.advancedShutdown && settings.advancedBackup ? "bg-slate-600" : "bg-slate-800")}></div>
                            </div>

                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50",
                                settings.advancedBackup
                                    ? "bg-blue-500/5 border-blue-500/30 hover:border-blue-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedBackup ? "bg-blue-500 border-blue-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">2</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedBackup ? "text-white" : "text-slate-400")}>{t('scheduler.backupServer', 'Backup Server')}</span>
                                        <input id="step-backup-checkbox" type="checkbox" checked={settings.advancedBackup || false} onChange={(e) => setSettings({ ...settings, advancedBackup: e.target.checked })} className="sr-only" />
                                        {settings.advancedBackup && <CheckCircle className="w-4 h-4 text-blue-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{t('scheduler.backupServerDesc', 'Create an automated backup of server files.')}</p>
                                </div>
                                {settings.advancedBackup && <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent pointer-events-none" />}
                            </label>

                            {/* Step 3: Update */}
                            <div className="flex justify-center -my-2 relative z-0">
                                <div className={cn("w-0.5 h-6", settings.advancedBackup && settings.advancedUpdate ? "bg-slate-600" : "bg-slate-800")}></div>
                            </div>

                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden focus-within:ring-2 focus-within:ring-cyan-500/50 focus-within:border-cyan-500/50",
                                settings.advancedUpdate
                                    ? "bg-cyan-500/5 border-cyan-500/30 hover:border-cyan-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedUpdate ? "bg-cyan-500 border-cyan-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">3</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedUpdate ? "text-white" : "text-slate-400")}>{t('scheduler.updateServer')}</span>
                                        <input id="step-update-checkbox" type="checkbox" checked={settings.advancedUpdate || false} onChange={(e) => setSettings({ ...settings, advancedUpdate: e.target.checked })} className="sr-only" />
                                        {settings.advancedUpdate && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{t('scheduler.updateServerDesc')}</p>
                                </div>
                                {settings.advancedUpdate && <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent pointer-events-none" />}
                            </label>

                            {/* Step 4: Restart */}
                            <div className="flex justify-center -my-2 relative z-0">
                                <div className={cn("w-0.5 h-6", settings.advancedUpdate && settings.advancedRestart ? "bg-slate-600" : "bg-slate-800")}></div>
                            </div>

                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden focus-within:ring-2 focus-within:ring-green-500/50 focus-within:border-green-500/50",
                                settings.advancedRestart
                                    ? "bg-green-500/5 border-green-500/30 hover:border-green-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedRestart ? "bg-green-500 border-green-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">4</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedRestart ? "text-white" : "text-slate-400")}>{t('scheduler.startServer')}</span>
                                        <input id="step-restart-checkbox" type="checkbox" checked={settings.advancedRestart || false} onChange={(e) => setSettings({ ...settings, advancedRestart: e.target.checked })} className="sr-only" />
                                        {settings.advancedRestart && <CheckCircle className="w-4 h-4 text-green-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{t('scheduler.startServerDesc')}</p>
                                </div>
                                {settings.advancedRestart && <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent pointer-events-none" />}
                            </label>

                            {/* Step 5: Maintenance */}
                            <div className="flex justify-center -my-2 relative z-0">
                                <div className={cn("w-0.5 h-6", settings.advancedRestart && settings.advancedDinoWipe ? "bg-slate-600" : "bg-slate-800")}></div>
                            </div>

                            <label className={cn(
                                "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group relative overflow-hidden focus-within:ring-2 focus-within:ring-purple-500/50 focus-within:border-purple-500/50",
                                settings.advancedDinoWipe
                                    ? "bg-purple-500/5 border-purple-500/30 hover:border-purple-500/50"
                                    : "bg-slate-900/30 border-slate-800 hover:border-slate-700"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10",
                                    settings.advancedDinoWipe ? "bg-purple-500 border-purple-500 text-white" : "border-slate-600 bg-transparent"
                                )}>
                                    <span className="text-xs font-bold">5</span>
                                </div>
                                <div className="flex-1 z-10">
                                    <div className="flex items-center justify-between">
                                        <span className={cn("font-bold text-sm", settings.advancedDinoWipe ? "text-white" : "text-slate-400")}>{t('scheduler.destroyDinos')}</span>
                                        <input id="step-dinowipe-checkbox" type="checkbox" checked={settings.advancedDinoWipe || false} onChange={(e) => setSettings({ ...settings, advancedDinoWipe: e.target.checked })} className="sr-only" />
                                        {settings.advancedDinoWipe && <CheckCircle className="w-4 h-4 text-purple-400" />}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{t('scheduler.destroyDinosDesc')}</p>
                                </div>
                                {settings.advancedDinoWipe && <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent pointer-events-none" />}
                            </label>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between pt-6 mt-8 pb-2 border-t border-slate-800/80 gap-4">
                    <div className="flex items-center gap-2.5 text-sm">
                        <span className="text-slate-400 font-medium">{t('scheduler.status')}:</span>
                        <span className={cn("font-mono font-bold px-3 py-1 rounded-lg border text-xs", settings.mode === 'advanced' ? "text-purple-300 bg-purple-500/10 border-purple-500/30" : "text-slate-400 bg-slate-800/50 border-slate-700/50")}>
                            {settings.mode === 'advanced' ? (
                                <span className="flex items-center gap-2">
                                    <Activity className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                                    {t('scheduler.nextRun')}: {nextRunCountdown}
                                </span>
                            ) : t('common.inactive', 'Inactive')}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <button
                            onClick={() => handleSave(settings)}
                            disabled={isSaving}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-purple-950/30 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none text-sm"
                        >
                            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isSaving ? t('common.saving', 'Saving...') : t('common.saveChanges', 'Save Changes')}
                        </button>
                        {settings.mode === 'advanced' ? (
                            <button
                                onClick={() => handleSave({ ...settings, mode: 'disabled' })}
                                className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 rounded-xl font-semibold transition-all flex items-center gap-2 text-sm"
                            >
                                <X className="w-4 h-4" /> Disable Advanced Mode
                            </button>
                        ) : (
                            <button
                                onClick={() => handleSave({ ...settings, mode: 'advanced' })}
                                className="px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30 text-sm"
                            >
                                <Zap className="w-4 h-4 fill-current" /> Enable Advanced Mode
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Guardian Watchdog Section */}
            <div className="border border-amber-500/20 rounded-2xl p-6 md:p-8 bg-slate-900/60 relative overflow-hidden group shadow-2xl my-6">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_80%,rgba(245,158,11,0.06),transparent)] pointer-events-none" />

                <div className="flex flex-col md:flex-row gap-8 items-center">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                                    <Shield className="w-6 h-6 shrink-0" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">Guardian Watchdog</h2>
                                    <p className="text-xs text-amber-400/80 font-medium">Automatic Process Crash Guard</p>
                                </div>
                            </div>
                            <button
                                role="switch"
                                aria-checked={settings.watchdogEnabled}
                                aria-label="Guardian Watchdog"
                                onClick={() => handleSave({ ...settings, watchdogEnabled: !settings.watchdogEnabled })}
                                className={cn(
                                    "relative w-14 h-7 rounded-full transition-all duration-300 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 hover:scale-105",
                                    settings.watchdogEnabled
                                        ? "bg-gradient-to-r from-amber-500 to-orange-600 shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                                        : "bg-slate-800 border border-white/10"
                                )}
                            >
                                <span
                                    className={cn(
                                        "block w-5 h-5 rounded-full bg-white shadow transform transition-all duration-300",
                                        settings.watchdogEnabled ? "translate-x-7" : "translate-x-1"
                                    )}
                                />
                            </button>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed font-normal">
                            The <span className="font-bold text-white">Watchdog Heartbeat</span> continuously monitors server connectivity and process status. If the server process crashes or terminates unexpectedly, it automatically initiates a secure recovery restart sequence.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/70 p-4 border border-slate-800/80 rounded-2xl text-[11px] font-mono shadow-inner">
                            <div className="space-y-0.5">
                                <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-sans font-bold">Check Speed</span>
                                <span className="text-amber-400 font-bold">15 SECONDS</span>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-sans font-bold">Safe-Guards</span>
                                <span className="text-emerald-400 font-bold">ENABLED</span>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-sans font-bold">Auto-Restart</span>
                                <span className={cn("font-bold", settings.watchdogEnabled ? "text-amber-400" : "text-slate-500")}>{settings.watchdogEnabled ? 'ON' : 'OFF'}</span>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-sans font-bold">Last Beat</span>
                                <span className="text-cyan-400 font-bold">JUST NOW</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative w-full md:w-64 h-44 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex flex-col items-center justify-center gap-3 overflow-hidden shrink-0 shadow-inner">
                        {settings.watchdogEnabled && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="absolute w-24 h-24 border border-amber-500/20 rounded-full animate-radar-ring" style={{ animationDelay: '0s' }} />
                                <div className="absolute w-24 h-24 border border-amber-500/20 rounded-full animate-radar-ring" style={{ animationDelay: '1.2s' }} />
                                <div className="absolute w-36 h-36 border border-amber-500/10 rounded-full" />
                                <div className="absolute w-16 h-16 border border-amber-500/30 rounded-full" />
                            </div>
                        )}
                        <div className="p-3.5 bg-slate-900/90 border border-amber-500/30 rounded-2xl relative z-10 shadow-lg flex items-center justify-center">
                            <Shield className={cn(
                                "w-7 h-7 transition-transform duration-500",
                                settings.watchdogEnabled ? "text-amber-400 scale-105 animate-pulse-subtle" : "text-slate-600"
                            )} />
                        </div>
                        <div className="text-center relative z-10">
                            <p className="text-xs font-bold text-white">Monitoring Service</p>
                            <p className="text-[10px] text-slate-400 mt-1 tracking-wider uppercase font-extrabold flex items-center gap-1.5 justify-center">
                                <span className={cn("w-2 h-2 rounded-full inline-block shrink-0", settings.watchdogEnabled ? "bg-emerald-400 animate-ping" : "bg-slate-700")} />
                                {settings.watchdogEnabled ? 'ACTIVE Heartbeat' : 'INACTIVE Standby'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Configured Tasks List */}
            {settings.mode === 'advanced' && (
                <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-tight">{t('scheduler.scheduledTasks')}</h3>
                            <p className="text-xs text-slate-400">Automated server events and RCON cron jobs</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingTaskId(null);
                                setNewTaskName('');
                                setNewTaskType('restart');
                                setCronSchedule('0 */6 * * *');
                                setCustomCron('');
                                setPreWarning(5);
                                setCustomCommand('');
                                setAnnouncementMsg('');
                                setIsTaskModalOpen(true);
                            }}
                            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none font-bold text-sm shadow-lg shadow-purple-950/30"
                        >
                            <Plus className="w-4 h-4" /> {t('scheduler.addTask')}
                        </button>
                    </div>

                    {tasks.length === 0 ? (
                        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
                            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-purple-400">
                                <Calendar className="w-8 h-8" />
                            </div>
                            <h4 className="text-base font-bold text-white">No Scheduled Tasks Configured</h4>
                            <p className="text-xs text-slate-400 max-w-sm">Create automated server restarts, wild dino wipes, RCON broadcasts, or world save tasks to execute on a set schedule.</p>
                            <button
                                onClick={() => {
                                    setEditingTaskId(null);
                                    setNewTaskName('');
                                    setNewTaskType('restart');
                                    setCronSchedule('0 */6 * * *');
                                    setCustomCron('');
                                    setPreWarning(5);
                                    setCustomCommand('');
                                    setAnnouncementMsg('');
                                    setIsTaskModalOpen(true);
                                }}
                                className="mt-2 flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-purple-950/30 transition-all"
                            >
                                <Plus className="w-4 h-4" /> {t('scheduler.addTask')}
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {tasks.map(task => {
                                const taskTypeInfo = TASK_TYPES.find(t => t.value === task.taskType) || TASK_TYPES[0];
                                const Icon = taskTypeInfo.icon;
                                const cronHuman = describeCron(task.cronExpression);
                                return (
                                    <div key={task.id} className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 group hover:border-purple-500/40 hover:bg-slate-900 transition-all shadow-xl flex flex-col justify-between space-y-4">
                                        <div className="space-y-4">
                                            {/* Top Header */}
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className={cn("p-3 rounded-2xl shrink-0 border border-white/10 shadow-lg", taskTypeInfo.bg)}>
                                                        <Icon className={cn("w-5.5 h-5.5", taskTypeInfo.color)} />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <h4 className="font-bold text-white text-base truncate" title={task.taskName || getTaskTypeLabel(taskTypeInfo.labelKey)}>
                                                            {task.taskName || getTaskTypeLabel(taskTypeInfo.labelKey)}
                                                        </h4>
                                                        <div className="text-[10px] text-purple-400 font-extrabold uppercase tracking-wider mt-0.5">
                                                            {getTaskTypeLabel(taskTypeInfo.labelKey)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    role="switch"
                                                    aria-checked={task.enabled}
                                                    aria-label={t('scheduler.toggleTask', 'Toggle Task')}
                                                    onClick={() => handleToggleTask(task.id, task.enabled)}
                                                    className={cn(
                                                        "w-11 h-6 rounded-full relative transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0 mt-0.5",
                                                        task.enabled ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "bg-slate-800 border border-slate-700"
                                                    )}
                                                >
                                                    <div className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-md", task.enabled ? "translate-x-5" : "translate-x-0")} />
                                                </button>
                                            </div>

                                            {/* Schedule Info Box */}
                                            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-2 shadow-inner">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono text-purple-300 font-semibold text-xs bg-purple-500/10 border border-purple-500/25 px-2.5 py-0.5 rounded-md">
                                                        {task.cronExpression === '@online' ? '⚡ @online' : task.cronExpression}
                                                    </span>
                                                    {task.preWarningMinutes > 0 && (
                                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md shrink-0">
                                                            ⚠️ {task.preWarningMinutes}m Warning
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-300 font-medium flex items-center gap-1.5 leading-tight">
                                                    <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                                    <span>{cronHuman}</span>
                                                </p>
                                            </div>

                                            {/* RCON Broadcast or Command Preview */}
                                            {task.message && (
                                                <div className="text-xs text-slate-400 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 font-sans line-clamp-2">
                                                    <span className="text-purple-400 font-bold mr-1">📢 Broadcast:</span>
                                                    "{task.message}"
                                                </div>
                                            )}
                                            {task.command && task.taskType === 'rcon-command' && (
                                                <div className="text-xs text-emerald-400 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60 font-mono truncate">
                                                    <span className="text-slate-500 font-sans font-bold mr-1">💻 Command:</span>
                                                    {task.command}
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer Row */}
                                        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                                            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                                <span>{t('scheduler.lastRun')}:</span>
                                                <span className="text-slate-300 font-mono font-semibold">{task.lastRun ? new Date(task.lastRun).toLocaleString() : t('common.never', 'Never')}</span>
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleEditTask(task)}
                                                    aria-label={t('common.edit', 'Edit')}
                                                    className="p-2 text-slate-400 hover:text-purple-300 hover:bg-purple-500/15 border border-transparent hover:border-purple-500/30 rounded-xl transition-all"
                                                    title={t('common.edit', 'Edit')}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(task.id)}
                                                    aria-label={t('common.delete', 'Delete')}
                                                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/15 border border-transparent hover:border-red-500/30 rounded-xl transition-all"
                                                    title={t('common.delete', 'Delete')}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Add/Edit Task Modal - 2-Column Split Design */}
            {isTaskModalOpen && createPortal(
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title"
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-6 animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) { setIsTaskModalOpen(false); setEditingTaskId(null); } }}
                >
                    <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-4xl shadow-2xl shadow-purple-900/15 animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="relative px-6 py-4 border-b border-slate-800/80 shrink-0">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-transparent pointer-events-none" />
                            <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/20 shadow-inner">
                                        {editingTaskId !== null ? <Pencil className="w-5 h-5 text-purple-400" /> : <Plus className="w-5 h-5 text-purple-400" />}
                                    </div>
                                    <div>
                                        <h2 id="modal-title" className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                                            {editingTaskId !== null ? t('scheduler.editScheduledTask', 'Edit Scheduled Task') : t('scheduler.addScheduledTask')}
                                        </h2>
                                        <p className="text-xs text-slate-400">
                                            {editingTaskId !== null
                                                ? t('scheduler.editTaskDesc', 'Modify the task configuration below')
                                                : t('scheduler.addTaskDesc', 'Configure a new automated task')}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setIsTaskModalOpen(false); setEditingTaskId(null); }}
                                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none"
                                    aria-label={t('common.close', 'Close')}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body - 2 Columns */}
                        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left Column: Task Identity & Type */}
                            <div className="space-y-5 bg-slate-950/40 p-5 rounded-xl border border-slate-800/60 flex flex-col justify-between">
                                <div className="space-y-5">
                                    {/* Task Name */}
                                    <div>
                                        <label htmlFor="new-task-name" className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                                            <span>{t('scheduler.taskName')}</span>
                                            <span className="text-[10px] text-slate-500 font-normal normal-case">({t('common.optional')})</span>
                                        </label>
                                        <input
                                            id="new-task-name"
                                            type="text"
                                            value={newTaskName}
                                            onChange={(e) => setNewTaskName(e.target.value)}
                                            placeholder={t('scheduler.taskNamePlaceholder')}
                                            className="w-full bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm placeholder:text-slate-600"
                                        />
                                    </div>

                                    {/* Task Type */}
                                    <div>
                                        <span className="block text-xs font-bold text-slate-400 mb-2.5 uppercase tracking-wider">{t('scheduler.taskType')}</span>
                                        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t('scheduler.taskType')}>
                                            {TASK_TYPES.map((type, idx) => {
                                                const Icon = type.icon;
                                                const isLastOdd = idx === TASK_TYPES.length - 1 && TASK_TYPES.length % 2 !== 0;
                                                return (
                                                    <button
                                                        key={type.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={newTaskType === type.value}
                                                        onClick={() => setNewTaskType(type.value)}
                                                        className={cn(
                                                            "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none group",
                                                            newTaskType === type.value
                                                                ? `bg-slate-800/90 ${type.border} ring-1 ring-purple-500/40 shadow-md`
                                                                : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40",
                                                            isLastOdd && "col-span-2"
                                                        )}
                                                    >
                                                        <div className={cn("p-2 rounded-lg transition-transform group-hover:scale-110", type.bg)}>
                                                            <Icon className={cn("w-4 h-4", type.color)} />
                                                        </div>
                                                        <span className={cn("text-xs font-semibold leading-snug", newTaskType === type.value ? "text-white" : "text-slate-300")}>
                                                            {getTaskTypeLabel(type.labelKey)}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3 bg-purple-500/5 border border-purple-500/15 rounded-lg text-[11px] text-purple-300/80 leading-relaxed">
                                    💡 Select a task type to configure standard maintenance or execution routines.
                                </div>
                            </div>

                            {/* Right Column: Schedule & Options */}
                            <div className="space-y-5 bg-slate-950/40 p-5 rounded-xl border border-slate-800/60">
                                {/* Schedule Configuration */}
                                <div>
                                    <label htmlFor="new-task-schedule" className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">{t('scheduler.schedule')}</label>
                                    <CustomDropdown
                                        options={[
                                            { value: '0 */1 * * *', label: `${t('scheduler.every')} 1 Hour`, desc: 'Runs every single hour', icon: Clock },
                                            { value: '0 */3 * * *', label: `${t('scheduler.every')} 3 ${t('scheduler.hours')}`, desc: 'Runs 8 times per day', icon: Clock },
                                            { value: '0 */6 * * *', label: `${t('scheduler.every')} 6 ${t('scheduler.hours')}`, desc: 'Runs 4 times per day', icon: Clock },
                                            { value: '0 */12 * * *', label: `${t('scheduler.every')} 12 ${t('scheduler.hours')}`, desc: 'Runs twice a day', icon: Clock },
                                            { value: '0 4 * * *', label: `${t('scheduler.daily')} ${t('scheduler.at')} 4:00 AM`, desc: 'Runs once every night', icon: Calendar },
                                            { value: '@online', label: t('scheduler.onServerOnline', 'When Server Comes Online'), desc: 'Executes on server startup', icon: Zap },
                                            { value: 'custom', label: 'Custom Cron Expression', desc: 'Define your own cron schedule', icon: Terminal },
                                        ]}
                                        value={cronSchedule}
                                        onChange={(val) => setCronSchedule(String(val))}
                                    />

                                    {cronSchedule === 'custom' && (
                                        <div className="mt-3 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    aria-label="Custom cron expression"
                                                    value={customCron}
                                                    onChange={(e) => setCustomCron(e.target.value)}
                                                    placeholder="e.g. 0 3 * * 0"
                                                    className="w-full bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:outline-none transition-all placeholder:text-slate-600"
                                                />
                                                {customCron && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setCustomCron('')}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-mono bg-slate-800 px-1.5 py-0.5 rounded"
                                                    >
                                                        clear
                                                    </button>
                                                )}
                                            </div>

                                            {/* Format Legend */}
                                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
                                                <span>MINUTE</span>
                                                <span>HOUR</span>
                                                <span>DAY-OF-MONTH</span>
                                                <span>MONTH</span>
                                                <span>DAY-OF-WEEK</span>
                                            </div>

                                            {/* Quick Preset Chips */}
                                            <div>
                                                <span className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Quick Presets</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { label: 'Every 15m', expr: '*/15 * * * *' },
                                                        { label: 'Every 30m', expr: '*/30 * * * *' },
                                                        { label: 'Every 2h', expr: '0 */2 * * *' },
                                                        { label: 'Midnight', expr: '0 0 * * *' },
                                                        { label: 'Sunday 3 AM', expr: '0 3 * * 0' },
                                                    ].map(preset => (
                                                        <button
                                                            key={preset.expr}
                                                            type="button"
                                                            onClick={() => setCustomCron(preset.expr)}
                                                            className={cn(
                                                                "px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all border",
                                                                customCron === preset.expr
                                                                    ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                                                                    : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                                                            )}
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Human Readable Cron Explanation */}
                                    <div className="mt-2.5 text-xs bg-slate-900 border border-purple-500/20 text-purple-300 px-3.5 py-2.5 rounded-xl font-mono flex items-center gap-2">
                                        <Terminal className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                        <span>{describeCron(cronSchedule === 'custom' ? customCron : cronSchedule)}</span>
                                    </div>
                                </div>

                                {/* Dynamic Fields: RCON Command */}
                                {newTaskType === 'rcon-command' && (
                                    <div className="animate-in slide-in-from-top-2 duration-200">
                                        <label htmlFor="new-task-rcon" className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">{t('scheduler.rconCommand')}</label>
                                        <input
                                            id="new-task-rcon"
                                            type="text"
                                            value={customCommand}
                                            onChange={(e) => setCustomCommand(e.target.value)}
                                            placeholder={t('scheduler.enterRcon')}
                                            className="w-full bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono transition-all text-sm placeholder:text-slate-600"
                                        />
                                    </div>
                                )}

                                {/* Automated RCON Broadcast Message */}
                                <div className="animate-in slide-in-from-top-2 duration-200 space-y-2">
                                    <label htmlFor="new-task-announcement" className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
                                        <span>Automated RCON Broadcast Message</span>
                                        <span className="text-[10px] text-slate-500 font-normal normal-case">({t('common.optional')})</span>
                                    </label>
                                    <div className="relative">
                                        <textarea
                                            id="new-task-announcement"
                                            value={announcementMsg}
                                            onChange={(e) => setAnnouncementMsg(e.target.value)}
                                            placeholder="e.g. Server Notice: Scheduled task executing in {mins} minutes!"
                                            className="w-full bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 min-h-[85px] transition-all text-sm placeholder:text-slate-600 resize-none font-sans"
                                        />
                                        {announcementMsg && (
                                            <button
                                                type="button"
                                                onClick={() => setAnnouncementMsg('')}
                                                className="absolute right-3 bottom-3 text-slate-500 hover:text-slate-300 text-xs font-mono bg-slate-800 px-1.5 py-0.5 rounded"
                                            >
                                                clear
                                            </button>
                                        )}
                                    </div>

                                    {/* Broadcast Message Preset Template Chips */}
                                    <div>
                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                                            <span>Quick Message Templates</span>
                                            <span className="text-purple-400 font-mono text-[9px]">Tags: {"{mins}"}, {"{server}"}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { label: '🔄 Restart Warning', text: 'Server restart in {mins} minutes. Please find a safe location and log off!' },
                                                { label: '🦖 Dino Wipe Notice', text: 'Wild Dino Wipe executing in {mins} minutes. Finish taming now!' },
                                                { label: '💾 Save Snapshot', text: 'World Save Snapshot taking place in {mins} minutes.' },
                                                { label: '🛠️ Maintenance', text: 'Scheduled server maintenance starting in {mins} minutes.' },
                                            ].map(tpl => (
                                                <button
                                                    key={tpl.label}
                                                    type="button"
                                                    onClick={() => setAnnouncementMsg(tpl.text)}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded-lg text-[11px] transition-all border font-medium",
                                                        announcementMsg === tpl.text
                                                            ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                                                            : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white"
                                                    )}
                                                >
                                                    {tpl.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-slate-500">Sent in-game over RCON to all online players prior to task execution.</p>
                                </div>

                                {/* Pre-Warning Minutes */}
                                <div>
                                    <label htmlFor="new-task-warning" className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">{t('scheduler.preWarning')}</label>
                                    <input
                                        id="new-task-warning"
                                        type="number"
                                        value={preWarning}
                                        onChange={(e) => setPreWarning(Number(e.target.value))}
                                        className="w-full bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-sm font-mono"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1.5 leading-normal">{t('scheduler.preWarningDesc')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-950/50 flex justify-end gap-3 shrink-0">
                            <button
                                onClick={() => { setIsTaskModalOpen(false); setEditingTaskId(null); }}
                                className="px-6 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm transition-all focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-none"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleCreateTask}
                                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-purple-900/20 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none flex items-center justify-center gap-2"
                            >
                                {editingTaskId !== null ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                {editingTaskId !== null ? t('common.saveChanges', 'Save Changes') : t('scheduler.createTask')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation Modal */}
            {taskToDelete && createPortal(
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-modal-title"
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) setTaskToDelete(null); }}
                >
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-red-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header accent */}
                        <div className="h-1 bg-gradient-to-r from-red-500 to-orange-500" />

                        <div className="p-6">
                            <div className="flex flex-col items-center text-center gap-4">
                                <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
                                    <AlertTriangle className="w-8 h-8 text-red-400" />
                                </div>
                                <div>
                                    <h3 id="delete-modal-title" className="text-lg font-bold text-white">{t('common.confirmDelete', 'Confirm Deletion')}</h3>
                                    <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                                        {t('scheduler.confirmDeleteMsg', 'Are you sure you want to delete this task? This action cannot be undone.')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => setTaskToDelete(null)}
                                className="flex-1 px-4 py-2.5 text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-all font-semibold text-sm focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-none"
                            >
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={confirmDeleteTask}
                                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all font-semibold text-sm flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none shadow-lg shadow-red-900/20"
                            >
                                <Trash2 className="w-4 h-4" />
                                {t('common.delete', 'Delete')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
