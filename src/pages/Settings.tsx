import { useState, useEffect } from 'react';
import { Save, Key, Lock, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Download, Clock, History, Undo2 } from 'lucide-react';
import { getSetting, setSetting } from '../utils/tauri';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';
import DiagnosticsPanel from '../components/settings/DiagnosticsPanel';
import PortValidator from '../components/settings/PortValidator';
import PortForwardingGuide from '../components/settings/PortForwardingGuide';
import { manualCheckForUpdates, getCurrentVersion } from '../components/UpdateChecker';
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

    const [activeTab, setActiveTab] = useState<'api' | 'network' | 'updates'>('api');

    // Update system state
    const [updateSettings, setUpdateSettingsState] = useState<UpdateSettings | null>(null);
    const [updateHistory, setUpdateHistoryState] = useState<UpdateHistoryEntry[]>([]);
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    const [updateCheckResult, setUpdateCheckResult] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
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
            const [curseforgeKey, steamKey] = await Promise.all([
                getSetting('curseforge_api_key'),
                getSetting('steam_api_key')
            ]);
            if (curseforgeKey) setCurseforgeApiKey(curseforgeKey);
            if (steamKey) setSteamApiKey(steamKey);

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
                setUpdateCheckResult('You are on the latest version!');
                toast.success('You are on the latest version!');
            }
        } catch (err) {
            setUpdateCheckResult('Failed to check for updates');
            toast.error('Failed to check for updates');
        } finally {
            setIsCheckingUpdates(false);
        }
    };

    const handleUpdateIntervalChange = (interval: UpdateSettings['checkInterval']) => {
        setUpdateSettings({ checkInterval: interval });
        // Update local state directly for immediate UI feedback
        setUpdateSettingsState(prev => prev ? { ...prev, checkInterval: interval } : getUpdateSettings());
        toast.success(`Update check interval set to ${interval === 'never' ? 'manual only' : interval}`);
    };

    const handleClearSkipped = () => {
        clearSkippedVersions();
        toast.success('Skipped versions cleared');
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                setSetting('curseforge_api_key', curseforgeApiKey),
                setSetting('steam_api_key', steamApiKey)
            ]);
            toast.success('Settings saved successfully!');
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const copyFirewallScript = () => {
        const script = `New-NetFirewallRule -DisplayName "ARK ASA Server TCP" -Direction Inbound -LocalPort 7777,7778,27015,27020 -Protocol TCP -Action Allow\nNew-NetFirewallRule -DisplayName "ARK ASA Server UDP" -Direction Inbound -LocalPort 7777,7778,27015,27020 -Protocol UDP -Action Allow`;
        navigator.clipboard.writeText(script);
        toast.success('PowerShell script copied to clipboard!');
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
                        Settings
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Configure application and view guides</p>
                </div>
                {activeTab === 'api' && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center space-x-2 px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition-colors shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className={`w-5 h-5 ${isSaving ? 'animate-spin' : ''}`} />
                        <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
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
                    🔑 API Keys
                </button>
                <button
                    onClick={() => setActiveTab('network')}
                    className={`px-6 py-3 rounded-t-xl font-medium transition-colors ${activeTab === 'network'
                        ? 'bg-violet-500/10 text-violet-400 border-b-2 border-violet-400'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    🌐 Network & Guides
                </button>
                <button
                    onClick={() => setActiveTab('updates')}
                    className={`px-6 py-3 rounded-t-xl font-medium transition-colors ${activeTab === 'updates'
                        ? 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-400'
                        : 'text-slate-400 hover:text-white'
                        }`}
                >
                    🔄 Updates
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
                                <h2 className="text-2xl font-bold text-white mb-2">Steam Web API Key</h2>
                                <p className="text-slate-400">
                                    Optional - enables Steam Workshop integration features.
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
                                        type={showSteamKey ? 'text' : 'password'}
                                        value={steamApiKey}
                                        onChange={(e) => setSteamApiKey(e.target.value)}
                                        placeholder="Enter your Steam Web API key (optional)"
                                        className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSteamKey(!showSteamKey)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-sm"
                                    >
                                        {showSteamKey ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4">
                                <p className="text-sm text-slate-300 font-medium mb-3">Need an API key?</p>
                                <button
                                    onClick={() => openUrl('https://steamcommunity.com/dev/apikey')}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-lg shadow-sky-500/20 w-full justify-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Get Steam API Key</span>
                                </button>
                                <p className="text-xs text-slate-400 mt-3">
                                    Sign in with Steam → Enter domain name → Copy key
                                </p>
                            </div>

                            {steamApiKey && (
                                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                        <span className="text-green-400 font-medium">Steam API Key configured</span>
                                    </div>
                                </div>
                            )}

                            {!steamApiKey && (
                                <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <AlertCircle className="w-5 h-5 text-slate-400" />
                                        <span className="text-slate-400 font-medium">Optional - not required for ASA</span>
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
                                <h2 className="text-2xl font-bold text-white mb-2">CurseForge API Key</h2>
                                <p className="text-slate-400">
                                    Required for searching and installing ARK: Survival Ascended (ASA) mods from CurseForge.
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
                                        onChange={(e) => setCurseforgeApiKey(e.target.value)}
                                        placeholder="Enter your CurseForge API key"
                                        className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurseforgeKey(!showCurseforgeKey)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors text-sm"
                                    >
                                        {showCurseforgeKey ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4">
                                <p className="text-sm text-slate-300 font-medium mb-3">Need an API key?</p>
                                <button
                                    onClick={() => openUrl('https://console.curseforge.com')}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors shadow-lg shadow-violet-500/20 w-full justify-center"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Get CurseForge API Key</span>
                                </button>
                                <p className="text-xs text-slate-400 mt-3">
                                    Sign in → Create/Copy API key → Paste above
                                </p>
                            </div>

                            {curseforgeApiKey && (
                                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                        <span className="text-green-400 font-medium">API Key configured</span>
                                    </div>
                                </div>
                            )}

                            {!curseforgeApiKey && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                                    <div className="flex items-center space-x-2">
                                        <AlertCircle className="w-5 h-5 text-amber-400" />
                                        <span className="text-amber-400 font-medium">No API key set - ASA mod search will not work</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info Section */}
                    <div className="glass-panel rounded-2xl p-6 border-dashed">
                        <h3 className="text-lg font-medium text-white mb-3">About API Keys</h3>
                        <div className="space-y-2 text-sm text-slate-400">
                            <p>• Your API keys are stored locally in the application database</p>
                            <p>• They are never sent to any third parties except their respective official APIs</p>
                            <p>• <strong className="text-sky-400">Steam API Key</strong>: Optional - enables Steam Workshop features</p>
                            <p>• <strong className="text-violet-400">CurseForge API Key</strong>: Required for ASA mod search and installation</p>
                            <p>• You can revoke or regenerate your keys anytime from their respective consoles</p>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'network' ? (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                    {/* Quick Install Guide */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-sky-500/10 p-2 rounded-lg text-sky-400">🚀</span>
                            Quick Install Guide
                        </h2>
                        <div className="grid md:grid-cols-4 gap-4">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">Step 1</div>
                                <p className="text-sm text-slate-300">Go to Dashboard and click <strong>Quick Install</strong>.</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">Step 2</div>
                                <p className="text-sm text-slate-300">Select <strong>ARK: Survival Ascended</strong> and choose an install path.</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">Step 3</div>
                                <p className="text-sm text-slate-300">Wait for SteamCMD to download the server files (approx 20GB).</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-sky-400 font-bold mb-2">Step 4</div>
                                <p className="text-sm text-slate-300">Click <strong>Start Server</strong> and wait for full initialization.</p>
                            </div>
                        </div>
                    </div>

                    {/* Auto-Diagnostics */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-green-500/10 p-2 rounded-lg text-green-400">💉</span>
                            Auto-Diagnostics
                        </h2>
                        <div className="space-y-4">
                            <p className="text-slate-400">
                                Run a comprehensive system check to verify your environment is ready for hosting.
                            </p>

                            <DiagnosticsPanel />
                        </div>
                    </div>

                    {/* Firewall Configuration */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                            <span className="bg-red-500/10 p-2 rounded-lg text-red-400">🛡️</span>
                            Firewall Configuration
                        </h2>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <p className="text-slate-400 mb-4">
                                    To allow players to connect, you must open the following ports in Windows Firewall.
                                </p>
                                <table className="w-full text-left bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                                    <thead className="bg-slate-900/50">
                                        <tr>
                                            <th className="p-3 text-sm text-slate-400 font-medium">Port</th>
                                            <th className="p-3 text-sm text-slate-400 font-medium">Protocol</th>
                                            <th className="p-3 text-sm text-slate-400 font-medium">Purpose</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700">
                                        <tr>
                                            <td className="p-3 text-sky-400 font-mono">7777-7778</td>
                                            <td className="p-3 text-white text-sm">UDP</td>
                                            <td className="p-3 text-slate-400 text-sm">Game Client Traffic</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-sky-400 font-mono">27015</td>
                                            <td className="p-3 text-white text-sm">UDP</td>
                                            <td className="p-3 text-slate-400 text-sm">Steam Browser Query</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-sky-400 font-mono">27020</td>
                                            <td className="p-3 text-white text-sm">TCP</td>
                                            <td className="p-3 text-slate-400 text-sm">RCON (Remote Control)</td>
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
                                    Copy Automation Script
                                </button>
                                <p className="text-xs text-center text-slate-500">
                                    Requires <strong>Administrator</strong> privileges to execution.
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
            ) : activeTab === 'updates' ? (
                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                    {/* Check for Updates */}
                    <div className="glass-panel rounded-2xl p-8">
                        <div className="flex items-start space-x-4 mb-6">
                            <div className="p-3 bg-emerald-500/10 rounded-xl">
                                <RefreshCw className="w-8 h-8 text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white">Check for Updates</h2>
                                <p className="text-slate-400 mt-1">
                                    Current version: <span className="text-emerald-400 font-mono">{getCurrentVersion()}</span>
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
                                {isCheckingUpdates ? 'Checking...' : 'Check Now'}
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
                                Automatic Check Interval
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
                                        {interval === 'never' ? 'Manual Only' : `Every ${interval}`}
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
                                    Clear Skipped Versions
                                </button>
                            )}
                        </div>

                        {updateHistory.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No update history yet</p>
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
                            Previous Versions
                        </h2>
                        <p className="text-slate-400 mb-4">
                            If you need to downgrade to a previous version, you can download older releases from GitHub.
                        </p>
                        <button
                            onClick={() => openUrl(getReleasesUrl())}
                            className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl transition-colors shadow-lg shadow-orange-500/20"
                        >
                            <ExternalLink className="w-5 h-5" />
                            View All Releases on GitHub
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
