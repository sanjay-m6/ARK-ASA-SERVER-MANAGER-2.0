import { useState, useEffect } from 'react';
import { Save, Key, Lock, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Download, Clock, History, Undo2, Globe, Trash2, Bot, Cloud, FolderOpen, FileText, Search, Copy, Check, Terminal, X } from 'lucide-react';
import { getSetting, setSetting, getAllServers } from '../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import FirewallSettings from '../components/settings/FirewallSettings';
import StartupSettings from '../components/settings/StartupSettings';
import CloudBackupDashboard from '../components/backups/CloudBackupDashboard';
import { manualCheckForUpdates } from '../components/UpdateChecker';
import { cn } from '../utils/helpers';
import { useServerStore } from '../stores/serverStore';
import ServerSelect from '../components/ui/ServerSelect';
import {
    getUpdateSettings,
    setUpdateSettings,
    getUpdateHistory,
    clearSkippedVersions,
    resetUpdateCache,
    getReleasesUrl,
    formatRelativeTime,
    type UpdateSettings,
    type UpdateHistoryEntry
} from '../utils/updateHistory';

export default function Settings() {
    const [curseforgeApiKey, setCurseforgeApiKey] = useState('');
    const [steamApiKey, setSteamApiKey] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showCurseforgeKey, setShowCurseforgeKey] = useState(false);
    const [showSteamKey, setShowSteamKey] = useState(false);
    const [nvidiaApiKey, setNvidiaApiKey] = useState('');
    const [showNvidiaKey, setShowNvidiaKey] = useState(false);
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [startupTimeout, setStartupTimeout] = useState('1800');

    // Startup & Recovery State variables
    const [globalAutoStartEnabled, setGlobalAutoStartEnabled] = useState(false);
    const [globalBootDelay, setGlobalBootDelay] = useState('0');
    const [startMinimizedToTray, setStartMinimizedToTray] = useState(false);
    const [loopPreventionMaxCrashes, setLoopPreventionMaxCrashes] = useState('3');
    const [loopPreventionTimeWindowMins, setLoopPreventionTimeWindowMins] = useState('15');
    const [windowsStartupShortcut, setWindowsStartupShortcut] = useState(false);
    const [silentHeadlessStartup, setSilentHeadlessStartup] = useState(false);

    const [activeTab, setActiveTab] = useState<'api' | 'firewall' | 'updates' | 'language' | 'cloud' | 'startup'>('api');
    const { setServers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const { t, i18n } = useTranslation();

    // API Verification State
    const [isVerifying, setIsVerifying] = useState(false);
    const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

    const verifyKey = async () => {
        setIsVerifying(true);
        try {
            const isValid = await invoke('verify_curseforge_key', { apiKey: curseforgeApiKey });
            if (isValid) {
                setKeyStatus('valid');
                toast.success(t('settings.keyVerified'));
            } else {
                setKeyStatus('invalid');
                toast.error(t('settings.invalidKey'));
            }
        } catch (error) {
            console.error('Verification failed:', error);
            setKeyStatus('invalid');
            toast.error(t('settings.verificationFailed'));
        } finally {
            setIsVerifying(false);
        }
    };

    // Update system state
    const [updateSettings, setUpdateSettingsState] = useState<UpdateSettings | null>(null);
    const [updateHistory, setUpdateHistoryState] = useState<UpdateHistoryEntry[]>([]);
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    const [updateCheckResult, setUpdateCheckResult] = useState<string | null>(null);

    // Log Viewer state
    const [isViewLogOpen, setIsViewLogOpen] = useState(false);
    const [logContent, setLogContent] = useState('');
    const [logLoading, setLogLoading] = useState(false);
    const [logSearch, setLogSearch] = useState('');
    const [isCopied, setIsCopied] = useState(false);

    const loadLogContent = async () => {
        setLogLoading(true);
        try {
            const logsDir: string = await invoke('get_app_logs_dir');
            const path = `${logsDir}/startup.log`;
            const content: string = await invoke('read_file_content', { path });
            setLogContent(content);
        } catch (error) {
            console.error('Failed to load log content:', error);
            setLogContent(t('settings.diagnosticsTab.noLogYet', 'No startup log file found or failed to read.'));
        } finally {
            setLogLoading(false);
        }
    };

    const handleOpenLogsFolder = async () => {
        try {
            const logsDir: string = await invoke('get_app_logs_dir');
            await invoke('open_in_explorer', { path: logsDir });
            toast.success(t('settings.diagnosticsTab.folderOpened', 'Logs folder opened in file explorer'));
        } catch (error) {
            console.error('Failed to open logs folder:', error);
            toast.error(t('settings.diagnosticsTab.folderOpenFailed', 'Failed to open logs folder'));
        }
    };

    const handleCopyLog = () => {
        navigator.clipboard.writeText(logContent);
        setIsCopied(true);
        toast.success(t('common.copied', 'Copied to clipboard'));
        setTimeout(() => setIsCopied(false), 2000);
    };


    async function loadSettings() {
        try {
            const [
                curseforgeKey, steamKey, timeout, nvidiaKey,
                gasEnabled, gbDelay, minTray, maxCrash, timeWindow, winShortcut, headless
            ] = await Promise.all([
                getSetting('curseforge_api_key'),
                getSetting('steam_api_key'),
                getSetting('startup_timeout'),
                getSetting('nvidia_api_key'),
                getSetting('global_auto_start_enabled'),
                getSetting('global_boot_delay'),
                getSetting('start_minimized_to_tray'),
                getSetting('loop_prevention_max_crashes'),
                getSetting('loop_prevention_time_window_mins'),
                getSetting('windows_startup_shortcut'),
                getSetting('silent_headless_startup')
            ]);
            if (curseforgeKey) setCurseforgeApiKey(curseforgeKey);
            if (steamKey) setSteamApiKey(steamKey);
            if (timeout) setStartupTimeout(timeout);
            if (nvidiaKey) setNvidiaApiKey(nvidiaKey);
            
            setGlobalAutoStartEnabled(gasEnabled === 'true');
            setGlobalBootDelay(gbDelay || '0');
            setStartMinimizedToTray(minTray === 'true');
            setLoopPreventionMaxCrashes(maxCrash || '3');
            setLoopPreventionTimeWindowMins(timeWindow || '15');
            setWindowsStartupShortcut(winShortcut === 'true');
            setSilentHeadlessStartup(headless === 'true');

            // Load update settings
            setUpdateSettingsState(getUpdateSettings());
            setUpdateHistoryState(getUpdateHistory());
        } catch (error) {
            console.error('Failed to load settings:', error);
            toast.error('Failed to load settings');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadSettings();
        getVersion().then(setCurrentVersion).catch(console.error);
        getAllServers().then((s) => {
            setServers(s);
            if (s.length > 0 && !selectedServerId) setSelectedServerId(s[0].id);
        }).catch(console.error);
    }, []);

    const openUrl = async (url: string) => {
        try {
            await invoke('plugin:opener|open_url', { url });
        } catch (error) {
            console.error('Failed to open URL:', error);
            toast.error('Failed to open link');
        }
    };

    const handleCheckForUpdates = async () => {
        setIsCheckingUpdates(true);
        setUpdateCheckResult(null);
        try {
            const result = await manualCheckForUpdates();
            if (result.available && result.update) {
                setUpdateCheckResult(`Update available: v${result.update.version}`);
                toast.success(`Update v${result.update.version} is available!`);
            } else if (result.error) {
                setUpdateCheckResult(result.error);
                toast.error(result.error);
            } else {
                setUpdateCheckResult(t('settings.updatesTab.latestVersion', 'You are on the latest version'));
                toast.success(t('settings.updatesTab.latestVersion', 'You are on the latest version'));
            }
        } catch (err) {
            console.error('Failed to check for updates:', err);
            setUpdateCheckResult(t('settings.updatesTab.checkFailed', 'Failed to check for updates'));
            toast.error(t('settings.updatesTab.checkFailed', 'Failed to check for updates'));
        } finally {
            setIsCheckingUpdates(false);
        }
    };

    const handleAutoUpdateToggle = () => {
        const newValue = !updateSettings?.autoUpdate;
        setUpdateSettings({ autoUpdate: newValue });
        // Update local state directly for immediate UI feedback
        setUpdateSettingsState(prev => prev ? { ...prev, autoUpdate: newValue } : { ...getUpdateSettings(), autoUpdate: newValue });

        // Notify UpdateChecker to restart interval
        window.dispatchEvent(new Event('update-settings-changed'));

        toast.success(newValue 
            ? t('settings.updatesTab.autoEnabled', 'Automatic updates enabled') 
            : t('settings.updatesTab.autoDisabled', 'Automatic updates disabled')
        );
    };

    const handleUpdateChannelChange = (channel: 'release' | 'beta' | 'nightly') => {
        setUpdateSettings({ updateChannel: channel });
        setUpdateSettingsState(prev => prev ? { ...prev, updateChannel: channel } : { ...getUpdateSettings(), updateChannel: channel });

        // Notify UpdateChecker to restart interval
        window.dispatchEvent(new Event('update-settings-changed'));

        toast.success(t('settings.updatesTab.channelChanged', 'Update channel switched to {{channel}}', { channel }));
    };

    const handleClearSkipped = () => {
        clearSkippedVersions();
        setUpdateSettingsState(getUpdateSettings());
        toast.success(t('settings.updatesTab.skippedCleared', 'Skipped versions cleared'));
    };

    const handleResetUpdateCache = () => {
        resetUpdateCache();
        setUpdateSettingsState(getUpdateSettings());
        setUpdateHistoryState([]);
        setUpdateCheckResult(null);
        // Notify UpdateChecker to restart its interval with fresh settings
        window.dispatchEvent(new Event('update-settings-changed'));
        toast.success(t('settings.updatesTab.cacheReset', 'Update cache cleared. The updater will re-check on next cycle.'));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                setSetting('curseforge_api_key', curseforgeApiKey),
                setSetting('steam_api_key', steamApiKey),
                setSetting('startup_timeout', startupTimeout),
                setSetting('nvidia_api_key', nvidiaApiKey),
                setSetting('global_auto_start_enabled', globalAutoStartEnabled ? 'true' : 'false'),
                setSetting('global_boot_delay', globalBootDelay),
                setSetting('start_minimized_to_tray', startMinimizedToTray ? 'true' : 'false'),
                setSetting('loop_prevention_max_crashes', loopPreventionMaxCrashes),
                setSetting('loop_prevention_time_window_mins', loopPreventionTimeWindowMins),
                setSetting('windows_startup_shortcut', windowsStartupShortcut ? 'true' : 'false'),
                setSetting('silent_headless_startup', silentHeadlessStartup ? 'true' : 'false'),
            ]);

            // Sync OS startup configuration
            try {
                if (windowsStartupShortcut) {
                    if (silentHeadlessStartup) {
                        // Headless: Disable registry run key, enable elevated Task Scheduler task
                        await invoke('set_startup_shortcut', { enabled: false, minimized: false });
                        await invoke('set_startup_task_scheduler', { enabled: true });
                    } else {
                        // Standard: Enable registry run key, disable Task Scheduler task
                        await invoke('set_startup_shortcut', { enabled: true, minimized: startMinimizedToTray });
                        await invoke('set_startup_task_scheduler', { enabled: false });
                    }
                } else {
                    // Disable all OS boot shortcuts/tasks
                    await invoke('set_startup_shortcut', { enabled: false, minimized: false });
                    await invoke('set_startup_task_scheduler', { enabled: false });
                }
            } catch (systemErr) {
                console.error("Failed to synchronize OS boot hooks:", systemErr);
                toast.error("Failed to sync OS startup tasks. Run as Administrator if creating Scheduler task.");
            }

            toast.success(t('settings.saved'));
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error(t('settings.saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };



    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">
                        {t('settings.title')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('settings.subtitle', 'Configure application and view guides')}</p>
                </div>
                {(activeTab === 'api' || activeTab === 'startup') && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center space-x-2 px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition-colors shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className={`w-5 h-5 ${isSaving ? 'animate-spin' : ''}`} />
                        <span>{isSaving ? t('common.saving') : t('common.saveSettings', 'Save Settings')}</span>
                    </button>
                )}
            </div>

            {/* Modern Glassmorphic Navigation Tabs */}
            <div className="flex p-1.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-md w-max shadow-inner gap-1 mb-6 flex-wrap">
                <button
                    onClick={() => setActiveTab('api')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'api'
                            ? "text-sky-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <span className="relative z-10 flex items-center gap-2">🔑 {t('settings.tabs.apiKeys')}</span>
                </button>
                <button
                    onClick={() => setActiveTab('firewall')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'firewall'
                            ? "text-red-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <span className="relative z-10 flex items-center gap-2">🛡️ {t('settings.tabs.firewall')}</span>
                </button>
                <button
                    onClick={() => setActiveTab('updates')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'updates'
                            ? "text-emerald-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <span className="relative z-10 flex items-center gap-2">🔄 {t('settings.tabs.updates')}</span>
                </button>
                <button
                    onClick={() => setActiveTab('startup')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'startup'
                            ? "text-amber-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <span className="relative z-10 flex items-center gap-2">⚡ {t('settings.tabs.startup', 'Startup & Recovery')}</span>
                </button>
                <button
                    onClick={() => setActiveTab('cloud')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'cloud'
                            ? "text-blue-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <span className="relative z-10 flex items-center gap-2"><Cloud className="w-4 h-4" /> {t('settings.tabs.cloudBackup', 'Cloud Backup')}</span>
                </button>
                <button
                    onClick={() => setActiveTab('language')}
                    className={cn(
                        "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                        activeTab === 'language'
                            ? "text-cyan-300 bg-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.2)] border border-slate-700/50"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                    )}
                >
                    <span className="relative z-10 flex items-center gap-2">🌐 {t('settings.tabs.language')}</span>
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full"></div>
                </div>
            ) : activeTab === 'api' ? (
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                    {/* Steam Web API Key */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
                                <Key className="w-6 h-6 text-sky-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white mb-2">{t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(':')[0]}</h2>
                                <p className="text-slate-400">
                                    {t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(': ')[1]}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-3">
                                    {t('settings.curseforgeKey.label', 'API Key')}
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <input
                                        type={showSteamKey ? 'text' : 'password'}
                                        value={steamApiKey}
                                        onChange={(e) => setSteamApiKey(e.target.value)}
                                        placeholder={t('settings.curseforgeKey.placeholder', 'Enter your Steam Web API key').replace('CurseForge', 'Steam Web')}
                                        className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSteamKey(!showSteamKey)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-sm"
                                    >
                                        {showSteamKey ? t('common.hide') : t('common.show')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4">
                                <p className="text-sm text-slate-300 font-medium mb-3">{t('settings.curseforgeKey.needKey', 'A Steam Web API key is required.')}</p>
                                <button
                                    onClick={() => openUrl('https://steamcommunity.com/dev/apikey')}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-lg shadow-sky-500/20 w-full justify-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>{t('settings.curseforgeKey.getKey', 'Get your API key here').replace('CurseForge', 'Steam')}</span>
                                </button>
                                <p className="text-xs text-slate-400 mt-3">
                                    {t('settings.curseforgeKey.instructions', 'Create a key in your developer account.').replace('Create/Copy', 'Enter domain name → Copy')}
                                </p>
                            </div>

                            {steamApiKey && (
                                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                        <span className="text-green-400 font-medium">{t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(':')[0]} configured</span>
                                    </div>
                                </div>
                            )}

                            {!steamApiKey && (
                                <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <AlertCircle className="w-5 h-5 text-slate-400" />
                                        <span className="text-slate-400 font-medium">{t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(': ')[1]}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CurseForge API Key */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
                                <Key className="w-6 h-6 text-sky-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white mb-2">{t('settings.aboutApiKeys.curseforgeDesc', 'CurseForge API Key: Required for downloading and updating mods').split(':')[0]}</h2>
                                <p className="text-slate-400">
                                    {t('settings.aboutApiKeys.curseforgeDesc', 'CurseForge API Key: Required for downloading and updating mods').split(': ')[1]}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-3">
                                    API Key
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <input
                                        type={showCurseforgeKey ? 'text' : 'password'}
                                        value={curseforgeApiKey}
                                        onChange={(e) => {
                                            setCurseforgeApiKey(e.target.value);
                                            setKeyStatus('idle');
                                        }}
                                        placeholder={t('settings.curseforgeKey.placeholder', 'Enter your CurseForge API key')}
                                        className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurseforgeKey(!showCurseforgeKey)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-sm"
                                    >
                                        {showCurseforgeKey ? t('common.hide') : t('common.show')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4">
                                <p className="text-sm text-slate-300 font-medium mb-3">{t('settings.curseforgeKey.needKey', 'A CurseForge API key is required.')}</p>
                                <button
                                    onClick={() => openUrl('https://console.curseforge.com')}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-lg shadow-sky-500/20 w-full justify-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>{t('settings.curseforgeKey.getKey', 'Get your API key here')}</span>
                                </button>
                                <p className="text-xs text-slate-400 mt-3">
                                    {t('settings.curseforgeKey.instructions', 'Create a key in your CurseForge developer account.')}
                                </p>
                            </div>

                            {!curseforgeApiKey && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <AlertCircle className="w-5 h-5 text-amber-400" />
                                        <span className="text-amber-400 font-medium">{t('settings.curseforgeKey.notSet', 'Not set')}</span>
                                    </div>
                                </div>
                            )}

                            {/* Verification UI */}
                            {curseforgeApiKey && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={verifyKey}
                                        disabled={isVerifying}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all ${keyStatus === 'valid'
                                            ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                                            : keyStatus === 'invalid'
                                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                : 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
                                            }`}
                                    >
                                        {isVerifying ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 animate-spin" /> {t('settings.curseforgeKey.verifying', 'Verifying...')}
                                            </>
                                        ) : keyStatus === 'valid' ? (
                                            <>
                                                <CheckCircle className="w-4 h-4" /> {t('settings.curseforgeKey.verified', 'Verified')}
                                            </>
                                        ) : keyStatus === 'invalid' ? (
                                            <>
                                                <AlertCircle className="w-4 h-4" /> {t('settings.curseforgeKey.invalid', 'Invalid key')}
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" /> {t('settings.curseforgeKey.verifyKey', 'Verify Key')}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* NVIDIA AI API Key */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                <Bot className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white mb-2">{t('settings.nvidiaKey.title', 'NVIDIA AI API Key')}</h2>
                                <p className="text-slate-400">
                                    {t('settings.nvidiaKey.description', 'Powers the Infinity AI assistant for autonomous server management')}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-3">
                                    {t('settings.nvidiaKey.label', 'API Key')}
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <input
                                        type={showNvidiaKey ? 'text' : 'password'}
                                        value={nvidiaApiKey}
                                        onChange={(e) => setNvidiaApiKey(e.target.value)}
                                        placeholder={t('settings.nvidiaKey.placeholder', 'Enter your NVIDIA API key (nvapi-...)')}
                                        className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNvidiaKey(!showNvidiaKey)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-sm"
                                    >
                                        {showNvidiaKey ? t('common.hide') : t('common.show')}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                                <p className="text-sm text-slate-300 font-medium mb-3">{t('settings.nvidiaKey.needKey', 'Get a free NVIDIA API key to enable AI features.')}</p>
                                <button
                                    onClick={() => openUrl('https://build.nvidia.com/')}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-lg shadow-emerald-500/20 w-full justify-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>{t('settings.nvidiaKey.getKey', 'Get your NVIDIA API key')}</span>
                                </button>
                                <p className="text-xs text-slate-400 mt-3">
                                    {t('settings.nvidiaKey.instructions', 'Sign in → Select a model → Generate API Key → Paste above.')}
                                </p>
                            </div>

                            {nvidiaApiKey && (
                                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                        <span className="text-green-400 font-medium">{t('settings.nvidiaKey.configured', 'NVIDIA AI API Key configured')}</span>
                                    </div>
                                </div>
                            )}

                            {!nvidiaApiKey && (
                                <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <AlertCircle className="w-5 h-5 text-slate-400" />
                                        <span className="text-slate-400 font-medium">{t('settings.nvidiaKey.notConfigured', 'AI features require an NVIDIA API key')}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info Section */}
                    <div className="glass-panel rounded-2xl p-6 border-dashed">
                        <h3 className="text-lg font-medium text-white mb-3">{t('settings.aboutApiKeys.title', 'About API Keys')}</h3>
                        <div className="space-y-2 text-sm text-slate-400">
                            <p>• {t('settings.aboutApiKeys.storedLocally', 'Your API keys are stored locally and encrypted on your machine.')}</p>
                            <p>• {t('settings.aboutApiKeys.neverShared', 'They are never shared with any third party, only sent directly to Steam and CurseForge API endpoints.')}</p>
                            <p>• <strong className="text-sky-400">{t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(':')[0]}</strong>: {t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(':')[1]}</p>
                            <p>• <strong className="text-sky-400">{t('settings.aboutApiKeys.curseforgeDesc', 'CurseForge API Key: Required for downloading and updating mods').split(':')[0]}</strong>: {t('settings.aboutApiKeys.curseforgeDesc', 'CurseForge API Key: Required for downloading and updating mods').split(':')[1]}</p>
                            <p>• {t('settings.aboutApiKeys.revokable', 'You can revoke these keys at any time from your Steam/CurseForge developer portal.')}</p>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'firewall' ? (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <FirewallSettings />
                </div>
            ) : activeTab === 'updates' ? (
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                    {/* Check for Updates */}
                    <div className="glass-panel rounded-2xl p-8 relative overflow-hidden">
                        {/* Background glow */}
                        <div className="absolute top-0 right-0 p-32 bg-emerald-500/5 rounded-full blur-3xl -z-10 animate-pulse"></div>

                        <div className="flex items-start space-x-5 mb-8">
                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-md"></div>
                                <div className="relative p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                                    <RefreshCw className={cn("w-8 h-8 text-emerald-400", isCheckingUpdates && "animate-spin")} />
                                </div>
                            </div>
                            <div className="flex-1 mt-1">
                                <h2 className="text-2xl font-bold text-white tracking-tight">{t('settings.updatesTab.checkForUpdates', 'Software Updates')}</h2>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-slate-400">{t('settings.updatesTab.currentVersion', 'Current Version:')}</span>
                                    <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/50 text-emerald-400 font-mono text-sm tracking-wide shadow-sm">v{currentVersion}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-4 mb-8">
                            <button
                                onClick={handleCheckForUpdates}
                                disabled={isCheckingUpdates}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 border border-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium tracking-wide"
                            >
                                <Download className={`w-5 h-5 ${isCheckingUpdates ? 'animate-bounce' : ''}`} />
                                {isCheckingUpdates ? t('settings.updatesTab.checking', 'Checking Servers...') : t('settings.updatesTab.checkNow', 'Check Now')}
                            </button>

                            {updateCheckResult && (
                                <div className={cn(
                                    "flex items-center gap-3 px-5 py-3.5 rounded-xl border w-full sm:w-auto animate-in slide-in-from-left-4",
                                    updateCheckResult.includes('available')
                                        ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                                        : updateCheckResult.includes('latest')
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : "bg-red-500/10 border-red-500/30 text-red-400"
                                )}>
                                    {updateCheckResult.includes('available') ? (
                                        <div className="p-1 bg-sky-500/20 rounded-lg"><Download className="w-4 h-4" /></div>
                                    ) : updateCheckResult.includes('latest') ? (
                                        <div className="p-1 bg-emerald-500/20 rounded-lg"><CheckCircle className="w-4 h-4" /></div>
                                    ) : (
                                        <div className="p-1 bg-red-500/20 rounded-lg"><AlertCircle className="w-4 h-4" /></div>
                                    )}
                                    <span className="font-medium">{updateCheckResult}</span>
                                </div>
                            )}
                        </div>

                        {/* Persistent Last Error Banner */}
                        {updateSettings?.lastError && (
                            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm mt-4 animate-in slide-in-from-top-2">
                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-semibold text-red-300 mb-1">{t('settings.updatesTab.lastError', 'Last Update Error')}</p>
                                    <p className="leading-relaxed">{updateSettings.lastError}</p>
                                    {updateSettings.lastError.includes('signature') && (
                                        <button
                                            onClick={() => openUrl(getReleasesUrl())}
                                            className="flex items-center gap-1.5 mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 hover:text-white transition-all text-xs font-semibold"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            {t('settings.updatesTab.downloadManually', 'Download from GitHub Releases')}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setUpdateSettings({ lastError: null });
                                            setUpdateSettingsState(prev => prev ? { ...prev, lastError: null } : getUpdateSettings());
                                        }}
                                        className="text-xs text-red-500/60 hover:text-red-400 mt-2 underline transition-colors"
                                    >
                                        {t('settings.updatesTab.dismissError', 'Dismiss')}
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Update Settings */}
                        <div className="border-t border-slate-700/50 pt-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                                        <Clock className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-white">
                                            {t('settings.updatesTab.autoUpdate', 'Automatic Background Updates')}
                                        </h3>
                                        <p className="text-sm text-slate-400">
                                            {t('settings.updatesTab.autoUpdateDesc', 'Download and prepare updates silently in the background.')}
                                        </p>
                                    </div>
                                </div>
                                
                                <button
                                    onClick={handleAutoUpdateToggle}
                                    className={cn(
                                        "relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900",
                                        updateSettings?.autoUpdate ? "bg-indigo-500" : "bg-slate-700"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm",
                                            updateSettings?.autoUpdate ? "translate-x-8" : "translate-x-1"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Update Channel Selector */}
                        <div className="border-t border-slate-700/50 pt-6 mt-6">
                            <h3 className="text-base font-semibold text-white mb-2">
                                {t('settings.updatesTab.updateChannel', 'Update Channel')}
                            </h3>
                            <p className="text-sm text-slate-400 mb-4 font-medium">
                                {t('settings.updatesTab.channelDesc', 'Select which update stream you want to receive. Beta and Nightly streams get features earlier but may be less stable.')}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[
                                    { id: 'release', name: t('settings.updatesTab.releaseChannel', 'Stable Release'), desc: t('settings.updatesTab.releaseDesc', 'Recommended for production servers. Fully tested and verified stable.'), color: 'sky' },
                                    { id: 'beta', name: t('settings.updatesTab.betaChannel', 'Beta Build'), desc: t('settings.updatesTab.betaDesc', 'Pre-release builds for early testing of upcoming major updates.'), color: 'amber' },
                                    { id: 'nightly', name: t('settings.updatesTab.nightlyChannel', 'Nightly Build'), desc: t('settings.updatesTab.nightlyDesc', 'Bleeding-edge automated builds updated daily. Highly experimental.'), color: 'rose' },
                                ].map((channel) => {
                                    const isSelected = (updateSettings?.updateChannel || 'release') === channel.id;
                                    return (
                                        <button
                                            key={channel.id}
                                            onClick={() => handleUpdateChannelChange(channel.id as any)}
                                            className={cn(
                                                "p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between h-full group relative overflow-hidden active:scale-[0.99]",
                                                isSelected
                                                    ? channel.id === 'release' ? 'bg-sky-500/10 border-sky-500/40 text-white shadow-lg shadow-sky-500/5'
                                                        : channel.id === 'beta' ? 'bg-amber-500/10 border-amber-500/40 text-white shadow-lg shadow-amber-500/5'
                                                        : 'bg-rose-500/10 border-rose-500/40 text-white shadow-lg shadow-rose-500/5'
                                                    : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/40 hover:border-slate-600'
                                            )}
                                        >
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-bold text-sm tracking-wide uppercase">{channel.name}</span>
                                                    {isSelected && (
                                                        <span className={cn(
                                                            "w-2 h-2 rounded-full animate-pulse",
                                                            channel.id === 'release' ? "bg-sky-400" :
                                                                channel.id === 'beta' ? "bg-amber-400" : "bg-rose-400"
                                                        )}></span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 leading-relaxed font-medium mt-1">{channel.desc}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Update History */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3 tracking-tight">
                                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                    <History className="w-6 h-6 text-blue-400" />
                                </div>
                                Update History
                            </h2>
                            {updateHistory.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleClearSkipped}
                                        className="text-sm px-4 py-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700/50 transition-all font-medium"
                                    >
                                        {t('settings.updatesTab.clearSkipped', 'Clear Skipped Versions')}
                                    </button>
                                    <button
                                        onClick={handleResetUpdateCache}
                                        className="text-sm px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:text-red-300 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 transition-all font-medium flex items-center gap-1.5"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        {t('settings.updatesTab.resetCache', 'Reset Update Cache')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {updateHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500 border-2 border-dashed border-slate-700/50 rounded-2xl bg-slate-800/20">
                                <div className="p-4 bg-slate-800 rounded-full mb-4">
                                    <History className="w-8 h-8 opacity-50 text-slate-400" />
                                </div>
                                <p className="font-medium text-slate-400">{t('settings.updatesTab.noHistory', 'No update history yet')}</p>
                                <p className="text-sm mt-1">Updates will appear here once installed or skipped.</p>
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[28rem] overflow-y-auto custom-scrollbar pr-2">
                                {updateHistory.slice(0, 10).map((entry, i) => (
                                    <div
                                        key={entry.id}
                                        className="relative flex items-center justify-between bg-slate-800/40 hover:bg-slate-800/80 rounded-xl p-4 border border-slate-700/50 transition-all group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "p-2.5 rounded-xl border shadow-sm",
                                                entry.action === 'installed'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : entry.action === 'skipped'
                                                        ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                                        : 'bg-red-500/10 text-red-500 border-red-500/20'
                                            )}>
                                                {entry.action === 'installed' ? (
                                                    <CheckCircle className="w-5 h-5" />
                                                ) : entry.action === 'skipped' ? (
                                                    <Clock className="w-5 h-5" />
                                                ) : (
                                                    <AlertCircle className="w-5 h-5" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white text-lg tracking-wide">v{entry.version}</span>
                                                    {i === 0 && entry.action === 'installed' && (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/20">Current</span>
                                                    )}
                                                </div>
                                                <div className="text-sm text-slate-400 font-medium capitalize mt-0.5 flex items-center gap-1.5">
                                                    <span className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        entry.action === 'installed' ? "bg-emerald-500" :
                                                            entry.action === 'skipped' ? "bg-yellow-500" : "bg-red-500"
                                                    )}></span>
                                                    {entry.action}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-slate-300">
                                                {formatRelativeTime(entry.date)}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {new Date(entry.date).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Rollback / Previous Versions */}
                    <div className="glass-panel rounded-2xl p-8">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-orange-500/10 p-2 rounded-lg">
                                <Undo2 className="w-6 h-6 text-orange-400" />
                            </span>
                            {t('settings.updatesTab.previousVersions', 'Previous Versions')}
                        </h2>
                        <p className="text-slate-400 mb-4">
                            {t('settings.updatesTab.previousDesc', 'Need to roll back? View all previous releases and download older versions from our GitHub repository.')}
                        </p>
                        <button
                            onClick={() => openUrl(getReleasesUrl())}
                            className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl transition-colors shadow-lg shadow-orange-500/20"
                        >
                            <ExternalLink className="w-5 h-5" />
                            {t('settings.updatesTab.viewReleases', 'View Releases on GitHub')}
                        </button>
                    </div>

                    {/* Troubleshooting & Log Diagnostics */}
                    <div className="glass-panel rounded-2xl p-8">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-red-500/10 p-2 rounded-lg">
                                <Terminal className="w-6 h-6 text-red-400" />
                            </span>
                            {t('settings.diagnosticsTab.title', 'Troubleshooting & Diagnostics')}
                        </h2>
                        <p className="text-slate-400 mb-6">
                            {t('settings.diagnosticsTab.desc', 'Examine application logs and open the log directory to diagnose startup issues or update failures.')}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={handleOpenLogsFolder}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-650 rounded-xl transition-colors shadow-lg"
                            >
                                <FolderOpen className="w-5 h-5 text-sky-400" />
                                {t('settings.diagnosticsTab.openFolder', 'Open Logs Folder')}
                            </button>
                            <button
                                onClick={() => {
                                    setIsViewLogOpen(true);
                                    loadLogContent();
                                }}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-slate-650 rounded-xl transition-colors shadow-lg"
                            >
                                <FileText className="w-5 h-5 text-indigo-400" />
                                {t('settings.diagnosticsTab.viewLog', 'View Startup Log')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'startup' ? (
                <StartupSettings
                    globalAutoStartEnabled={globalAutoStartEnabled}
                    setGlobalAutoStartEnabled={setGlobalAutoStartEnabled}
                    globalBootDelay={globalBootDelay}
                    setGlobalBootDelay={setGlobalBootDelay}
                    startMinimizedToTray={startMinimizedToTray}
                    setStartMinimizedToTray={setStartMinimizedToTray}
                    loopPreventionMaxCrashes={loopPreventionMaxCrashes}
                    setLoopPreventionMaxCrashes={setLoopPreventionMaxCrashes}
                    loopPreventionTimeWindowMins={loopPreventionTimeWindowMins}
                    setLoopPreventionTimeWindowMins={setLoopPreventionTimeWindowMins}
                    windowsStartupShortcut={windowsStartupShortcut}
                    setWindowsStartupShortcut={setWindowsStartupShortcut}
                    silentHeadlessStartup={silentHeadlessStartup}
                    setSilentHeadlessStartup={setSilentHeadlessStartup}
                />
            ) : activeTab === 'cloud' ? (
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                    {/* Server Selector */}
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-medium text-slate-300">{t('backups.selectServer', 'Select Server')}</label>
                        <ServerSelect
                            value={selectedServerId}
                            onChange={setSelectedServerId}
                            accentColor="blue"
                        />
                    </div>
                    <CloudBackupDashboard serverId={selectedServerId} />
                </div>
            ) : activeTab === 'language' ? (
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                                <Globe className="w-6 h-6 text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{t('settings.language.title')}</h2>
                                <p className="text-slate-400 mt-1">
                                    {t('settings.language.description')}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            {supportedLanguages.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => {
                                        i18n.changeLanguage(lang.code);
                                        toast.success(t('settings.language.languageChanged', { defaultValue: 'Language changed to {{language}}', language: lang.nativeName }));
                                    }}
                                    className={`flex items-center gap-4 px-6 py-4 rounded-xl border transition-all duration-200 ${i18n.language === lang.code || i18n.language.startsWith(lang.code + '-')
                                        ? 'bg-cyan-500/10 border-cyan-500/40 text-white shadow-lg shadow-cyan-500/10'
                                        : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/40 hover:border-slate-600'
                                        }`}
                                >
                                    <span className="text-2xl">{lang.flag}</span>
                                    <div className="flex-1 text-left">
                                        <div className="font-semibold">{lang.nativeName}</div>
                                        <div className="text-sm text-slate-400">{lang.name}</div>
                                    </div>
                                    {(i18n.language === lang.code || i18n.language.startsWith(lang.code + '-')) && (
                                        <CheckCircle className="w-5 h-5 text-cyan-400" />
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="mt-6 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
                            <p className="text-sm text-slate-400">
                                {t('settings.language.restartNote')}
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Log Viewer Modal */}
            {isViewLogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-5xl h-[85vh] flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-slate-800 bg-slate-900/40">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Terminal className="w-5 h-5 text-red-400" />
                                    {t('settings.diagnosticsTab.modalTitle', 'Startup & Diagnostics Logs')}
                                </h3>
                                <p className="text-sm text-slate-400 mt-1">
                                    {t('settings.diagnosticsTab.modalSubtitle', 'Review active application state messages and errors.')}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                                {/* Search box */}
                                <div className="relative max-w-xs flex-1 sm:flex-initial">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={logSearch}
                                        onChange={(e) => setLogSearch(e.target.value)}
                                        placeholder={t('common.search', 'Search logs...')}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-950/40 border border-slate-800 focus:border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-1 focus:ring-slate-700 transition-all"
                                    />
                                    {logSearch && (
                                        <button 
                                            onClick={() => setLogSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                
                                <button
                                    onClick={loadLogContent}
                                    disabled={logLoading}
                                    title={t('common.refresh', 'Refresh')}
                                    className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={cn("w-4 h-4", logLoading && "animate-spin")} />
                                </button>
                                
                                <button
                                    onClick={handleCopyLog}
                                    title={t('common.copy', 'Copy')}
                                    className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 transition-colors"
                                >
                                    {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                </button>
                                
                                <button
                                    onClick={() => {
                                        setIsViewLogOpen(false);
                                        setLogSearch('');
                                    }}
                                    className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 rounded-xl border border-slate-700/50 hover:border-red-500/30 transition-all ml-2"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Log Output Body */}
                        <div className="flex-1 overflow-auto p-6 bg-slate-950/60 font-mono text-sm leading-relaxed custom-scrollbar selection:bg-indigo-500/30">
                            {logLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                                    <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
                                    <p>{t('settings.diagnosticsTab.loadingLogs', 'Reading log file...')}</p>
                                </div>
                            ) : (
                                <div className="space-y-0.5">
                                    {(() => {
                                        const lines = logContent.split('\n');
                                        const filtered = lines.filter(line => 
                                            !logSearch || line.toLowerCase().includes(logSearch.toLowerCase())
                                        );
                                        
                                        if (filtered.length === 0) {
                                            return (
                                                <div className="text-slate-500 text-center py-12">
                                                    {t('settings.diagnosticsTab.noMatches', 'No lines matching search query')}
                                                </div>
                                            );
                                        }

                                        return filtered.map((line, index) => {
                                            let lineClass = "text-slate-300";
                                            if (line.toLowerCase().includes("error") || line.toLowerCase().includes("panic") || line.toLowerCase().includes("crashed")) {
                                                lineClass = "text-red-400 bg-red-950/20 px-1 rounded";
                                            } else if (line.toLowerCase().includes("warn")) {
                                                lineClass = "text-amber-400 bg-amber-950/20 px-1 rounded";
                                            } else if (line.toLowerCase().includes("info") || line.includes("----")) {
                                                lineClass = "text-slate-500";
                                            }

                                            return (
                                                <div key={index} className={cn("hover:bg-slate-800/40 py-0.5 transition-colors whitespace-pre-wrap break-all", lineClass)}>
                                                    <span className="text-slate-600 select-none mr-4 text-right inline-block w-8 text-xs">{index + 1}</span>
                                                    {line}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            )}
                        </div>
                        
                        {/* Footer / Status bar */}
                        <div className="px-6 py-4 bg-slate-900/60 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
                            <span>
                                {t('settings.diagnosticsTab.logLocation', 'Log path:')} <span className="font-mono text-slate-400 select-all">%APPDATA%\asa-manager\startup.log</span>
                            </span>
                            <span>
                                {logContent ? `${logContent.split('\n').length} lines total` : '0 lines'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
