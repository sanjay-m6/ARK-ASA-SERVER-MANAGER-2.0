import { useState, useEffect } from 'react';
import { Save, Key, Lock, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Download, Clock, History, Undo2, Globe } from 'lucide-react';
import { getSetting, setSetting } from '../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import FirewallSettings from '../components/settings/FirewallSettings';
import { manualCheckForUpdates } from '../components/UpdateChecker';
import { cn } from '../utils/helpers';
import {
    getUpdateSettings,
    setUpdateSettings,
    getUpdateHistory,
    clearSkippedVersions,
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
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [startupTimeout, setStartupTimeout] = useState('1800');

    const [activeTab, setActiveTab] = useState<'api' | 'firewall' | 'updates' | 'language'>('api');
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

    useEffect(() => {
        loadSettings();
        getVersion().then(setCurrentVersion).catch(console.error);
    }, []);

    const openUrl = async (url: string) => {
        try {
            await invoke('plugin:opener|open_url', { url });
        } catch (error) {
            console.error('Failed to open URL:', error);
            toast.error('Failed to open link');
        }
    };

    const loadSettings = async () => {
        try {
            const [curseforgeKey, steamKey, timeout] = await Promise.all([
                getSetting('curseforge_api_key'),
                getSetting('steam_api_key'),
                getSetting('startup_timeout')
            ]);
            if (curseforgeKey) setCurseforgeApiKey(curseforgeKey);
            if (steamKey) setSteamApiKey(steamKey);
            if (timeout) setStartupTimeout(timeout);

            // Load update settings
            setUpdateSettingsState(getUpdateSettings());
            setUpdateHistoryState(getUpdateHistory());
        } catch (error) {
            console.error('Failed to load settings:', error);
            toast.error('Failed to load settings');
        } finally {
            setIsLoading(false);
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
            setUpdateCheckResult(t('settings.updatesTab.checkFailed', 'Failed to check for updates'));
            toast.error(t('settings.updatesTab.checkFailed', 'Failed to check for updates'));
        } finally {
            setIsCheckingUpdates(false);
        }
    };

    const handleUpdateIntervalChange = (interval: UpdateSettings['checkInterval']) => {
        setUpdateSettings({ checkInterval: interval });
        // Update local state directly for immediate UI feedback
        setUpdateSettingsState(prev => prev ? { ...prev, checkInterval: interval } : getUpdateSettings());

        // Notify UpdateChecker to restart interval
        window.dispatchEvent(new Event('update-settings-changed'));

        toast.success(t('settings.updatesTab.intervalSet', { defaultValue: 'Update interval set to {{interval}}', interval: interval === 'never' ? t('settings.updatesTab.manualOnly', 'Manual Only') : interval }));
    };

    const handleClearSkipped = () => {
        clearSkippedVersions();
        toast.success(t('settings.updatesTab.skippedCleared', 'Skipped versions cleared'));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                setSetting('curseforge_api_key', curseforgeApiKey),
                setSetting('steam_api_key', steamApiKey),
                setSetting('startup_timeout', startupTimeout)
            ]);
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
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
                        {t('settings.title')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('settings.subtitle', 'Configure application and view guides')}</p>
                </div>
                {(activeTab === 'api') && (
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

            {/* Navigation Tabs */}
            <div className="flex space-x-4 border-b border-slate-700 pb-1">
                <button
                    onClick={() => setActiveTab('api')}
                    className={`px-6 py-3 rounded-t-xl font-medium transition-colors ${activeTab === 'api'
                        ? 'bg-sky-500/10 text-sky-400 border-b-2 border-sky-400'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    🔑 {t('settings.tabs.apiKeys')}
                </button>
                <button
                    onClick={() => setActiveTab('firewall')}
                    className={`px-6 py-3 rounded-t-xl font-medium transition-colors ${activeTab === 'firewall'
                        ? 'bg-red-500/10 text-red-400 border-b-2 border-red-400'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    🛡️ {t('settings.tabs.firewall')}
                </button>
                <button
                    onClick={() => setActiveTab('updates')}
                    className={`px-6 py-3 rounded-t-xl font-medium transition-colors ${activeTab === 'updates'
                        ? 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-400'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    🔄 {t('settings.tabs.updates')}
                </button>
                <button
                    onClick={() => setActiveTab('language')}
                    className={`px-6 py-3 rounded-t-xl font-medium transition-colors ${activeTab === 'language'
                        ? 'bg-cyan-500/10 text-cyan-400 border-b-2 border-cyan-400'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    🌐 {t('settings.tabs.language')}
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
                            <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/20">
                                <Key className="w-6 h-6 text-violet-400" />
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
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors shadow-lg shadow-violet-500/20 w-full justify-center"
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

                    {/* Info Section */}
                    <div className="glass-panel rounded-2xl p-6 border-dashed">
                        <h3 className="text-lg font-medium text-white mb-3">{t('settings.aboutApiKeys.title', 'About API Keys')}</h3>
                        <div className="space-y-2 text-sm text-slate-400">
                            <p>• {t('settings.aboutApiKeys.storedLocally', 'Your API keys are stored locally and encrypted on your machine.')}</p>
                            <p>• {t('settings.aboutApiKeys.neverShared', 'They are never shared with any third party, only sent directly to Steam and CurseForge API endpoints.')}</p>
                            <p>• <strong className="text-sky-400">{t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(':')[0]}</strong>: {t('settings.aboutApiKeys.steamDesc', 'Steam Web API Key: Used for checking updates to the server software').split(':')[1]}</p>
                            <p>• <strong className="text-violet-400">{t('settings.aboutApiKeys.curseforgeDesc', 'CurseForge API Key: Required for downloading and updating mods').split(':')[0]}</strong>: {t('settings.aboutApiKeys.curseforgeDesc', 'CurseForge API Key: Required for downloading and updating mods').split(':')[1]}</p>
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

                        {/* Update Interval */}
                        <div className="border-t border-slate-700/50 pt-6">
                            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-400" />
                                {t('settings.updatesTab.automaticInterval', 'Automatic Check Interval')}
                            </h3>
                            <div className="flex flex-wrap gap-2.5">
                                {(['never', '1h', '6h', '12h', '24h'] as const).map(interval => (
                                    <button
                                        key={interval}
                                        onClick={() => handleUpdateIntervalChange(interval)}
                                        className={cn(
                                            "px-5 py-2.5 rounded-xl font-medium transition-all duration-200 border",
                                            updateSettings?.checkInterval === interval
                                                ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white border-indigo-500/50 shadow-md shadow-indigo-500/20"
                                                : "bg-slate-800/50 text-slate-400 hover:bg-slate-700 border-slate-700/50 hover:text-white hover:border-slate-600"
                                        )}
                                    >
                                        {interval === 'never' ? t('settings.updatesTab.manualOnly', 'Manual Only') : t('settings.updatesTab.every', { defaultValue: 'Every {{interval}}', interval })}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Update History */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3 tracking-tight">
                                <div className="p-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                                    <History className="w-6 h-6 text-violet-400" />
                                </div>
                                Update History
                            </h2>
                            {updateHistory.length > 0 && (
                                <button
                                    onClick={handleClearSkipped}
                                    className="text-sm px-4 py-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700/50 transition-all font-medium"
                                >
                                    {t('settings.updatesTab.clearSkipped', 'Clear Skipped Versions')}
                                </button>
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
        </div>
    );
}
