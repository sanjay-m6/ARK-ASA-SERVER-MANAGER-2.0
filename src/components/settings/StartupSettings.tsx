import { ShieldAlert, Play, Clock, LogIn, Monitor, AlertTriangle, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StartupSettingsProps {
    globalAutoStartEnabled: boolean;
    setGlobalAutoStartEnabled: (v: boolean) => void;
    globalBootDelay: string;
    setGlobalBootDelay: (v: string) => void;
    startMinimizedToTray: boolean;
    setStartMinimizedToTray: (v: boolean) => void;
    loopPreventionMaxCrashes: string;
    setLoopPreventionMaxCrashes: (v: string) => void;
    loopPreventionTimeWindowMins: string;
    setLoopPreventionTimeWindowMins: (v: string) => void;
    windowsStartupShortcut: boolean;
    setWindowsStartupShortcut: (v: boolean) => void;
    silentHeadlessStartup: boolean;
    setSilentHeadlessStartup: (v: boolean) => void;
}

export default function StartupSettings({
    globalAutoStartEnabled,
    setGlobalAutoStartEnabled,
    globalBootDelay,
    setGlobalBootDelay,
    startMinimizedToTray,
    setStartMinimizedToTray,
    loopPreventionMaxCrashes,
    setLoopPreventionMaxCrashes,
    loopPreventionTimeWindowMins,
    setLoopPreventionTimeWindowMins,
    windowsStartupShortcut,
    setWindowsStartupShortcut,
    silentHeadlessStartup,
    setSilentHeadlessStartup,
}: StartupSettingsProps) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
            {/* 1. Global Automation Engine */}
            <div className="glass-panel rounded-2xl p-8">
                <div className="flex items-start space-x-4 mb-6">
                    <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
                        <Play className="w-6 h-6 text-sky-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {t('settings.startup.engineTitle', 'Global Startup & Recovery')}
                        </h2>
                        <p className="text-slate-400">
                            {t('settings.startup.engineDesc', 'Configure automated server execution, boot delays, and automatic crash recovery.')}
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Global Auto Start Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                        <div>
                            <h3 className="font-semibold text-white">{t('settings.startup.globalToggle', 'Enable Global Auto-Start')}</h3>
                            <p className="text-sm text-slate-400">{t('settings.startup.globalToggleDesc', 'Automatically start enabled server profiles when the application starts.')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={globalAutoStartEnabled}
                                onChange={(e) => setGlobalAutoStartEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                        </label>
                    </div>

                    {/* Boot Delay Input */}
                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-sky-400" />
                                    {t('settings.startup.bootDelay', 'Global Boot Delay Timer')}
                                </h3>
                                <p className="text-sm text-slate-400 mt-0.5">{t('settings.startup.bootDelayDesc', 'Time in seconds to wait before launching servers to allow network and OS resources to stabilize.')}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <input
                                    type="number"
                                    min="0"
                                    value={globalBootDelay}
                                    onChange={(e) => setGlobalBootDelay(e.target.value)}
                                    className="w-24 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500 text-center"
                                />
                                <span className="text-slate-400 text-sm font-medium">{t('common.seconds', 'seconds')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. OS Boot Integration */}
            <div className="glass-panel rounded-2xl p-8">
                <div className="flex items-start space-x-4 mb-6">
                    <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/20">
                        <LogIn className="w-6 h-6 text-violet-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {t('settings.startup.osTitle', 'Operating System Integration')}
                        </h2>
                        <p className="text-slate-400">
                            {t('settings.startup.osDesc', 'Register the server manager inside the system boot hooks to achieve complete server autonomy.')}
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Launch on Windows Boot Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                        <div>
                            <h3 className="font-semibold text-white">{t('settings.startup.windowsBoot', 'Run at System Boot')}</h3>
                            <p className="text-sm text-slate-400">{t('settings.startup.windowsBootDesc', 'Automatically run this application when your computer turns on.')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={windowsStartupShortcut}
                                onChange={(e) => setWindowsStartupShortcut(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                        </label>
                    </div>

                    {/* Start Minimized Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                        <div>
                            <h3 className="font-semibold text-white flex items-center gap-2">
                                <Monitor className="w-4 h-4 text-violet-400" />
                                {t('settings.startup.startMinimized', 'Start Minimized to System Tray')}
                            </h3>
                            <p className="text-sm text-slate-400 mt-0.5">{t('settings.startup.startMinimizedDesc', 'Launch silently in the background, keeping the window minimized in your taskbar system tray.')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={startMinimizedToTray}
                                onChange={(e) => setStartMinimizedToTray(e.target.checked)}
                                className="sr-only peer"
                                disabled={!windowsStartupShortcut}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500 peer-disabled:opacity-40"></div>
                        </label>
                    </div>

                    {/* Silent Headless Task Scheduler Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                        <div>
                            <h3 className="font-semibold text-white">{t('settings.startup.headlessMode', 'Bypass UAC Elevation (Windows Task Scheduler)')}</h3>
                            <p className="text-sm text-slate-400">{t('settings.startup.headlessModeDesc', 'Runs the server manager with highest privileges via Task Scheduler to auto-elevate without UAC prompts.')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={silentHeadlessStartup}
                                onChange={(e) => setSilentHeadlessStartup(e.target.checked)}
                                className="sr-only peer"
                                disabled={!windowsStartupShortcut}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500 peer-disabled:opacity-40"></div>
                        </label>
                    </div>

                    {/* UAC Elevation warning */}
                    {windowsStartupShortcut && silentHeadlessStartup && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-slate-300">
                                <p className="font-semibold text-amber-400 mb-1">{t('settings.startup.adminAlert', 'Administrator Access Required')}</p>
                                <p>{t('settings.startup.adminAlertDesc', 'Registering elevated boot tasks via Task Scheduler requires running this application once as Administrator. UAC prompt will occur when saving.')}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Crash Watchdog & Loop Prevention */}
            <div className="glass-panel rounded-2xl p-8">
                <div className="flex items-start space-x-4 mb-6">
                    <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                        <ShieldAlert className="w-6 h-6 text-red-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {t('settings.startup.watchdogTitle', 'Watchdog & Crash Loop Prevention')}
                        </h2>
                        <p className="text-slate-400">
                            {t('settings.startup.watchdogDesc', 'Prevent corrupt savefiles or bad updates from triggering infinite crash loops.')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Max Crash Limit */}
                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition-colors flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-white flex items-center gap-2">
                                <Cpu className="w-4 h-4 text-red-400" />
                                {t('settings.startup.maxCrashes', 'Max Crash Restarts')}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">{t('settings.startup.maxCrashesDesc', 'Max crash recovery attempts in window.')}</p>
                        </div>
                        <input
                            type="number"
                            min="1"
                            value={loopPreventionMaxCrashes}
                            onChange={(e) => setLoopPreventionMaxCrashes(e.target.value)}
                            className="w-20 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center focus:outline-none focus:border-red-500"
                        />
                    </div>

                    {/* Window Mins */}
                    <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition-colors flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-white flex items-center gap-2">
                                <Clock className="w-4 h-4 text-red-400" />
                                {t('settings.startup.observationWindow', 'Observation Window')}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">{t('settings.startup.observationWindowDesc', 'Time in minutes to track crash counts.')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min="1"
                                value={loopPreventionTimeWindowMins}
                                onChange={(e) => setLoopPreventionTimeWindowMins(e.target.value)}
                                className="w-20 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center focus:outline-none focus:border-red-500"
                            />
                            <span className="text-slate-400 text-xs font-medium">{t('common.mins', 'mins')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
