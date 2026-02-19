import { useState, useEffect } from 'react';
import { Save, Key, Lock, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Download, Clock, History, Undo2, Globe } from 'lucide-react';
import { getSetting, setSetting } from '../utils/tauri';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import DiagnosticsPanel from '../components/settings/DiagnosticsPanel';
import PortValidator from '../components/settings/PortValidator';
import PortForwardingGuide from '../components/settings/PortForwardingGuide';
import FirewallSettings from '../components/settings/FirewallSettings';
import { manualCheckForUpdates } from '../components/UpdateChecker';
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

    const [activeTab, setActiveTab] = useState<'api' | 'network' | 'firewall' | 'updates' | 'language'>('api');
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
                setUpdateCheckResult(t('settings.updatesTab.latestVersion'));
                toast.success(t('settings.updatesTab.latestVersion'));
            }
        } catch (err) {
            setUpdateCheckResult(t('settings.updatesTab.checkFailed'));
            toast.error(t('settings.updatesTab.checkFailed'));
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

        toast.success(t('settings.updatesTab.intervalSet', { interval: interval === 'never' ? t('settings.updatesTab.manualOnly') : interval }));
    };

    const handleClearSkipped = () => {
        clearSkippedVersions();
        toast.success(t('settings.updatesTab.skippedCleared'));
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

    const copyFirewallScript = () => {
        const script = `New-NetFirewallRule -DisplayName "ARK ASA Server TCP" -Direction Inbound -LocalPort 7777,7778,27015,27020 -Protocol TCP -Action Allow\nNew-NetFirewallRule -DisplayName "ARK ASA Server UDP" -Direction Inbound -LocalPort 7777,7778,27015,27020 -Protocol UDP -Action Allow`;
        navigator.clipboard.writeText(script);
        toast.success(t('settings.firewallConfig.scriptCopied'));
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
                {(activeTab === 'api' || activeTab === 'network') && (
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
                    onClick={() => setActiveTab('network')}
                    className={`px-6 py-3 rounded-t-xl font-medium transition-colors ${activeTab === 'network'
                        ? 'bg-violet-500/10 text-violet-400 border-b-2 border-violet-400'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    🌐 {t('settings.tabs.network')}
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
                                <h2 className="text-2xl font-bold text-white mb-2">{t('settings.aboutApiKeys.steamDesc').split(':')[0]}</h2>
                                <p className="text-slate-400">
                                    {t('settings.aboutApiKeys.steamDesc').split(': ')[1]}
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
                                <p className="text-sm text-slate-300 font-medium mb-3">{t('settings.curseforgeKey.needKey')}</p>
                                <button
                                    onClick={() => openUrl('https://steamcommunity.com/dev/apikey')}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-lg shadow-sky-500/20 w-full justify-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>{t('settings.curseforgeKey.getKey').replace('CurseForge', 'Steam')}</span>
                                </button>
                                <p className="text-xs text-slate-400 mt-3">
                                    {t('settings.curseforgeKey.instructions').replace('Create/Copy', 'Enter domain name → Copy')}
                                </p>
                            </div>

                            {steamApiKey && (
                                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                        <span className="text-green-400 font-medium">{t('settings.aboutApiKeys.steamDesc').split(':')[0]} configured</span>
                                    </div>
                                </div>
                            )}

                            {!steamApiKey && (
                                <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <AlertCircle className="w-5 h-5 text-slate-400" />
                                        <span className="text-slate-400 font-medium">{t('settings.aboutApiKeys.steamDesc').split(': ')[1]}</span>
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
                                <h2 className="text-2xl font-bold text-white mb-2">{t('settings.aboutApiKeys.curseforgeDesc').split(':')[0]}</h2>
                                <p className="text-slate-400">
                                    {t('settings.aboutApiKeys.curseforgeDesc').split(': ')[1]}
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
                                        placeholder={t('settings.curseforgeKey.placeholder')}
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
                                <p className="text-sm text-slate-300 font-medium mb-3">{t('settings.curseforgeKey.needKey')}</p>
                                <button
                                    onClick={() => openUrl('https://console.curseforge.com')}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors shadow-lg shadow-violet-500/20 w-full justify-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>{t('settings.curseforgeKey.getKey')}</span>
                                </button>
                                <p className="text-xs text-slate-400 mt-3">
                                    {t('settings.curseforgeKey.instructions')}
                                </p>
                            </div>

                            {!curseforgeApiKey && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <AlertCircle className="w-5 h-5 text-amber-400" />
                                        <span className="text-amber-400 font-medium">{t('settings.curseforgeKey.notSet')}</span>
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
                                                <RefreshCw className="w-4 h-4 animate-spin" /> {t('settings.curseforgeKey.verifying')}
                                            </>
                                        ) : keyStatus === 'valid' ? (
                                            <>
                                                <CheckCircle className="w-4 h-4" /> {t('settings.curseforgeKey.verified')}
                                            </>
                                        ) : keyStatus === 'invalid' ? (
                                            <>
                                                <AlertCircle className="w-4 h-4" /> {t('settings.curseforgeKey.invalid')}
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" /> {t('settings.curseforgeKey.verifyKey')}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info Section */}
                    <div className="glass-panel rounded-2xl p-6 border-dashed">
                        <h3 className="text-lg font-medium text-white mb-3">{t('settings.aboutApiKeys.title')}</h3>
                        <div className="space-y-2 text-sm text-slate-400">
                            <p>• {t('settings.aboutApiKeys.storedLocally')}</p>
                            <p>• {t('settings.aboutApiKeys.neverShared')}</p>
                            <p>• <strong className="text-sky-400">{t('settings.aboutApiKeys.steamDesc').split(':')[0]}</strong>: {t('settings.aboutApiKeys.steamDesc').split(':')[1]}</p>
                            <p>• <strong className="text-violet-400">{t('settings.aboutApiKeys.curseforgeDesc').split(':')[0]}</strong>: {t('settings.aboutApiKeys.curseforgeDesc').split(':')[1]}</p>
                            <p>• {t('settings.aboutApiKeys.revokable')}</p>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'network' ? (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                    {/* Quick Install Guide */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-sky-500/10 p-2 rounded-lg text-sky-400">🚀</span>
                            {t('settings.quickGuide.title')}
                        </h2>
                        <div className="grid md:grid-cols-4 gap-4">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">{t('settings.quickGuide.step1')}</div>
                                <p className="text-sm text-slate-300">{t('settings.quickGuide.step1Desc')}</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">{t('settings.quickGuide.step2')}</div>
                                <p className="text-sm text-slate-300">{t('settings.quickGuide.step2Desc')}</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">{t('settings.quickGuide.step3')}</div>
                                <p className="text-sm text-slate-300">{t('settings.quickGuide.step3Desc')}</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">{t('settings.quickGuide.step4')}</div>
                                <p className="text-sm text-slate-300">{t('settings.quickGuide.step4Desc')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Backend Process Settings (Timeout) */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-amber-500/10 p-2 rounded-lg text-amber-400">⏱️</span>
                            {t('settings.process.title')}
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-3">
                                    {t('settings.process.startupTimeout')}
                                </label>
                                <div className="flex items-center gap-4">
                                    <div className="relative flex-1">
                                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                        <input
                                            type="number"
                                            value={startupTimeout}
                                            onChange={(e) => setStartupTimeout(e.target.value)}
                                            min="300"
                                            max="7200"
                                            className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                                        />
                                    </div>
                                    <div className="text-slate-400 text-sm">
                                        ≈ {Math.round(parseInt(startupTimeout) / 60)} {t('common.minutes')}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-3">
                                    {t('settings.process.startupTimeoutHint')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Auto-Diagnostics */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-green-500/10 p-2 rounded-lg text-green-400">💉</span>
                            {t('settings.diagnostics.title')}
                        </h2>
                        <div className="space-y-4">
                            <p className="text-slate-400">
                                {t('settings.diagnostics.description')}
                            </p>

                            <DiagnosticsPanel />
                        </div>
                    </div>

                    {/* Firewall Configuration */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-red-500/10 p-2 rounded-lg text-red-400">🛡️</span>
                            {t('settings.firewallConfig.title')}
                        </h2>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <p className="text-slate-400 mb-4">
                                    {t('settings.firewallConfig.description')}
                                </p>
                                <table className="w-full text-left bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                                    <thead className="bg-slate-900/50">
                                        <tr>
                                            <th className="p-3 text-sm text-slate-400 font-medium">{t('settings.firewallConfig.port')}</th>
                                            <th className="p-3 text-sm text-slate-400 font-medium">{t('settings.firewallConfig.protocol')}</th>
                                            <th className="p-3 text-sm text-slate-400 font-medium">{t('settings.firewallConfig.purpose')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700">
                                        <tr>
                                            <td className="p-3 text-sky-400 font-mono">7777-7778</td>
                                            <td className="p-3 text-white text-sm">UDP</td>
                                            <td className="p-3 text-slate-400 text-sm">{t('settings.firewallConfig.gameTraffic')}</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-sky-400 font-mono">27015</td>
                                            <td className="p-3 text-white text-sm">UDP</td>
                                            <td className="p-3 text-slate-400 text-sm">{t('settings.firewallConfig.steamQuery')}</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-sky-400 font-mono">27020</td>
                                            <td className="p-3 text-white text-sm">TCP</td>
                                            <td className="p-3 text-slate-400 text-sm">{t('settings.firewallConfig.rconControl')}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 font-mono text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                                    # Copy and run as Administrator in PowerShell
                                    <br />
                                    New-NetFirewallRule -DisplayName "ARK ASA Server TCP" -Direction Inbound -LocalPort 7777,7778,27015,27020 -Protocol TCP -Action Allow
                                    <br />
                                    New-NetFirewallRule -DisplayName "ARK ASA Server UDP" -Direction Inbound -LocalPort 7777,7778,27015,27020 -Protocol UDP -Action Allow
                                </div>
                                <button
                                    onClick={copyFirewallScript}
                                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                                >
                                    <Lock className="w-4 h-4" />
                                    {t('settings.firewallConfig.copyScript')}
                                </button>
                                <p className="text-xs text-center text-slate-500">
                                    {t('settings.firewallConfig.requiresAdmin')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Port Status Checker */}
                    <div className="glass-panel rounded-2xl p-6">
                        <PortValidator />
                    </div>

                    {/* Port Forwarding Guide */}
                    <div className="glass-panel rounded-2xl p-6">
                        <PortForwardingGuide />
                    </div>
                </div>
            ) : activeTab === 'firewall' ? (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <FirewallSettings />
                </div>
            ) : activeTab === 'updates' ? (
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                    {/* Check for Updates */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-emerald-500/10 rounded-xl">
                                <RefreshCw className="w-8 h-8 text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white">{t('settings.updatesTab.checkForUpdates')}</h2>
                                <p className="text-slate-400 mt-1">
                                    {t('settings.updatesTab.currentVersion')} <span className="text-emerald-400 font-mono">{currentVersion}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-6">
                            <button
                                onClick={handleCheckForUpdates}
                                disabled={isCheckingUpdates}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Download className={`w-5 h-5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                                {isCheckingUpdates ? t('settings.updatesTab.checking') : t('settings.updatesTab.checkNow')}
                            </button>

                            {updateCheckResult && (
                                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${updateCheckResult.includes('available')
                                    ? 'bg-sky-500/10 text-sky-400'
                                    : updateCheckResult.includes('latest')
                                        ? 'bg-green-500/10 text-green-400'
                                        : 'bg-red-500/10 text-red-400'
                                    }`}>
                                    {updateCheckResult.includes('available') ? (
                                        <Download className="w-4 h-4" />
                                    ) : updateCheckResult.includes('latest') ? (
                                        <CheckCircle className="w-4 h-4" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4" />
                                    )}
                                    {updateCheckResult}
                                </div>
                            )}
                        </div>

                        {/* Update Interval */}
                        <div className="border-t border-slate-700 pt-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-slate-400" />
                                {t('settings.updatesTab.automaticInterval')}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {(['never', '1h', '6h', '12h', '24h'] as const).map(interval => (
                                    <button
                                        key={interval}
                                        onClick={() => handleUpdateIntervalChange(interval)}
                                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${updateSettings?.checkInterval === interval
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                            }`}
                                    >
                                        {interval === 'never' ? t('settings.updatesTab.manualOnly') : t('settings.updatesTab.every', { interval })}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Update History */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <span className="bg-violet-500/10 p-2 rounded-lg">
                                    <History className="w-6 h-6 text-violet-400" />
                                </span>
                                Update History
                            </h2>
                            {updateHistory.length > 0 && (
                                <button
                                    onClick={handleClearSkipped}
                                    className="text-sm text-slate-400 hover:text-white transition-colors"
                                >
                                    {t('settings.updatesTab.clearSkipped')}
                                </button>
                            )}
                        </div>

                        {updateHistory.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>{t('settings.updatesTab.noHistory')}</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                {updateHistory.slice(0, 10).map(entry => (
                                    <div
                                        key={entry.id}
                                        className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 border border-slate-700"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${entry.action === 'installed'
                                                ? 'bg-green-500/10 text-green-400'
                                                : entry.action === 'skipped'
                                                    ? 'bg-yellow-500/10 text-yellow-400'
                                                    : 'bg-red-500/10 text-red-400'
                                                }`}>
                                                {entry.action === 'installed' ? (
                                                    <CheckCircle className="w-4 h-4" />
                                                ) : entry.action === 'skipped' ? (
                                                    <Clock className="w-4 h-4" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">v{entry.version}</div>
                                                <div className="text-xs text-slate-500 capitalize">{entry.action}</div>
                                            </div>
                                        </div>
                                        <div className="text-sm text-slate-400">
                                            {formatRelativeTime(entry.date)}
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
                            {t('settings.updatesTab.previousVersions')}
                        </h2>
                        <p className="text-slate-400 mb-4">
                            {t('settings.updatesTab.previousDesc')}
                        </p>
                        <button
                            onClick={() => openUrl(getReleasesUrl())}
                            className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl transition-colors shadow-lg shadow-orange-500/20"
                        >
                            <ExternalLink className="w-5 h-5" />
                            {t('settings.updatesTab.viewReleases')}
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
                                        toast.success(t('settings.language.languageChanged', { language: lang.nativeName }));
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
