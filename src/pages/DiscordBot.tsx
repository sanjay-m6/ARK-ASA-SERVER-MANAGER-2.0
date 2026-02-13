import { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare, Bell, Send, CheckCircle, Loader2, AlertTriangle,
    Users, RefreshCw, Shield, Webhook, Bot, Server as ServerIcon,
    Activity, Zap, Clock, Radio, Eye, PlayCircle, StopCircle, Settings2,
    TrendingUp, History, Wifi, WifiOff, Link, MessageCircle, List, Plus
} from 'lucide-react';

import { cn } from '../utils/helpers';
import {
    getSetting, setSetting,
    getDiscordBridgeConfig, saveDiscordBridgeConfig,
    startDiscordBridge, stopDiscordBridge, testDiscordConnection,
    type DiscordBridgeConfig,
    getClusters, createCluster
} from '../utils/tauri';
import { useServerStore } from '../stores/serverStore';
import toast from 'react-hot-toast';

interface AlertConfig {
    key: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    enabled: boolean;
    category: 'server' | 'player' | 'system';
}

interface RecentNotification {
    id: string;
    type: string;
    message: string;
    timestamp: Date;
    server?: string;
}

const DEFAULT_ALERTS: AlertConfig[] = [
    { key: 'serverStart', label: 'Server Start', description: 'Server comes online', icon: PlayCircle, enabled: true, category: 'server' },
    { key: 'serverStop', label: 'Server Stop', description: 'Server goes offline', icon: StopCircle, enabled: true, category: 'server' },
    { key: 'serverCrash', label: 'Server Crash', description: 'Unexpected shutdown', icon: AlertTriangle, enabled: true, category: 'server' },
    { key: 'serverUpdate', label: 'Server Update', description: 'Files updated via SteamCMD', icon: RefreshCw, enabled: true, category: 'server' },
    { key: 'playerJoin', label: 'Player Join', description: 'Player connects', icon: Users, enabled: false, category: 'player' },
    { key: 'playerLeave', label: 'Player Leave', description: 'Player disconnects', icon: Users, enabled: false, category: 'player' },
    { key: 'backupComplete', label: 'Backup Complete', description: 'Backup finished', icon: Shield, enabled: true, category: 'system' },
    { key: 'scheduledTask', label: 'Scheduled Task', description: 'Task executed', icon: Clock, enabled: false, category: 'system' },
];

export default function DiscordBot() {
    const { servers } = useServerStore();
    const [webhookUrl, setWebhookUrl] = useState('');
    const [savedWebhookUrl, setSavedWebhookUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alerts, setAlerts] = useState<AlertConfig[]>(DEFAULT_ALERTS);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
    const [recentNotifications, setRecentNotifications] = useState<RecentNotification[]>([]);
    const [liveMode, setLiveMode] = useState(true);
    const [activeSection, setActiveSection] = useState<'webhook' | 'bot' | 'alerts' | 'activity'>('webhook');
    const [bridgeConfig, setBridgeConfig] = useState<DiscordBridgeConfig>({
        cluster_id: 1,
        enabled: false,
        bot_token: '',
        guild_id: '',
        channel_id: '',
        game_to_discord: true,
        discord_to_game: true,
        server_list_enabled: false,
        server_list_channel_id: '',
        server_list_message_id: '',
        player_list_enabled: false,
        player_list_channel_id: '',
        player_list_message_id: '',
        show_tribe_names: true,
        show_playtime: true
    });
    const [isBridgeTesting, setIsBridgeTesting] = useState(false);

    const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
    const [isCreatingCluster, setIsCreatingCluster] = useState(false);
    const autoSave = true;

    // Real-time connection check
    const checkConnection = useCallback(async () => {
        if (!webhookUrl) {
            setConnectionStatus('disconnected');
            return;
        }

        setConnectionStatus('checking');
        try {
            // Discord webhooks return 200 on GET with webhook info
            const response = await fetch(webhookUrl);
            if (response.ok) {
                setConnectionStatus('connected');
            } else {
                setConnectionStatus('disconnected');
            }
        } catch {
            setConnectionStatus('disconnected');
        }
    }, [webhookUrl]);

    useEffect(() => {
        loadSettings();
    }, []);

    // Real-time connection monitoring
    useEffect(() => {
        if (liveMode && savedWebhookUrl) {
            checkConnection();
            const interval = setInterval(checkConnection, 30000); // Check every 30s
            return () => clearInterval(interval);
        }
    }, [liveMode, savedWebhookUrl, checkConnection]);

    // Auto-save when alerts change
    useEffect(() => {
        if (autoSave && !isLoading && savedWebhookUrl) {
            const timeout = setTimeout(() => {
                saveAlertConfig();
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [alerts, autoSave, isLoading, savedWebhookUrl]);

    const loadSettings = async () => {
        try {
            const [webhook, alertConfig, notifications, fetchedClusters] = await Promise.all([
                getSetting('discord_webhook_url'),
                getSetting('discord_alerts_config'),
                getSetting('discord_recent_notifications'),
                getClusters()
            ]);

            if (webhook) {
                setWebhookUrl(webhook);
                setSavedWebhookUrl(webhook);
            }



            if (fetchedClusters.length > 0) {
                const firstClusterId = fetchedClusters[0].id;
                setSelectedClusterId(firstClusterId);

                const bridge = await getDiscordBridgeConfig(firstClusterId);
                if (bridge) {
                    setBridgeConfig(bridge);
                } else {
                    setBridgeConfig(prev => ({ ...prev, cluster_id: firstClusterId }));
                }
            }

            if (alertConfig) {
                try {
                    const parsed = JSON.parse(alertConfig);
                    setAlerts(prev => prev.map(alert => ({
                        ...alert,
                        enabled: parsed[alert.key] ?? alert.enabled
                    })));
                } catch (e) {
                    console.error('Failed to parse alert config:', e);
                }
            }

            if (notifications) {
                try {
                    const parsed = JSON.parse(notifications);
                    setRecentNotifications(parsed.map((n: RecentNotification) => ({
                        ...n,
                        timestamp: new Date(n.timestamp)
                    })));
                } catch (e) {
                    console.error('Failed to parse notifications:', e);
                }
            }
        } catch (error) {
            console.error('Failed to load Discord settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateDefaultCluster = async () => {
        setIsCreatingCluster(true);
        try {
            const newCluster = await createCluster("Main Cluster", []);

            setSelectedClusterId(newCluster.id);
            setBridgeConfig(prev => ({ ...prev, cluster_id: newCluster.id }));
            toast.success('Default cluster created');
        } catch (error) {
            toast.error('Failed to create default cluster');
            console.error(error);
        } finally {
            setIsCreatingCluster(false);
        }
    };

    const saveAlertConfig = async () => {
        try {
            const alertConfig = alerts.reduce((acc, alert) => {
                acc[alert.key] = alert.enabled;
                return acc;
            }, {} as Record<string, boolean>);
            await setSetting('discord_alerts_config', JSON.stringify(alertConfig));
        } catch (error) {
            console.error('Failed to save alert config:', error);
        }
    };

    const saveWebhook = async () => {
        const trimmed = webhookUrl.trim();
        if (!trimmed) {
            toast.error('Please enter a webhook URL');
            return;
        }
        setIsSaving(true);
        try {
            await setSetting('discord_webhook_url', trimmed);
            // Read back from backend to confirm persistence
            const persisted = await getSetting('discord_webhook_url');
            if (persisted === trimmed) {
                setWebhookUrl(trimmed);
                setSavedWebhookUrl(trimmed);
                await checkConnection();
                toast.success('Webhook saved!');
            } else {
                toast.error('Webhook failed to persist — please try again');
            }
        } catch (error) {
            toast.error('Failed to save webhook');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleAlert = (key: string) => {
        setAlerts(prev => prev.map(alert =>
            alert.key === key ? { ...alert, enabled: !alert.enabled } : alert
        ));
    };

    const enableAllAlerts = () => {
        setAlerts(prev => prev.map(alert => ({ ...alert, enabled: true })));
        toast.success('All notifications enabled');
    };

    const disableAllAlerts = () => {
        setAlerts(prev => prev.map(alert => ({ ...alert, enabled: false })));
        toast.success('All notifications disabled');
    };

    const testWebhook = async () => {
        if (!webhookUrl) {
            toast.error('Enter a webhook URL first');
            return;
        }

        if (!webhookUrl.includes('discord.com/api/webhooks/')) {
            toast.error('Invalid Discord webhook URL');
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '🟢 Connection Established',
                        description: 'Your Discord webhook is working perfectly!',
                        color: 0x00d4aa,
                        timestamp: new Date().toISOString(),
                        footer: { text: 'ASA Server Manager', icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png' },
                        fields: [
                            { name: '📊 Status', value: 'Active', inline: true },
                            { name: '🔔 Alerts', value: `${alerts.filter(a => a.enabled).length} enabled`, inline: true },
                            { name: '🖥️ Servers', value: `${servers.length} configured`, inline: true }
                        ],
                        thumbnail: { url: 'https://cdn.discordapp.com/embed/avatars/0.png' }
                    }]
                })
            });

            if (response.ok) {
                setTestResult('success');
                setConnectionStatus('connected');

                // Add to recent notifications
                const newNotification: RecentNotification = {
                    id: Date.now().toString(),
                    type: 'test',
                    message: 'Test notification sent successfully',
                    timestamp: new Date()
                };
                setRecentNotifications(prev => [newNotification, ...prev].slice(0, 10));

                toast.success('Test message sent!');
            } else {
                setTestResult('error');
                setConnectionStatus('disconnected');
                toast.error('Webhook failed');
            }
        } catch (error) {
            setTestResult('error');
            setConnectionStatus('disconnected');
            toast.error('Connection failed');
        } finally {
            setIsTesting(false);
        }
    };

    const sendQuickNotification = async (type: string, message: string) => {
        if (!savedWebhookUrl) {
            toast.error('Configure webhook first');
            return;
        }

        try {
            await fetch(savedWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: `📢 ${type}`,
                        description: message,
                        color: 0x5865F2,
                        timestamp: new Date().toISOString(),
                        footer: { text: 'ASA Server Manager' }
                    }]
                })
            });
            toast.success('Notification sent!');
        } catch {
            toast.error('Failed to send');
        }
    };

    const saveBridgeConfig = async () => {
        try {
            setIsSaving(true);
            await saveDiscordBridgeConfig(bridgeConfig);
            toast.success('Bot configuration saved');
        } catch (error) {
            toast.error('Failed to save config');
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleBridge = async () => {
        try {
            if (bridgeConfig.enabled) {
                await stopDiscordBridge();
                setBridgeConfig(prev => ({ ...prev, enabled: false }));
                await saveDiscordBridgeConfig({ ...bridgeConfig, enabled: false });
                toast.success('Discord Bridge Stopped');
            } else {
                await startDiscordBridge();
                setBridgeConfig(prev => ({ ...prev, enabled: true }));
                await saveDiscordBridgeConfig({ ...bridgeConfig, enabled: true });
                toast.success('Discord Bridge Started');
            }
        } catch (error) {
            toast.error('Failed to toggle bridge');
        }
    };

    const testBridge = async () => {
        if (!bridgeConfig.bot_token || !bridgeConfig.channel_id) {
            toast.error('Token and Chat Channel ID required');
            return;
        }
        setIsBridgeTesting(true);
        try {
            const result = await testDiscordConnection(bridgeConfig.bot_token, bridgeConfig.channel_id);
            toast.success(result);
        } catch (error) {
            toast.error(typeof error === 'string' ? error : 'Connection Failed');
        } finally {
            setIsBridgeTesting(false);
        }
    };

    const hasUnsavedChanges = webhookUrl !== savedWebhookUrl;
    const enabledCount = alerts.filter(a => a.enabled).length;
    const runningServers = servers.filter(s => s.status === 'running').length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
                    <p className="text-slate-400">Loading Discord integration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header with Live Status */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                        <Bot className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Discord Integration</h1>
                        <p className="text-slate-400">Real-time server notifications</p>
                    </div>
                </div>

                {/* Live Status Indicators */}
                <div className="flex items-center gap-4">
                    {/* Connection Status */}
                    <div className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full border",
                        connectionStatus === 'connected' && "bg-green-500/10 border-green-500/30 text-green-400",
                        connectionStatus === 'disconnected' && "bg-red-500/10 border-red-500/30 text-red-400",
                        connectionStatus === 'checking' && "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                    )}>
                        {connectionStatus === 'connected' && <Wifi className="w-4 h-4" />}
                        {connectionStatus === 'disconnected' && <WifiOff className="w-4 h-4" />}
                        {connectionStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span className="text-sm font-medium capitalize">{connectionStatus}</span>
                    </div>

                    {/* Live Mode Toggle */}
                    <button
                        onClick={() => setLiveMode(!liveMode)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full border transition-all",
                            liveMode
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-slate-800 border-slate-700 text-slate-400"
                        )}
                    >
                        <Radio className={cn("w-4 h-4", liveMode && "animate-pulse")} />
                        <span className="text-sm font-medium">Live</span>
                    </button>
                </div>
            </div>

            {/* Quick Stats Bar */}
            <div className="grid grid-cols-4 gap-4">
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-indigo-500">
                    <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-indigo-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{enabledCount}</div>
                            <div className="text-xs text-slate-500">Active Alerts</div>
                        </div>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-green-500">
                    <div className="flex items-center gap-3">
                        <ServerIcon className="w-5 h-5 text-green-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{runningServers}</div>
                            <div className="text-xs text-slate-500">Servers Online</div>
                        </div>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-purple-500">
                    <div className="flex items-center gap-3">
                        <History className="w-5 h-5 text-purple-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{recentNotifications.length}</div>
                            <div className="text-xs text-slate-500">Recent Sends</div>
                        </div>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4 border-l-4 border-l-cyan-500">
                    <div className="flex items-center gap-3">
                        <Activity className="w-5 h-5 text-cyan-400" />
                        <div>
                            <div className="text-2xl font-bold text-white">{servers.length}</div>
                            <div className="text-xs text-slate-500">Total Servers</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section Tabs */}
            <div className="flex gap-2 p-1 bg-slate-900/50 rounded-lg w-fit">
                {[
                    { key: 'webhook', label: 'Webhook', icon: Webhook },
                    { key: 'bot', label: 'Bot Integration', icon: Bot },
                    { key: 'alerts', label: 'Alerts', icon: Bell },
                    { key: 'activity', label: 'Activity', icon: Activity }
                ].map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveSection(tab.key as typeof activeSection)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                activeSection === tab.key
                                    ? "bg-indigo-500/20 text-indigo-400"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Setup Section (Webhook) */}
            {activeSection === 'webhook' && (
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Webhook Configuration */}
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                                <Webhook className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Webhook Setup</h2>
                                <p className="text-sm text-slate-500">Connect your Discord channel</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <input
                                type="url"
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://discord.com/api/webhooks/..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                            />

                            <div className="flex gap-2">
                                <button
                                    onClick={saveWebhook}
                                    disabled={isSaving || !hasUnsavedChanges}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50 font-medium"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    {hasUnsavedChanges ? 'Save Webhook' : 'Saved'}
                                </button>
                                <button
                                    onClick={testWebhook}
                                    disabled={isTesting || !webhookUrl}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors font-medium",
                                        testResult === 'success' ? "bg-green-500/20 text-green-400" :
                                            testResult === 'error' ? "bg-red-500/20 text-red-400" :
                                                "bg-slate-700 hover:bg-slate-600 text-white",
                                        "disabled:opacity-50"
                                    )}
                                >
                                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Test
                                </button>
                            </div>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 text-sm text-slate-400">
                            <p className="font-medium text-slate-300 mb-2">📖 Quick Setup:</p>
                            <ol className="list-decimal list-inside space-y-1 text-xs">
                                <li>Open Discord → Server Settings → Integrations</li>
                                <li>Create a Webhook → Copy URL</li>
                                <li>Paste above and click Save</li>
                            </ol>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                                <Zap className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Quick Actions</h2>
                                <p className="text-sm text-slate-500">Send instant notifications</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => sendQuickNotification('Announcement', 'Server maintenance scheduled')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <MessageSquare className="w-5 h-5 text-amber-400 mb-2" />
                                <div className="font-medium text-white text-sm">Announcement</div>
                                <div className="text-xs text-slate-500">Send custom message</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Status', `${runningServers} server(s) currently online`)}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <TrendingUp className="w-5 h-5 text-green-400 mb-2" />
                                <div className="font-medium text-white text-sm">Status Update</div>
                                <div className="text-xs text-slate-500">Current server status</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Restart', 'Server restart in progress...')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <RefreshCw className="w-5 h-5 text-blue-400 mb-2" />
                                <div className="font-medium text-white text-sm">Restart Notice</div>
                                <div className="text-xs text-slate-500">Notify about restart</div>
                            </button>
                            <button
                                onClick={() => sendQuickNotification('Maintenance', 'Scheduled maintenance beginning')}
                                disabled={!savedWebhookUrl}
                                className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 transition-all disabled:opacity-50 text-left"
                            >
                                <Settings2 className="w-5 h-5 text-purple-400 mb-2" />
                                <div className="font-medium text-white text-sm">Maintenance</div>
                                <div className="text-xs text-slate-500">Maintenance alert</div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bot Configuration Section */}
            {
                activeSection === 'bot' && (
                    <div className="grid lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
                        {!selectedClusterId ? (
                            <div className="lg:col-span-2 glass-panel rounded-2xl p-12 text-center space-y-6 flex flex-col items-center justify-center">
                                <div className="p-4 bg-amber-500/10 rounded-full border border-amber-500/20">
                                    <AlertTriangle className="w-10 h-10 text-amber-500" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-white">Cluster Required</h3>
                                    <p className="text-slate-400 max-w-md mx-auto">
                                        The Discord Bot integration requires a server cluster to function.
                                        Please create a cluster to continue.
                                    </p>
                                </div>
                                <button
                                    onClick={handleCreateDefaultCluster}
                                    disabled={isCreatingCluster}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCreatingCluster ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                    Create Default Cluster
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-6">
                                    {/* Status Card */}
                                    <div className="glass-panel rounded-2xl p-6">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("p-2.5 rounded-xl", bridgeConfig.enabled ? "bg-green-500/10" : "bg-slate-700/50")}>
                                                    <Bot className={cn("w-6 h-6", bridgeConfig.enabled ? "text-green-400" : "text-slate-400")} />
                                                </div>
                                                <div>
                                                    <h2 className="text-lg font-bold text-white">Bridge Status</h2>
                                                    <p className="text-sm text-slate-500">
                                                        {bridgeConfig.enabled ? "Service is active" : "Service is stopped"}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={toggleBridge}
                                                className={cn(
                                                    "w-12 h-7 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900",
                                                    bridgeConfig.enabled ? "bg-green-500 focus:ring-green-500" : "bg-slate-700 focus:ring-slate-500"
                                                )}
                                            >
                                                <div className={cn(
                                                    "absolute w-5 h-5 bg-white rounded-full top-1 transition-transform shadow-sm",
                                                    bridgeConfig.enabled ? "translate-x-6" : "translate-x-1"
                                                )} />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Bot Token</label>
                                                <input
                                                    type="password"
                                                    value={bridgeConfig.bot_token}
                                                    onChange={e => setBridgeConfig(c => ({ ...c, bot_token: e.target.value }))}
                                                    placeholder="MTE..."
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Guild ID</label>
                                                <input
                                                    type="text"
                                                    value={bridgeConfig.guild_id}
                                                    onChange={e => setBridgeConfig(c => ({ ...c, guild_id: e.target.value }))}
                                                    placeholder="Server ID"
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                                />
                                            </div>

                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    onClick={saveBridgeConfig}
                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 font-medium transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle className="w-4 h-4" /> Save Config
                                                </button>
                                                <button
                                                    onClick={testBridge}
                                                    disabled={isBridgeTesting}
                                                    className="px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {isBridgeTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />} Test
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Features Toggles */}
                                    <div className="glass-panel rounded-2xl p-6">
                                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                            <Settings2 className="w-4 h-4 text-indigo-400" />
                                            Features
                                        </h3>
                                        <div className="space-y-3">
                                            {[
                                                { label: 'Game to Discord', sub: 'Forward in-game chat to Discord', key: 'game_to_discord' },
                                                { label: 'Discord to Game', sub: 'Forward Discord messages to game', key: 'discord_to_game' },
                                                { label: 'Show Tribe Names', sub: 'Include tribe tag in headers', key: 'show_tribe_names' },
                                                { label: 'Show Playtime', sub: 'Display playtime stats in lists', key: 'show_playtime' },
                                            ].map(opt => (
                                                <div key={opt.key} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                                    <div>
                                                        <div className="text-sm font-medium text-white">{opt.label}</div>
                                                        <div className="text-xs text-slate-500">{opt.sub}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => setBridgeConfig(c => ({ ...c, [opt.key]: !(c as any)[opt.key] }))}
                                                        className={cn(
                                                            "w-10 h-6 rounded-full transition-colors relative",
                                                            (bridgeConfig as any)[opt.key] ? "bg-indigo-500" : "bg-slate-700"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "absolute w-4 h-4 bg-white rounded-full top-1 transition-transform",
                                                            (bridgeConfig as any)[opt.key] ? "translate-x-5" : "translate-x-1"
                                                        )} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Channel Configuration */}
                                    <div className="glass-panel rounded-2xl p-6">
                                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                            <MessageCircle className="w-4 h-4 text-pink-400" />
                                            Channel Configuration
                                        </h3>

                                        <div className="space-y-5">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Chat Channel ID</label>
                                                <input
                                                    type="text"
                                                    value={bridgeConfig.channel_id}
                                                    onChange={e => setBridgeConfig(c => ({ ...c, channel_id: e.target.value }))}
                                                    placeholder="Primary chat channel"
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500 font-mono text-sm"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">Main channel for cross-server chat relay</p>
                                            </div>

                                            <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <List className="w-4 h-4 text-cyan-400" />
                                                        <span className="text-sm font-medium text-white">Live Status Lists</span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-xs text-slate-400">Server List Channel</label>
                                                        <button
                                                            onClick={() => setBridgeConfig(c => ({ ...c, server_list_enabled: !c.server_list_enabled }))}
                                                            className={cn("text-xs font-medium", bridgeConfig.server_list_enabled ? "text-green-400" : "text-slate-500")}
                                                        >
                                                            {bridgeConfig.server_list_enabled ? "Enabled" : "Disabled"}
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={bridgeConfig.server_list_channel_id}
                                                        onChange={e => setBridgeConfig(c => ({ ...c, server_list_channel_id: e.target.value }))}
                                                        disabled={!bridgeConfig.server_list_enabled}
                                                        placeholder="Channel ID for Server Status"
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm disabled:opacity-50"
                                                    />
                                                </div>

                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-xs text-slate-400">Player List Channel</label>
                                                        <button
                                                            onClick={() => setBridgeConfig(c => ({ ...c, player_list_enabled: !c.player_list_enabled }))}
                                                            className={cn("text-xs font-medium", bridgeConfig.player_list_enabled ? "text-green-400" : "text-slate-500")}
                                                        >
                                                            {bridgeConfig.player_list_enabled ? "Enabled" : "Disabled"}
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={bridgeConfig.player_list_channel_id}
                                                        onChange={e => setBridgeConfig(c => ({ ...c, player_list_channel_id: e.target.value }))}
                                                        disabled={!bridgeConfig.player_list_enabled}
                                                        placeholder="Channel ID for Active Players"
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm disabled:opacity-50"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
                                        <strong>Note:</strong> ensure the Bot has 'View Channels', 'Send Messages', and 'Manage Messages' permissions in the configured channels.
                                    </div>
                                </div>

                            </>
                        )}
                    </div>
                )
            }

            {/* Alerts Section */}
            {
                activeSection === 'alerts' && (
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/10 rounded-xl">
                                    <Bell className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Notification Settings</h2>
                                    <p className="text-sm text-slate-500">{enabledCount}/{alerts.length} alerts active</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={enableAllAlerts}
                                    className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors"
                                >
                                    Enable All
                                </button>
                                <button
                                    onClick={disableAllAlerts}
                                    className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                                >
                                    Disable All
                                </button>
                            </div>
                        </div>

                        {/* Grouped Alerts */}
                        {(['server', 'player', 'system'] as const).map(category => (
                            <div key={category} className="space-y-2">
                                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                                    {category === 'server' && '🖥️ Server Events'}
                                    {category === 'player' && '👥 Player Events'}
                                    {category === 'system' && '⚙️ System Events'}
                                </h3>
                                <div className="grid sm:grid-cols-2 gap-2">
                                    {alerts.filter(a => a.category === category).map((alert) => {
                                        const Icon = alert.icon;
                                        return (
                                            <div
                                                key={alert.key}
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                                                    alert.enabled
                                                        ? "bg-indigo-500/10 border-indigo-500/30"
                                                        : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
                                                )}
                                                onClick={() => toggleAlert(alert.key)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon className={cn("w-4 h-4", alert.enabled ? "text-indigo-400" : "text-slate-500")} />
                                                    <div>
                                                        <div className={cn("font-medium text-sm", alert.enabled ? "text-white" : "text-slate-400")}>
                                                            {alert.label}
                                                        </div>
                                                        <div className="text-xs text-slate-500">{alert.description}</div>
                                                    </div>
                                                </div>
                                                <div className={cn(
                                                    "w-10 h-6 rounded-full transition-colors relative",
                                                    alert.enabled ? "bg-indigo-500" : "bg-slate-700"
                                                )}>
                                                    <div className={cn(
                                                        "absolute w-4 h-4 bg-white rounded-full top-1 transition-transform",
                                                        alert.enabled ? "translate-x-5" : "translate-x-1"
                                                    )} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <Eye className="w-4 h-4" />
                                Auto-save enabled
                            </div>
                            <div className="text-xs text-slate-500">
                                Changes save automatically
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Activity Section */}
            {
                activeSection === 'activity' && (
                    <div className="glass-panel rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-500/10 rounded-xl">
                                <History className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Recent Activity</h2>
                                <p className="text-sm text-slate-500">Last 10 notifications sent</p>
                            </div>
                        </div>

                        {recentNotifications.length === 0 ? (
                            <div className="text-center py-12">
                                <History className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-400">No recent notifications</p>
                                <p className="text-sm text-slate-500">Notifications will appear here</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {recentNotifications.map(notification => (
                                    <div
                                        key={notification.id}
                                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                                <Send className="w-4 h-4 text-indigo-400" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-white text-sm">{notification.type}</div>
                                                <div className="text-xs text-slate-500">{notification.message}</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {notification.timestamp.toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            }
        </div>
    )
}

