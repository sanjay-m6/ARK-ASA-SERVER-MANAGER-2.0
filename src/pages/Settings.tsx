import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker } from 'react-router-dom';
import { Save, Key, Lock, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Download, Clock, History, Undo2, Globe, Trash2, Bot, FolderOpen, FileText, Search, Copy, Check, Terminal, X, Cpu, Loader2, Eye, EyeOff, Shield, Zap, Palette } from 'lucide-react';
import { getSetting, setSetting, getAllServers } from '../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import FirewallSettings from '../components/settings/FirewallSettings';
import StartupSettings from '../components/settings/StartupSettings';
import AppearanceSettings from '../components/settings/AppearanceSettings';
import LanguageSettings from '../components/settings/LanguageSettings';
import { manualCheckForUpdates } from '../components/UpdateChecker';
import { cn } from '../utils/helpers';
import { useServerStore } from '../stores/serverStore';
import { useGameStore } from '../stores/gameStore';

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
    const [resolvedSteamcmdPath, setResolvedSteamcmdPath] = useState('');
    const [isScrolled, setIsScrolled] = useState(false);
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 150);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        invoke<string>('get_steamcmd_dir')
            .then(setResolvedSteamcmdPath)
            .catch(() => {});
    }, [customSteamcmdPath]);

    const [activeTab, setActiveTab] = useState<'api' | 'appearance' | 'firewall' | 'updates' | 'language' | 'startup'>('api');
    const { setServers, activeServer } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);

    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        }
    }, [activeServer]);
    const { t } = useTranslation();
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
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const handleCopyText = (text: string, fieldName: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        toast.success(t('common.copied', 'Copied to clipboard'));
        setTimeout(() => setCopiedField(null), 2000);
    };

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

    // ── Debounced Auto-Save ─────────────────────────────────────────────
    useEffect(() => {
        if (!autoSaveEnabled || isLoading || !isDirty) return;

        setAutoSaveStatus('saving');
        const timer = setTimeout(async () => {
            const ok = await handleSave({ silent: true });
            if (ok) {
                setAutoSaveStatus('saved');
                setTimeout(() => setAutoSaveStatus('idle'), 2500);
            } else {
                setAutoSaveStatus('idle');
            }
        }, 700);

        return () => clearTimeout(timer);
    }, [
        curseforgeApiKey, steamApiKey, nvidiaApiKey, startupTimeout,
        globalAutoStartEnabled, globalBootDelay, startMinimizedToTray,
        loopPreventionMaxCrashes, loopPreventionTimeWindowMins,
        windowsStartupShortcut, silentHeadlessStartup, userConfigFolder, customSteamcmdPath,
        aiProvider, lmStudioBaseUrl, lmStudioModel, lmStudioApiKey,
        autoSaveEnabled, isLoading, isDirty
    ]);

    // Block in-app navigation away from Settings while there are unsaved changes (only if auto-save disabled).
    const blocker = useBlocker(() => isDirty && !autoSaveEnabled);

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
    const handleSave = async (options?: { silent?: boolean }) => {
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
            }

            baselineRef.current = persistedSnapshot();
            if (!options?.silent) {
                toast.success(t('settings.saved', 'Settings saved successfully'));
            }
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            if (!options?.silent) {
                toast.error(t('settings.saveFailed', 'Failed to save settings'));
            }
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
                <div className="flex items-center gap-3">
                    {/* Auto-Save Toggle & Status Badge */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[var(--surface-active)] border border-[var(--border)] rounded-2xl backdrop-blur-md shadow-sm">
                        <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}>
                            <div className={cn(
                                "w-9 h-5 rounded-full transition-colors relative p-0.5",
                                autoSaveEnabled ? "bg-emerald-500" : "bg-slate-500/40"
                            )}>
                                <div className={cn(
                                    "w-4 h-4 rounded-full bg-white transition-transform shadow-md",
                                    autoSaveEnabled ? "translate-x-4" : "translate-x-0"
                                )} />
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                                {t('settings.autoSave', 'Auto Save')}
                            </span>
                        </div>

                        {autoSaveEnabled && (
                            <div className="flex items-center gap-1.5 pl-2.5 border-l border-[var(--border)] text-xs font-medium">
                                {autoSaveStatus === 'saving' ? (
                                    <span className="flex items-center gap-1.5 text-amber-400">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>{t('settings.autoSaving', 'Auto-saving…')}</span>
                                    </span>
                                ) : autoSaveStatus === 'saved' ? (
                                    <span className="flex items-center gap-1.5 text-emerald-400">
                                        <Check className="w-3.5 h-3.5" />
                                        <span>{t('settings.autoSaved', 'Saved')}</span>
                                    </span>
                                ) : (
                                    <span className="text-[var(--text-secondary)]">Ready</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Manual Save Settings Button */}
                    <button
                        onClick={() => handleSave()}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center space-x-2.5 px-6 py-3 rounded-2xl font-bold transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm",
                            isDirty && !autoSaveEnabled
                                ? "bg-gradient-to-r from-amber-500 via-rose-500 to-pink-600 hover:from-amber-400 hover:to-pink-500 text-white shadow-amber-500/40 ring-4 ring-amber-500/40 animate-pulse"
                                : "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/25"
                        )}
                    >
                        <Save className={cn("w-4.5 h-4.5", isSaving && "animate-spin")} />
                        <span>
                            {isSaving
                                ? t('common.saving', 'Saving…')
                                : isDirty && !autoSaveEnabled
                                ? t('settings.saveUnsaved', '⚡ SAVE SETTINGS')
                                : t('common.saveSettings', 'Save Settings')}
                        </span>
                    </button>
                </div>
            </div>

            {/* Modern Segmented Navigation Bar */}
            <div className="flex p-2 rounded-3xl glass-panel w-full shadow-lg gap-2 mb-8 overflow-x-auto scrollbar-none">
                <button
                    onClick={() => setActiveTab('api')}
                    className={cn(
                        "flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative overflow-hidden whitespace-nowrap group",
                        activeTab === 'api'
                            ? "text-sky-300 bg-gradient-to-r from-sky-500/20 via-blue-500/15 to-indigo-500/20 border border-sky-500/40 shadow-lg shadow-sky-500/10"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                    )}
                >
                    <div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'api' ? "bg-sky-500/30 text-sky-300" : "bg-slate-800 text-slate-400 group-hover:text-white")}>
                        <Key className="w-4 h-4" />
                    </div>
                    <span>{t('settings.tabs.apiKeys', 'API Keys & Integrations')}</span>
                    {activeTab === 'api' && <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse ml-auto" />}
                </button>

                <button
                    onClick={() => setActiveTab('appearance')}
                    className={cn(
                        "flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative overflow-hidden whitespace-nowrap group",
                        activeTab === 'appearance'
                            ? "text-purple-300 bg-gradient-to-r from-purple-500/20 via-pink-500/15 to-sky-500/20 border border-purple-500/40 shadow-lg shadow-purple-500/10"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                    )}
                >
                    <div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'appearance' ? "bg-purple-500/30 text-purple-300" : "bg-slate-800 text-slate-400 group-hover:text-white")}>
                        <Palette className="w-4 h-4" />
                    </div>
                    <span>{t('settings.tabs.appearance', 'Appearance & Theme')}</span>
                    {activeTab === 'appearance' && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse ml-auto" />}
                </button>

                <button
                    onClick={() => setActiveTab('firewall')}
                    className={cn(
                        "flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative overflow-hidden whitespace-nowrap group",
                        activeTab === 'firewall'
                            ? "text-red-300 bg-gradient-to-r from-red-500/20 via-rose-500/15 to-orange-500/20 border border-red-500/40 shadow-lg shadow-red-500/10"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                    )}
                >
                    <div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'firewall' ? "bg-red-500/30 text-red-300" : "bg-slate-800 text-slate-400 group-hover:text-white")}>
                        <Shield className="w-4 h-4" />
                    </div>
                    <span>{t('settings.tabs.firewall', 'Firewall & Ports')}</span>
                    {activeTab === 'firewall' && <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse ml-auto" />}
                </button>

                <button
                    onClick={() => setActiveTab('updates')}
                    className={cn(
                        "flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative overflow-hidden whitespace-nowrap group",
                        activeTab === 'updates'
                            ? "text-emerald-300 bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-cyan-500/20 border border-emerald-500/40 shadow-lg shadow-emerald-500/10"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                    )}
                >
                    <div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'updates' ? "bg-emerald-500/30 text-emerald-300" : "bg-slate-800 text-slate-400 group-hover:text-white")}>
                        <RefreshCw className="w-4 h-4" />
                    </div>
                    <span>{t('settings.tabs.updates', 'Updates & Releases')}</span>
                    {activeTab === 'updates' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-auto" />}
                </button>

                <button
                    onClick={() => setActiveTab('startup')}
                    className={cn(
                        "flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative overflow-hidden whitespace-nowrap group",
                        activeTab === 'startup'
                            ? "text-amber-300 bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-orange-500/20 border border-amber-500/40 shadow-lg shadow-amber-500/10"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                    )}
                >
                    <div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'startup' ? "bg-amber-500/30 text-amber-300" : "bg-slate-800 text-slate-400 group-hover:text-white")}>
                        <Zap className="w-4 h-4" />
                    </div>
                    <span>{t('settings.tabs.startup', 'Startup & Recovery')}</span>
                    {activeTab === 'startup' && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-auto" />}
                </button>

                <button
                    onClick={() => setActiveTab('language')}
                    className={cn(
                        "flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative overflow-hidden whitespace-nowrap group",
                        activeTab === 'language'
                            ? "text-cyan-300 bg-gradient-to-r from-cyan-500/20 via-blue-500/15 to-sky-500/20 border border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                    )}
                >
                    <div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'language' ? "bg-cyan-500/30 text-cyan-300" : "bg-slate-800 text-slate-400 group-hover:text-white")}>
                        <Globe className="w-4 h-4" />
                    </div>
                    <span>{t('settings.tabs.language', 'Language & Region')}</span>
                    {activeTab === 'language' && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse ml-auto" />}
                </button>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-4 border-sky-500/20 border-t-sky-400 animate-spin" />
                        <div className="absolute inset-0 bg-sky-500/10 rounded-full blur-xl" />
                    </div>
                    <span className="text-sm font-medium text-slate-400">{t('common.loadingSettings', 'Loading preferences…')}</span>
                </div>
            ) : activeTab === 'appearance' ? (
                <AppearanceSettings />
            ) : activeTab === 'api' ? (
                <div className="space-y-8 animate-in slide-in-from-left-4 duration-300">

                    {/* ── Section 1: Game & System Directories ── */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                            <FolderOpen className="w-4 h-4 text-cyan-400" />
                            <span>System & Storage Directories</span>
                        </div>

                        {/* Game Support Options */}
                        <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl hover:border-cyan-500/30 transition-all duration-300">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/30 rounded-2xl shadow-inner">
                                    <Cpu className="w-6 h-6 text-cyan-400" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-xl font-bold text-white mb-1">Game Support Options</h2>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        Toggle Evolved (ASE) support to display both ARK: Survival Evolved and ARK: Survival Ascended configuration sections. If disabled, Evolved features are hidden to keep the manager streamlined for Ascended.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-950/60 border border-white/5 rounded-2xl">
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
                                        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                        showAseMode ? "bg-cyan-500 shadow-lg shadow-cyan-500/30" : "bg-slate-800 border-slate-700"
                                    )}
                                    role="switch"
                                    aria-checked={showAseMode}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out",
                                            showAseMode ? "translate-x-5" : "translate-x-0"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* User Config Folder */}
                        <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl hover:border-amber-500/30 transition-all duration-300">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/30 rounded-2xl shadow-inner">
                                    <FolderOpen className="w-6 h-6 text-amber-400" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-xl font-bold text-white mb-1">{t('settings.userConfigFolder.title', 'User Config Folder')}</h2>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        {t('settings.userConfigFolder.desc', 'Point to a custom folder containing your server configuration files (GameUserSettings.ini, Game.ini). When set, the app reads and writes configs from this folder instead of the server install directory.')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={userConfigFolder}
                                    onChange={(e) => setUserConfigFolder(e.target.value)}
                                    placeholder={t('settings.userConfigFolder.placeholder', 'Not set — using default server install path')}
                                    className="flex-1 px-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 placeholder-slate-500 transition-all"
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
                                    className="px-4 py-3 bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all flex items-center gap-2 text-xs font-semibold"
                                    title={t('common.browse', 'Browse')}
                                >
                                    <FolderOpen className="w-4 h-4 text-amber-400" />
                                    <span>Browse</span>
                                </button>
                                {userConfigFolder && (
                                    <button
                                        type="button"
                                        onClick={() => setUserConfigFolder('')}
                                        className="px-3 py-3 bg-slate-800/80 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl text-slate-400 hover:text-red-400 transition-all"
                                        title={t('settings.userConfigFolder.clear', 'Clear and use default')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {userConfigFolder && (
                                <p className="mt-3 text-xs text-amber-400/90 flex items-center gap-1.5 font-medium">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    {t('settings.userConfigFolder.activeNote', 'Config files will be read from and saved to this folder')}
                                </p>
                            )}
                        </div>

                        {/* Custom SteamCMD Path */}
                        <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl hover:border-sky-500/30 transition-all duration-300">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="p-3 bg-gradient-to-br from-sky-500/20 to-blue-600/10 border border-sky-500/30 rounded-2xl shadow-inner">
                                    <Terminal className="w-6 h-6 text-sky-400" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-xl font-bold text-white mb-1">{t('settings.customSteamcmdPath.title', 'Custom SteamCMD Path')}</h2>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        {t('settings.customSteamcmdPath.desc', 'Redirect SteamCMD and server workshop downloads to a custom folder. Useful if your Windows username contains non-ASCII characters.')}
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
                                        "flex-1 px-4 py-3 bg-slate-950/70 border rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 placeholder-slate-500 transition-all",
                                        /[^\x00-\x7F]/.test(customSteamcmdPath) ? "border-red-500/50 text-red-200" : "border-slate-700/80 focus:border-sky-500/50"
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
                                    className="px-4 py-3 bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all flex items-center gap-2 text-xs font-semibold"
                                    title={t('common.browse', 'Browse')}
                                >
                                    <FolderOpen className="w-4 h-4 text-sky-400" />
                                    <span>Browse</span>
                                </button>
                                {customSteamcmdPath && (
                                    <button
                                        type="button"
                                        onClick={() => setCustomSteamcmdPath('')}
                                        className="px-3 py-3 bg-slate-800/80 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl text-slate-400 hover:text-red-400 transition-all"
                                        title={t('settings.customSteamcmdPath.clear', 'Clear and use default')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {/[^\x00-\x7F]/.test(customSteamcmdPath) && (
                                <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5 font-medium">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    {t('settings.customSteamcmdPath.invalidWarning', 'Warning: Path contains non-ASCII characters. SteamCMD will fail to run here.')}
                                </p>
                            )}
                            {resolvedSteamcmdPath && (
                                <div className="mt-4 p-3.5 bg-slate-950/80 rounded-2xl border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <CheckCircle className="w-4 h-4 text-sky-400 shrink-0" />
                                        <span className="font-medium text-slate-400">Active SteamCMD Location:</span>
                                        <code className="px-2.5 py-1 bg-slate-900 rounded-lg text-sky-300 font-mono text-[11px] select-all border border-white/10">
                                            {resolvedSteamcmdPath}
                                        </code>
                                    </div>
                                    {resolvedSteamcmdPath.includes('ARKServerManager') && !customSteamcmdPath && (
                                        <span className="text-[11px] text-amber-300 font-medium bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1.5">
                                            🛡️ Auto-Fallback Active
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Section 2: Steam & Modding Integration Keys ── */}
                    <div className="space-y-6 pt-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                            <Key className="w-4 h-4 text-sky-400" />
                            <span>Steam & Modding Integration Keys</span>
                        </div>

                        {/* Steam Web API Key */}
                        <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl hover:border-sky-500/30 transition-all duration-300">
                            <div className="flex items-start justify-between gap-4 mb-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-gradient-to-br from-sky-500/20 to-blue-600/10 border border-sky-500/30 rounded-2xl shadow-inner">
                                        <Key className="w-6 h-6 text-sky-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-white">Steam Web API Key</h2>
                                            {steamApiKey ? (
                                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" /> Configured
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[11px] font-bold">
                                                    Optional
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-400 mt-1">
                                            Used for checking software updates and querying Steam Workshop metadata.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => openUrl('https://steamcommunity.com/dev/apikey')}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-500/20 shrink-0"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Get Steam Key</span>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                        Steam Web API Key
                                    </label>
                                    <div className="relative flex items-center">
                                        <Lock className="absolute left-4 w-4 h-4 text-slate-500" />
                                        <input
                                            type={showSteamKey ? 'text' : 'password'}
                                            value={steamApiKey}
                                            onChange={(e) => setSteamApiKey(e.target.value)}
                                            placeholder="Enter your 32-character Steam Web API key"
                                            className="w-full pl-11 pr-24 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 placeholder-slate-500 transition-all"
                                        />
                                        <div className="absolute right-2 flex items-center gap-1">
                                            {steamApiKey && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyText(steamApiKey, 'steam')}
                                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                    title="Copy key"
                                                >
                                                    {copiedField === 'steam' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setShowSteamKey(!showSteamKey)}
                                                className="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs font-medium"
                                            >
                                                {showSteamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CurseForge API Key */}
                        <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl hover:border-sky-500/30 transition-all duration-300">
                            <div className="flex items-start justify-between gap-4 mb-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/30 rounded-2xl shadow-inner">
                                        <Key className="w-6 h-6 text-amber-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-white">CurseForge API Key</h2>
                                            {keyStatus === 'valid' ? (
                                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" /> Verified
                                                </span>
                                            ) : curseforgeApiKey ? (
                                                <span className="px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[11px] font-bold flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" /> Configured
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-bold flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> Required for Mod Search
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-400 mt-1">
                                            Required for searching and installing ARK: Survival Ascended mods via CurseForge API.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => openUrl('https://console.curseforge.com')}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20 shrink-0"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Get CurseForge Key</span>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                        CurseForge API Key ($2a$10...)
                                    </label>
                                    <div className="relative flex items-center">
                                        <Lock className="absolute left-4 w-4 h-4 text-slate-500" />
                                        <input
                                            type={showCurseforgeKey ? 'text' : 'password'}
                                            value={curseforgeApiKey}
                                            onChange={(e) => {
                                                setCurseforgeApiKey(e.target.value);
                                                setKeyStatus('idle');
                                            }}
                                            placeholder="Enter your CurseForge API key ($2a$10...)"
                                            className="w-full pl-11 pr-24 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 placeholder-slate-500 transition-all"
                                        />
                                        <div className="absolute right-2 flex items-center gap-1">
                                            {curseforgeApiKey && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyText(curseforgeApiKey, 'curseforge')}
                                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                    title="Copy key"
                                                >
                                                    {copiedField === 'curseforge' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setShowCurseforgeKey(!showCurseforgeKey)}
                                                className="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs font-medium"
                                            >
                                                {showCurseforgeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {curseforgeApiKey && (
                                    <button
                                        onClick={verifyKey}
                                        disabled={isVerifying}
                                        className={cn(
                                            "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all text-xs",
                                            keyStatus === 'valid'
                                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                                : keyStatus === 'invalid'
                                                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                                                    : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                                        )}
                                    >
                                        {isVerifying ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                                                <span>Verifying API Key with CurseForge servers...</span>
                                            </>
                                        ) : keyStatus === 'valid' ? (
                                            <>
                                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                                <span>Key Verified & Active!</span>
                                            </>
                                        ) : keyStatus === 'invalid' ? (
                                            <>
                                                <AlertCircle className="w-4 h-4 text-red-400" />
                                                <span>Invalid API Key — Check & Retry</span>
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="w-4 h-4 text-amber-400" />
                                                <span>Test & Verify CurseForge Key</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Section 3: Infinity AI Assistant Engine ── */}
                    <div className="space-y-6 pt-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                            <Bot className="w-4 h-4 text-emerald-400" />
                            <span>Infinity AI Assistant Engine</span>
                        </div>

                        {/* AI Provider Selection Cards */}
                        <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-cyan-600/10 border border-emerald-500/30 rounded-2xl shadow-inner">
                                    <Bot className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-xl font-bold text-white mb-1">AI Engine Provider</h2>
                                    <p className="text-sm text-slate-400">
                                        Choose between NVIDIA cloud models or a local LM Studio server for autonomous server management.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button
                                    onClick={() => handleSelectProvider('nvidia')}
                                    className={cn(
                                        "text-left p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group",
                                        aiProvider === 'nvidia'
                                            ? "bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                                            : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                <Bot className="w-4 h-4" />
                                            </div>
                                            <span className="font-bold text-white">NVIDIA Cloud API</span>
                                        </div>
                                        {aiProvider === 'nvidia' && (
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        High-performance Llama 3.1 & Nemotron models powered by NVIDIA NIM cloud architecture.
                                    </p>
                                </button>

                                <button
                                    onClick={() => handleSelectProvider('lmstudio')}
                                    className={cn(
                                        "text-left p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group",
                                        aiProvider === 'lmstudio'
                                            ? "bg-gradient-to-br from-cyan-500/15 via-blue-500/10 to-transparent border-cyan-500/50 shadow-lg shadow-cyan-500/10"
                                            : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                                <Cpu className="w-4 h-4" />
                                            </div>
                                            <span className="font-bold text-white">Local LM Studio</span>
                                        </div>
                                        {aiProvider === 'lmstudio' && (
                                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold border border-cyan-500/30">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        100% offline, private, self-hosted LLM running directly on your own GPU/CPU hardware.
                                    </p>
                                </button>
                            </div>
                        </div>

                        {/* NVIDIA AI API Key Details */}
                        {aiProvider === 'nvidia' && (
                            <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl animate-in fade-in duration-300">
                                <div className="flex items-start justify-between gap-4 mb-6">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-cyan-600/10 border border-emerald-500/30 rounded-2xl shadow-inner">
                                            <Bot className="w-6 h-6 text-emerald-400" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-bold text-white">NVIDIA NIM API Key</h2>
                                                {nvidiaApiKey ? (
                                                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                                                        <CheckCircle className="w-3 h-3" /> Configured
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-bold flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" /> Key Needed
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-400 mt-1">
                                                Required for Infinity AI to assist with server optimizations and logs.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openUrl('https://build.nvidia.com/')}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 shrink-0"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>Get Free NVIDIA Key</span>
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                            NVIDIA API Key (nvapi-...)
                                        </label>
                                        <div className="relative flex items-center">
                                            <Lock className="absolute left-4 w-4 h-4 text-slate-500" />
                                            <input
                                                type={showNvidiaKey ? 'text' : 'password'}
                                                value={nvidiaApiKey}
                                                onChange={(e) => setNvidiaApiKey(e.target.value)}
                                                placeholder="nvapi-..."
                                                className="w-full pl-11 pr-24 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 placeholder-slate-500 transition-all"
                                            />
                                            <div className="absolute right-2 flex items-center gap-1">
                                                {nvidiaApiKey && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyText(nvidiaApiKey, 'nvidia')}
                                                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                        title="Copy key"
                                                    >
                                                        {copiedField === 'nvidia' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNvidiaKey(!showNvidiaKey)}
                                                    className="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs font-medium"
                                                >
                                                    {showNvidiaKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Local LM Studio Configuration */}
                        {aiProvider === 'lmstudio' && (
                            <div className="backdrop-blur-xl bg-slate-900/50 border border-white/10 rounded-3xl p-7 shadow-2xl animate-in fade-in duration-300 space-y-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/30 rounded-2xl shadow-inner">
                                        <Terminal className="w-6 h-6 text-cyan-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">LM Studio Local Server Endpoint</h2>
                                        <p className="text-sm text-slate-400 mt-1">
                                            Connect to your locally running LM Studio HTTP server (`http://localhost:1234/v1`).
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                            Server Base URL
                                        </label>
                                        <div className="relative flex items-center">
                                            <Globe className="absolute left-4 w-4 h-4 text-slate-500" />
                                            <input
                                                type="text"
                                                value={lmStudioBaseUrl}
                                                onChange={(e) => setLmStudioBaseUrl(e.target.value)}
                                                onBlur={() => setSetting('lmstudio_base_url', lmStudioBaseUrl).catch(() => {})}
                                                placeholder="http://localhost:1234/v1"
                                                className="w-full pl-11 pr-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                            API Token (Optional)
                                        </label>
                                        <div className="relative flex items-center">
                                            <Lock className="absolute left-4 w-4 h-4 text-slate-500" />
                                            <input
                                                type={showLmStudioKey ? 'text' : 'password'}
                                                value={lmStudioApiKey}
                                                onChange={(e) => setLmStudioApiKey(e.target.value)}
                                                onBlur={() => setSetting('lmstudio_api_key', lmStudioApiKey).catch(() => {})}
                                                placeholder="Leave blank for local server"
                                                className="w-full pl-11 pr-12 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowLmStudioKey(!showLmStudioKey)}
                                                className="absolute right-3 text-slate-400 hover:text-white"
                                            >
                                                {showLmStudioKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                        Loaded Model Name
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={lmStudioModel}
                                            onChange={(e) => setLmStudioModel(e.target.value)}
                                            onBlur={() => setSetting('lmstudio_model', lmStudioModel).catch(() => {})}
                                            placeholder="Auto-detect or type model id"
                                            list="lmstudio-models"
                                            className="flex-1 px-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                        />
                                        <datalist id="lmstudio-models">
                                            {lmStudioModels.map((m) => <option key={m} value={m} />)}
                                        </datalist>
                                        <button
                                            onClick={handleProbeLmStudio}
                                            disabled={lmStudioProbing}
                                            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                                        >
                                            <RefreshCw className={cn("w-4 h-4", lmStudioProbing && "animate-spin")} />
                                            <span>Detect Models</span>
                                        </button>
                                    </div>
                                </div>

                                {lmStudioModels.length > 0 && (
                                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-4 flex items-center gap-3 text-xs text-cyan-300 font-medium">
                                        <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                                        <span>Connected to LM Studio — {lmStudioModels.length} active model(s) detected.</span>
                                    </div>
                                )}
                            </div>
                        )}
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

            ) : activeTab === 'language' ? (
                <LanguageSettings />
            ) : null}

            {/* Floating Pop-Up Save Bar */}
            {(isDirty || isScrolled) && createPortal(
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] animate-in slide-in-from-bottom-6 fade-in duration-300">
                    <div className={cn(
                        "flex items-center gap-4 px-6 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300",
                        isDirty
                            ? "bg-slate-900/95 border-amber-500/50 shadow-amber-500/20 ring-1 ring-amber-500/30"
                            : "bg-slate-900/90 border-slate-700/60 shadow-slate-950/80"
                    )}>
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-3 h-3 rounded-full",
                                autoSaveEnabled && autoSaveStatus === 'saving'
                                    ? "bg-amber-400 animate-ping"
                                    : isDirty && !autoSaveEnabled
                                    ? "bg-amber-400 animate-ping"
                                    : "bg-emerald-400"
                            )} />
                            <div>
                                <span className="text-sm font-bold text-white block leading-tight">
                                    {autoSaveEnabled
                                        ? (autoSaveStatus === 'saving' ? t('settings.autoSaving', 'Auto-saving…') : t('settings.autoSaveActive', 'Auto Save Active'))
                                        : isDirty
                                        ? t('settings.unsavedChanges', 'Unsaved Settings Edits')
                                        : t('settings.allSaved', 'Settings Up to Date')}
                                </span>
                                <span className="text-[11px] text-slate-400 block">
                                    {autoSaveEnabled
                                        ? t('settings.autoSaveNotice', 'Edits save automatically in background')
                                        : isDirty
                                        ? t('settings.unsavedChangesDesc', 'Click Save Settings to apply modifications')
                                        : t('settings.savedNotice', 'All modifications have been saved')}
                                </span>
                            </div>
                        </div>

                        <div className="h-8 w-px bg-slate-700/60" />

                        <div className="flex items-center gap-2">
                            {isDirty && !autoSaveEnabled && (
                                <button
                                    onClick={() => loadSettings()}
                                    disabled={isSaving}
                                    className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                                >
                                    {t('common.cancel', 'Cancel')}
                                </button>
                            )}

                            <button
                                onClick={() => handleSave()}
                                disabled={isSaving || (!isDirty && !isVerifying)}
                                className={cn(
                                    "flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                                    isDirty && !autoSaveEnabled
                                        ? "bg-gradient-to-r from-amber-500 via-rose-500 to-pink-600 hover:from-amber-400 hover:to-pink-500 text-white shadow-amber-500/30 ring-2 ring-amber-400/50 animate-pulse"
                                        : "bg-slate-800 text-slate-300 border border-slate-700"
                                )}
                            >
                                <Save className={cn("w-4 h-4", isSaving && "animate-spin")} />
                                <span>{isSaving ? t('common.saving', 'Saving…') : (isDirty && !autoSaveEnabled) ? t('settings.saveUnsavedShort', '⚡ Save Settings') : t('common.saveSettings', 'Save Settings')}</span>
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

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
