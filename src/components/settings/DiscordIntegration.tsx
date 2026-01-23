import { useState, useEffect } from 'react';
import { MessageSquare, Bell, Send, CheckCircle, XCircle, Loader2, AlertTriangle, Users, Power, RefreshCw, Shield } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { getSetting, setSetting } from '../../utils/tauri';
import toast from 'react-hot-toast';

interface AlertConfig {
    key: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    enabled: boolean;
}

const DEFAULT_ALERTS: AlertConfig[] = [
    { key: 'serverStart', label: 'Server Start', description: 'When a server starts successfully', icon: Power, enabled: true },
    { key: 'serverStop', label: 'Server Stop', description: 'When a server is stopped', icon: Power, enabled: true },
    { key: 'serverCrash', label: 'Server Crash', description: 'When a server crashes unexpectedly', icon: AlertTriangle, enabled: true },
    { key: 'playerJoin', label: 'Player Join', description: 'When a player joins the server', icon: Users, enabled: false },
    { key: 'playerLeave', label: 'Player Leave', description: 'When a player leaves the server', icon: Users, enabled: false },
    { key: 'serverUpdate', label: 'Server Update', description: 'When server files are updated', icon: RefreshCw, enabled: true },
    { key: 'backupComplete', label: 'Backup Complete', description: 'When a backup completes successfully', icon: Shield, enabled: true },
];

export default function DiscordIntegration() {
    const [webhookUrl, setWebhookUrl] = useState('');
    const [savedWebhookUrl, setSavedWebhookUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alerts, setAlerts] = useState<AlertConfig[]>(DEFAULT_ALERTS);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [webhook, alertConfig] = await Promise.all([
                getSetting('discord_webhook_url'),
                getSetting('discord_alerts_config')
            ]);

            if (webhook) {
                setWebhookUrl(webhook);
                setSavedWebhookUrl(webhook);
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
        } catch (error) {
            console.error('Failed to load Discord settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const saveSettings = async () => {
        setIsSaving(true);
        try {
            await setSetting('discord_webhook_url', webhookUrl);

            const alertConfig = alerts.reduce((acc, alert) => {
                acc[alert.key] = alert.enabled;
                return acc;
            }, {} as Record<string, boolean>);
            await setSetting('discord_alerts_config', JSON.stringify(alertConfig));

            setSavedWebhookUrl(webhookUrl);
            toast.success('Discord settings saved!');
        } catch (error) {
            console.error('Failed to save Discord settings:', error);
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleAlert = (key: string) => {
        setAlerts(prev => prev.map(alert =>
            alert.key === key ? { ...alert, enabled: !alert.enabled } : alert
        ));
    };

    const testWebhook = async () => {
        if (!webhookUrl) {
            toast.error('Please enter a webhook URL first');
            return;
        }

        // Validate webhook URL format
        if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') &&
            !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
            toast.error('Invalid Discord webhook URL format');
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [{
                        title: '🎮 ASA Server Manager',
                        description: 'Webhook test successful! Your Discord integration is working.',
                        color: 0x00d4aa,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: 'ARK: Survival Ascended Server Manager'
                        },
                        fields: [
                            {
                                name: '✅ Status',
                                value: 'Connection verified',
                                inline: true
                            },
                            {
                                name: '🔔 Alerts Enabled',
                                value: `${alerts.filter(a => a.enabled).length}/${alerts.length}`,
                                inline: true
                            }
                        ]
                    }]
                })
            });

            if (response.ok) {
                setTestResult('success');
                toast.success('Test message sent successfully!');
            } else {
                setTestResult('error');
                toast.error(`Webhook failed: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            setTestResult('error');
            console.error('Webhook test failed:', error);
            toast.error('Failed to send test message');
        } finally {
            setIsTesting(false);
        }
    };

    const hasUnsavedChanges = webhookUrl !== savedWebhookUrl;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-indigo-400" />
                        Discord Webhook Integration
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                        Receive server notifications in your Discord channel
                    </p>
                </div>
                {hasUnsavedChanges && (
                    <button
                        onClick={saveSettings}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Save Changes
                    </button>
                )}
            </div>

            {/* Webhook URL */}
            <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/50 space-y-4">
                <label className="block text-sm font-medium text-slate-300">
                    Webhook URL
                </label>
                <div className="flex gap-3">
                    <input
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                    />
                    <button
                        onClick={testWebhook}
                        disabled={isTesting || !webhookUrl}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium",
                            testResult === 'success' && "bg-green-500/20 text-green-400 border border-green-500/30",
                            testResult === 'error' && "bg-red-500/20 text-red-400 border border-red-500/30",
                            !testResult && "bg-slate-700 hover:bg-slate-600 text-white",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        {isTesting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : testResult === 'success' ? (
                            <CheckCircle className="w-4 h-4" />
                        ) : testResult === 'error' ? (
                            <XCircle className="w-4 h-4" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                        {isTesting ? 'Testing...' : testResult === 'success' ? 'Success!' : testResult === 'error' ? 'Failed' : 'Test Webhook'}
                    </button>
                </div>
                <p className="text-xs text-slate-500">
                    Create a webhook in your Discord server: Server Settings → Integrations → Webhooks → New Webhook
                </p>
            </div>

            {/* Alert Types */}
            <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/50 space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="font-medium text-white flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-400" />
                        Notification Types
                    </h4>
                    <span className="text-sm text-slate-500">
                        {alerts.filter(a => a.enabled).length} of {alerts.length} enabled
                    </span>
                </div>

                <div className="grid gap-2">
                    {alerts.map((alert) => {
                        const Icon = alert.icon;
                        return (
                            <div
                                key={alert.key}
                                className={cn(
                                    "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                                    alert.enabled
                                        ? "bg-indigo-500/10 border-indigo-500/30"
                                        : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
                                )}
                                onClick={() => toggleAlert(alert.key)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg",
                                        alert.enabled ? "bg-indigo-500/20" : "bg-slate-700/50"
                                    )}>
                                        <Icon className={cn(
                                            "w-4 h-4",
                                            alert.enabled ? "text-indigo-400" : "text-slate-500"
                                        )} />
                                    </div>
                                    <div>
                                        <div className={cn(
                                            "font-medium text-sm",
                                            alert.enabled ? "text-white" : "text-slate-400"
                                        )}>
                                            {alert.label}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {alert.description}
                                        </div>
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

            {/* Embed Preview */}
            <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/50 space-y-3">
                <h4 className="font-medium text-white">📬 Embed Preview</h4>
                <div className="bg-[#36393f] rounded-lg overflow-hidden">
                    <div className="flex">
                        <div className="w-1 bg-emerald-500" />
                        <div className="p-4 space-y-2">
                            <div className="font-semibold text-white">🖥️ Server Started</div>
                            <div className="text-sm text-gray-300">
                                <strong>My ARK Server</strong> is now online and accepting players.
                            </div>
                            <div className="flex gap-6 text-xs">
                                <div>
                                    <span className="text-gray-400">Map</span>
                                    <div className="text-white">The Island</div>
                                </div>
                                <div>
                                    <span className="text-gray-400">Players</span>
                                    <div className="text-white">0/70</div>
                                </div>
                                <div>
                                    <span className="text-gray-400">Status</span>
                                    <div className="text-emerald-400">Online</div>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 pt-2 border-t border-gray-600">
                                ASA Server Manager • Today at 12:00 PM
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="bg-slate-800/20 rounded-lg p-4 border border-slate-700/30">
                <h4 className="text-sm font-medium text-slate-300 mb-2">💡 How it works</h4>
                <ul className="text-xs text-slate-500 space-y-1">
                    <li>• Notifications are sent automatically when enabled events occur</li>
                    <li>• Player join/leave notifications require RCON to be enabled</li>
                    <li>• Each notification includes relevant server details in a rich embed</li>
                </ul>
            </div>
        </div>
    );
}
