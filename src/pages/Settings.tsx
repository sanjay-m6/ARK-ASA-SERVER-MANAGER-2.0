import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker } from 'react-router-dom';
import { Save, Key, Lock, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Download, Clock, History, Undo2, Globe, Trash2, Bot, Cloud, FolderOpen, FileText, Search, Copy, Check, Terminal, X, Cpu } from 'lucide-react';
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
import { useGameStore } from '../stores/gameStore';
import ServerSelect from '../components/ui/ServerSelect';
import {
    getUpdateSettings,
    setUpdateSettings,
    getUpdateHistory,
    clearSkippedVersions,
    resetUpdateCache,
    getReleasesUrl,
    formatRelativeTime,
    trackCurrentVersion,
    removeHistoryEntry,
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

    // AI Provider state (NVIDIA cloud vs. local LM Studio)
    const [aiProvider, setAiProvider] = useState<'nvidia' | 'lmstudio'>('nvidia');
    const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState('http://localhost:1234/v1');
    const [lmStudioModel, setLmStudioModel] = useState('');
    const [lmStudioApiKey, setLmStudioApiKey] = useState('');
    const [showLmStudioKey, setShowLmStudioKey] = useState(false);
    const [lmStudioModels, setLmStudioModels] = useState<string[]>([]);
    const [lmStudioProbing, setLmStudioProbing] = useState(false);
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

    // User Config Folder state
    const [userConfigFolder, setUserConfigFolder] = useState('');
    const [customSteamcmdPath, setCustomSteamcmdPath] = useState('');

    const [activeTab, setActiveTab] = useState<'api' | 'firewall' | 'updates' | 'language' | 'cloud' | 'startup'>('api');
    const { setServers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const { t, i18n } = useTranslation();
    const { showAseMode, setShowAseMode, activeGame, setActiveGame } = useGameStore();

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


    /**
     * Loads all persisted settings from the backend DB (API keys, AI provider +
     * LM Studio config, startup/recovery options, path overrides) plus local
     * update settings, and populates the corresponding form state.
     */
    async function loadSettings() {
        try {
            const [
                curseforgeKey, steamKey, timeout, nvidiaKey,
                gasEnabled, gbDelay, minTray, maxCrash, timeWindow, winShortcut, headless, ucf, csp,
                aiProviderVal, lmBaseUrl, lmModel, lmApiKey
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
                getSetting('silent_headless_startup'),
                getSetting('user_config_folder'),
                getSetting('custom_steamcmd_path'),
                getSetting('ai_provider'),
                getSetting('lmstudio_base_url'),
                getSetting('lmstudio_model'),
                getSetting('lmstudio_api_key')
            ]);
            if (curseforgeKey) setCurseforgeApiKey(curseforgeKey);
            if (steamKey) setSteamApiKey(steamKey);
            if (timeout) setStartupTimeout(timeout);
            if (nvidiaKey) setNvidiaApiKey(nvidiaKey);
            if (aiProviderVal === 'lmstudio' || aiProviderVal === 'nvidia') setAiProvider(aiProviderVal);
            if (lmBaseUrl) setLmStudioBaseUrl(lmBaseUrl);
            if (lmModel) setLmStudioModel(lmModel);
            if (lmApiKey) setLmStudioApiKey(lmApiKey);
            
            setGlobalAutoStartEnabled(gasEnabled === 'true');
            setGlobalBootDelay(gbDelay || '0');
            setStartMinimizedToTray(minTray === 'true');
            setLoopPreventionMaxCrashes(maxCrash || '3');
            setLoopPreventionTimeWindowMins(timeWindow || '15');
            setWindowsStartupShortcut(winShortcut === 'true');
            setSilentHeadlessStartup(headless === 'true');
            if (ucf) setUserConfigFolder(ucf);
            if (csp) setCustomSteamcmdPath(csp);

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
        getVersion().then((v) => {
            setCurrentVersion(v);
            trackCurrentVersion(v);
            setUpdateHistoryState(getUpdateHistory());
        }).catch(console.error);
        getAllServers().then((s) => {
            setServers(s);
            if (s.length > 0 && !selectedServerId) setSelectedServerId(s[0].id);
        }).catch(console.error);
    }, []);

    // ── Unsaved-changes guard ──────────────────────────────────────────
    /**
     * Serializes the fields that are only persisted via the Save button into a
     * stable string, used to detect unsaved edits by comparing against a
     * baseline. AI provider + LM Studio fields autosave on change, so they are
     * deliberately excluded here.
     */
    const persistedSnapshot = () => JSON.stringify([
        curseforgeApiKey, steamApiKey, nvidiaApiKey, startupTimeout,
        globalAutoStartEnabled, globalBootDelay, startMinimizedToTray,
        loopPreventionMaxCrashes, loopPreventionTimeWindowMins,
        windowsStartupShortcut, silentHeadlessStartup, userConfigFolder, customSteamcmdPath,
    ]);
    const baselineRef = useRef<string>('');

    // Capture the baseline once the initial load has populated state.
    useEffect(() => {
        if (!isLoading) baselineRef.current = persistedSnapshot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading]);

    const isDirty = !isLoading && baselineRef.current !== '' && baselineRef.current !== persistedSnapshot();

    // Block in-app navigation away from Settings while there are unsaved changes.
    const blocker = useBlocker(() => isDirty);

    // Warn on window close / reload while dirty.
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    /**
     * Save & leave action for the unsaved-changes dialog: persists all settings
     * and only proceeds with the blocked navigation if the save succeeded.
     */
    const handleSaveAndLeave = async () => {
        const ok = await handleSave();
        if (ok) blocker.proceed?.();
    };

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

    const handleRollback = async (version: string) => {
        if (!window.confirm(`Are you sure you want to roll back to v${version}? This will restart the application.`)) {
            return;
        }
        
        const rollbackToast = toast.loading(`Initiating rollback to v${version}... Downloading installer.`);
        try {
            await invoke('rollback_to_version', { version });
        } catch (error) {
            console.error('Rollback failed:', error);
            toast.error(`Rollback failed: ${error}`, { id: rollbackToast });
        }
    };

    const handleUninstall = async () => {
        if (!window.confirm("Are you sure you want to uninstall the application? This will terminate the Server Manager and run the uninstaller.")) {
            return;
        }
        
        try {
            await invoke('uninstall_application');
        } catch (error) {
            console.error('Uninstallation failed:', error);
            toast.error(`Uninstallation failed: ${error}`);
        }
    };

    const handleRemoveHistoryEntry = (id: string) => {
        removeHistoryEntry(id);
        setUpdateHistoryState(getUpdateHistory());
        toast.success('Version entry removed from history');
    };

    /**
     * Switches the active AI provider (NVIDIA cloud vs. local LM Studio) and
     * persists the choice immediately, so it takes effect without the global
     * Save button — the Rust backend reads `ai_provider` live on each request.
     */
    const handleSelectProvider = async (provider: 'nvidia' | 'lmstudio') => {
        setAiProvider(provider);
        try {
            await setSetting('ai_provider', provider);
        } catch (err) {
            console.error('Failed to persist AI provider:', err);
            toast.error('Failed to switch provider');
        }
    };

    /**
     * Probes the configured LM Studio server for its loaded models via the
     * `lmstudio_list_models` command. Persists the API key, base URL and provider
     * first so a successful probe is immediately usable, auto-selects the first
     * loaded model when none is chosen, and surfaces connection errors as toasts.
     */
    const handleProbeLmStudio = async () => {
        setLmStudioProbing(true);
        try {
            // Persist the key first so the backend uses it for the probe request.
            await setSetting('lmstudio_api_key', lmStudioApiKey);
            const models = await invoke<string[]>('lmstudio_list_models', { baseUrl: lmStudioBaseUrl });
            setLmStudioModels(models);
            // Persist URL (and provider) now so a successful probe is immediately usable.
            await setSetting('lmstudio_base_url', lmStudioBaseUrl);
            await setSetting('ai_provider', 'lmstudio');
            if (models.length === 0) {
                toast('Connected, but no model is loaded in LM Studio.', { icon: '⚠️' });
            } else {
                toast.success(`Found ${models.length} model(s)`);
                // Auto-select and persist the loaded model if none chosen yet
                if (!lmStudioModel) {
                    setLmStudioModel(models[0]);
                    await setSetting('lmstudio_model', models[0]);
                }
            }
        } catch (err) {
            toast.error(typeof err === 'string' ? err : 'Failed to reach LM Studio');
            setLmStudioModels([]);
        } finally {
            setLmStudioProbing(false);
        }
    };

    /**
     * Persists all Save-button-backed settings to the backend DB, synchronizes
     * the OS startup hooks (registry run key / Task Scheduler) with the current
     * options, and resets the unsaved-changes baseline.
     * @returns `true` if the save succeeded, `false` otherwise.
     */
    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                setSetting('curseforge_api_key', curseforgeApiKey),
                setSetting('steam_api_key', steamApiKey),
                setSetting('startup_timeout', startupTimeout),
                setSetting('nvidia_api_key', nvidiaApiKey),
                setSetting('ai_provider', aiProvider),
                setSetting('lmstudio_base_url', lmStudioBaseUrl),
                setSetting('lmstudio_model', lmStudioModel),
                setSetting('lmstudio_api_key', lmStudioApiKey),
                setSetting('global_auto_start_enabled', globalAutoStartEnabled ? 'true' : 'false'),
                setSetting('global_boot_delay', globalBootDelay),
                setSetting('start_minimized_to_tray', startMinimizedToTray ? 'true' : 'false'),
                setSetting('loop_prevention_max_crashes', loopPreventionMaxCrashes),
                setSetting('loop_prevention_time_window_mins', loopPreventionTimeWindowMins),
                setSetting('windows_startup_shortcut', windowsStartupShortcut ? 'true' : 'false'),
                setSetting('silent_headless_startup', silentHeadlessStartup ? 'true' : 'false'),
                setSetting('user_config_folder', userConfigFolder),
                setSetting('custom_steamcmd_path', customSteamcmdPath),
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

            baselineRef.current = persistedSnapshot();
            toast.success(t('settings.saved'));
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error(t('settings.saveFailed'));
            return false;
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
                    {/* Game Support & Evolved Mode */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                                <Cpu className="w-6 h-6 text-cyan-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-white mb-1">Game Support Options</h2>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    Toggle Evolved (ASE) support to display both ARK: Survival Evolved and ARK: Survival Ascended configuration sections. If disabled, Evolved features are hidden to keep the manager streamlined for Ascended.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-800/40 border border-white/5 rounded-xl">
                            <div>
                                <h3 className="text-sm font-semibold text-white">Enable Evolved (ASE) Support</h3>
                                <p className="text-xs text-slate-400 mt-1">Show both Evolved and Ascended server configurations across the manager</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const newVal = !showAseMode;
                                    setShowAseMode(newVal);
                                    if (!newVal && activeGame === 'ASE') {
                                        setActiveGame('ASA');
                                    }
                                }}
                                className={cn(
                                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75",
                                    showAseMode ? "bg-cyan-500" : "bg-slate-700"
                                )}
                                role="switch"
                                aria-checked={showAseMode}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                                        showAseMode ? "translate-x-5" : "translate-x-0"
                                    )}
                                />
                            </button>
                        </div>
                    </div>

                    {/* User Config Folder */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                <FolderOpen className="w-6 h-6 text-amber-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-white mb-1">{t('settings.userConfigFolder.title', 'User Config Folder')}</h2>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    {t('settings.userConfigFolder.desc', 'Point to a custom folder containing your server configuration files (GameUserSettings.ini, Game.ini). When set, the app reads and writes configs from this folder instead of the server install directory. Useful for managing ASM-exported configurations.')}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={userConfigFolder}
                                onChange={(e) => setUserConfigFolder(e.target.value)}
                                placeholder={t('settings.userConfigFolder.placeholder', 'Not set — using default server install path')}
                                className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30 placeholder-slate-500"
                            />
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        const path = await invoke<string | null>('select_folder', { title: 'Select User Config Folder' });
                                        if (path) setUserConfigFolder(path);
                                    } catch (error) {
                                        console.error('Failed to select folder:', error);
                                        toast.error(t('settings.userConfigFolder.browseFailed', 'Failed to open folder picker'));
                                    }
                                }}
                                className="px-3 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors focus:outline-none"
                                title={t('common.browse', 'Browse')}
                            >
                                <FolderOpen className="w-4 h-4" />
                            </button>
                            {userConfigFolder && (
                                <button
                                    type="button"
                                    onClick={() => setUserConfigFolder('')}
                                    className="px-3 py-3 bg-slate-800/50 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 rounded-xl text-slate-400 hover:text-red-400 transition-all focus:outline-none"
                                    title={t('settings.userConfigFolder.clear', 'Clear and use default')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {userConfigFolder && (
                            <p className="mt-3 text-xs text-amber-400/70 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" />
                                {t('settings.userConfigFolder.activeNote', 'Config files will be read from and saved to this folder')}
                            </p>
                        )}
                    </div>

                    {/* Custom SteamCMD Path */}
                    <div className="glass-panel rounded-2xl p-8 animate-in slide-in-from-left-4 duration-300">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
                                <Terminal className="w-6 h-6 text-sky-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-white mb-1">{t('settings.customSteamcmdPath.title', 'Custom SteamCMD Path')}</h2>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    {t('settings.customSteamcmdPath.desc', 'Redirect SteamCMD and server workshop downloads to a custom folder. SteamCMD cannot execute if there are non-English/non-ASCII characters (e.g. á, ő, ú) anywhere in its path. If your Windows username has special characters, set this to an ASCII-only path (e.g. F:\\ASA\\SteamCMD).')}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={customSteamcmdPath}
                                onChange={(e) => setCustomSteamcmdPath(e.target.value)}
                                placeholder={t('settings.customSteamcmdPath.placeholder', 'Not set — using default Roaming AppData')}
                                className={cn(
                                    "flex-1 px-4 py-3 bg-slate-800/50 border rounded-xl text-white font-mono text-xs focus:outline-none focus:border-sky-500/30 placeholder-slate-500",
                                    /[^\x00-\x7F]/.test(customSteamcmdPath) ? "border-red-500/50 text-red-200" : "border-white/10"
                                )}
                            />
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        const path = await invoke<string | null>('select_folder', { title: 'Select Custom SteamCMD Folder' });
                                        if (path) setCustomSteamcmdPath(path);
                                    } catch (error) {
                                        console.error('Failed to select folder:', error);
                                        toast.error(t('settings.customSteamcmdPath.browseFailed', 'Failed to open folder picker'));
                                    }
                                }}
                                className="px-3 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors focus:outline-none"
                                title={t('common.browse', 'Browse')}
                            >
                                <FolderOpen className="w-4 h-4" />
                            </button>
                            {customSteamcmdPath && (
                                <button
                                    type="button"
                                    onClick={() => setCustomSteamcmdPath('')}
                                    className="px-3 py-3 bg-slate-800/50 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 rounded-xl text-slate-400 hover:text-red-400 transition-all focus:outline-none"
                                    title={t('settings.customSteamcmdPath.clear', 'Clear and use default')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {/[^\x00-\x7F]/.test(customSteamcmdPath) && (
                            <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {t('settings.customSteamcmdPath.invalidWarning', 'Warning: Path contains non-ASCII characters. SteamCMD will fail to run here.')}
                            </p>
                        )}
                        {customSteamcmdPath && !/[^\x00-\x7F]/.test(customSteamcmdPath) && (
                            <p className="mt-3 text-xs text-sky-400/70 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" />
                                {t('settings.customSteamcmdPath.activeNote', 'SteamCMD operations will run from this folder')}
                            </p>
                        )}
                    </div>

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

                    {/* AI Provider Selector */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                                <Cpu className="w-6 h-6 text-cyan-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white mb-2">{t('settings.aiProvider.title', 'AI Provider')}</h2>
                                <p className="text-slate-400">
                                    {t('settings.aiProvider.description', 'Choose between NVIDIA cloud models or a local LM Studio server running your own loaded model.')}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button
                                onClick={() => handleSelectProvider('nvidia')}
                                className={cn(
                                    "text-left p-5 rounded-xl border transition-all",
                                    aiProvider === 'nvidia'
                                        ? "bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30"
                                        : "bg-slate-800/40 border-slate-700 hover:border-slate-600"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Bot className="w-4 h-4 text-emerald-400" />
                                    <span className="font-semibold text-white">{t('settings.aiProvider.nvidia', 'NVIDIA Cloud')}</span>
                                    {aiProvider === 'nvidia' && <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto" />}
                                </div>
                                <p className="text-xs text-slate-400">{t('settings.aiProvider.nvidiaDesc', 'Hosted NIM models. Requires an API key.')}</p>
                            </button>

                            <button
                                onClick={() => handleSelectProvider('lmstudio')}
                                className={cn(
                                    "text-left p-5 rounded-xl border transition-all",
                                    aiProvider === 'lmstudio'
                                        ? "bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30"
                                        : "bg-slate-800/40 border-slate-700 hover:border-slate-600"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Cpu className="w-4 h-4 text-cyan-400" />
                                    <span className="font-semibold text-white">{t('settings.aiProvider.lmstudio', 'LM Studio (Local)')}</span>
                                    {aiProvider === 'lmstudio' && <CheckCircle className="w-4 h-4 text-cyan-400 ml-auto" />}
                                </div>
                                <p className="text-xs text-slate-400">{t('settings.aiProvider.lmstudioDesc', 'Your own loaded model, offline & private.')}</p>
                            </button>
                        </div>
                    </div>

                    {/* LM Studio Configuration */}
                    {aiProvider === 'lmstudio' && (
                        <div className="glass-panel rounded-2xl p-8">
                            <div className="flex items-start space-x-4 mb-6">
                                <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                                    <Terminal className="w-6 h-6 text-cyan-400" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-2xl font-bold text-white mb-2">{t('settings.lmStudio.title', 'LM Studio Endpoint')}</h2>
                                    <p className="text-slate-400">
                                        {t('settings.lmStudio.description', 'Point Infinity AI at a local OpenAI-compatible server and pick the loaded model.')}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        {t('settings.lmStudio.baseUrl', 'Server Base URL')}
                                    </label>
                                    <div className="relative">
                                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <input
                                            type="text"
                                            value={lmStudioBaseUrl}
                                            onChange={(e) => setLmStudioBaseUrl(e.target.value)}
                                            onBlur={() => setSetting('lmstudio_base_url', lmStudioBaseUrl).catch(() => {})}
                                            placeholder="http://localhost:1234/v1"
                                            className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-mono"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        {t('settings.lmStudio.baseUrlHint', "In LM Studio: Developer tab → start the server. Default is http://localhost:1234/v1.")}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        {t('settings.lmStudio.apiKey', 'API Token')} <span className="text-slate-500 font-normal">({t('common.optional', 'optional')})</span>
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <input
                                            type={showLmStudioKey ? 'text' : 'password'}
                                            value={lmStudioApiKey}
                                            onChange={(e) => setLmStudioApiKey(e.target.value)}
                                            onBlur={() => setSetting('lmstudio_api_key', lmStudioApiKey).catch(() => {})}
                                            placeholder={t('settings.lmStudio.apiKeyPlaceholder', 'Leave blank for a default local server')}
                                            className="w-full pl-12 pr-14 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowLmStudioKey(!showLmStudioKey)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-sm"
                                        >
                                            {showLmStudioKey ? t('common.hide') : t('common.show')}
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        {t('settings.lmStudio.apiKeyHint', 'Only needed if your server enforces auth (e.g. a remote endpoint or a proxy in front of LM Studio).')}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        {t('settings.lmStudio.model', 'Loaded Model')}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={lmStudioModel}
                                            onChange={(e) => setLmStudioModel(e.target.value)}
                                            onBlur={() => setSetting('lmstudio_model', lmStudioModel).catch(() => {})}
                                            placeholder="qwen3.5-4b-uncensored-hauhaucs-aggressive"
                                            list="lmstudio-models"
                                            className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-mono"
                                        />
                                        <datalist id="lmstudio-models">
                                            {lmStudioModels.map((m) => <option key={m} value={m} />)}
                                        </datalist>
                                        <button
                                            onClick={handleProbeLmStudio}
                                            disabled={lmStudioProbing}
                                            className="flex items-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl transition-colors shadow-lg shadow-cyan-500/20 whitespace-nowrap"
                                        >
                                            <RefreshCw className={cn("w-4 h-4", lmStudioProbing && "animate-spin")} />
                                            <span>{t('settings.lmStudio.detect', 'Detect')}</span>
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        {t('settings.lmStudio.modelHint', 'Type the model id or click Detect to list models loaded in LM Studio. Leave blank to use the currently loaded one.')}
                                    </p>
                                </div>

                                {lmStudioModels.length > 0 && (
                                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
                                        <div className="flex items-center space-x-2">
                                            <CheckCircle className="w-5 h-5 text-cyan-400" />
                                            <span className="text-cyan-400 font-medium">
                                                {t('settings.lmStudio.connected', 'Connected — {{count}} model(s) available', { count: lmStudioModels.length })}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

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
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="text-sm font-medium text-slate-300">
                                                    {formatRelativeTime(entry.date)}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {new Date(entry.date).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {entry.action === 'installed' && entry.version !== currentVersion && (
                                                    <button
                                                        onClick={() => handleRollback(entry.version)}
                                                        className="px-2.5 py-1.5 bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white border border-orange-500/20 rounded-lg transition-all text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
                                                        title={`Rollback to v${entry.version}`}
                                                    >
                                                        <Undo2 className="w-3.5 h-3.5" />
                                                        Rollback
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleRemoveHistoryEntry(entry.id)}
                                                    className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-lg transition-all"
                                                    title="Remove from history"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
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
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => openUrl(getReleasesUrl())}
                                className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl transition-colors shadow-lg shadow-orange-500/20"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {t('settings.updatesTab.viewReleases', 'View Releases on GitHub')}
                            </button>
                            <button
                                onClick={handleUninstall}
                                className="flex items-center gap-2 px-6 py-3 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 hover:border-red-500 rounded-xl transition-all shadow-lg font-semibold"
                            >
                                <Trash2 className="w-5 h-5" />
                                Uninstall Server Manager
                            </button>
                        </div>
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
            {blocker.state === 'blocked' && createPortal(
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md flex flex-col bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-800">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-amber-400" />
                                {t('settings.unsaved.title', 'Unsaved changes')}
                            </h3>
                            <p className="text-sm text-slate-400 mt-2">
                                {t('settings.unsaved.body', 'You have unsaved settings. Leaving this page will discard them.')}
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 p-4 bg-slate-900/40">
                            <button
                                onClick={() => blocker.reset?.()}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium transition-colors"
                            >
                                {t('settings.unsaved.stay', 'Stay')}
                            </button>
                            <button
                                onClick={() => blocker.proceed?.()}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white font-medium transition-colors"
                            >
                                {t('settings.unsaved.discard', 'Leave without saving')}
                            </button>
                            <button
                                onClick={handleSaveAndLeave}
                                disabled={isSaving}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium transition-colors"
                            >
                                {isSaving ? t('common.saving', 'Saving…') : t('settings.unsaved.saveLeave', 'Save & leave')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {isViewLogOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
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
                </div>,
                document.body
            )}
        </div>
    );
}
