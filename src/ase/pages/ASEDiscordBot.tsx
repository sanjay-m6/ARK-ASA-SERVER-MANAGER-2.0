import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Bell, Send, CheckCircle, Loader2, AlertTriangle,
  Users, RefreshCw, Shield, Bot,
  PlayCircle, StopCircle, Clock, Link, Settings, Radio
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface AlertConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  category: 'server' | 'player' | 'system';
}

const DEFAULT_ALERTS: AlertConfig[] = [
  { key: 'serverStart', label: 'Server Start', description: 'Server comes online', icon: PlayCircle, enabled: true, category: 'server' },
  { key: 'serverStop', label: 'Server Stop', description: 'Server goes offline', icon: StopCircle, enabled: true, category: 'server' },
  { key: 'serverCrash', label: 'Server Crash', description: 'Unexpected shutdown', icon: AlertTriangle, enabled: true, category: 'server' },
  { key: 'serverUpdate', label: 'Server Update', description: 'Files updated via SteamCMD', icon: RefreshCw, enabled: true, category: 'server' },
  { key: 'playerJoin', label: 'Player Join', description: 'Player connects', icon: Users, enabled: false, category: 'player' },
  { key: 'playerLeave', label: 'Player Leave', description: 'Player disconnects', icon: Users, enabled: false, category: 'player' },
  { key: 'backupCompletion', label: 'Backup Complete', description: 'Backup finished', icon: Shield, enabled: true, category: 'system' },
  { key: 'serverRecovery', label: 'Server Recovery', description: 'Intelligent auto-recovery executed', icon: Shield, enabled: true, category: 'system' },
  { key: 'scheduledRestarts', label: 'Scheduled Tasks', description: 'Scheduled restarts and warnings', icon: Clock, enabled: true, category: 'system' },
];

export default function ASEDiscordBot() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [alerts, setAlerts] = useState<AlertConfig[]>(DEFAULT_ALERTS);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [activeTab, setActiveTab] = useState<'webhook' | 'bot'>('webhook');

  // Bot configuration
  const [discordToken, setDiscordToken] = useState('');
  const [discordClientId, setDiscordClientId] = useState('');
  const [isBotSaving, setIsBotSaving] = useState(false);

  // Real-time connection check
  const checkConnection = useCallback(async (url: string) => {
    if (!url) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('checking');
    try {
      const response = await fetch(url);
      if (response.ok) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch {
      setConnectionStatus('disconnected');
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [configData, dToken, dClient] = await Promise.all([
          invoke<[string, string]>('get_ase_discord_config'),
          invoke<string | null>('get_setting', { key: 'ase_discord_bot_token' }),
          invoke<string | null>('get_setting', { key: 'ase_discord_client_id' })
        ]);

        const [url, alertsJson] = configData;
        if (url) {
          setWebhookUrl(url);
          checkConnection(url);
        } else {
          setConnectionStatus('disconnected');
        }

        if (alertsJson) {
          try {
            const parsed = JSON.parse(alertsJson);
            setAlerts(prev => prev.map(alert => ({
              ...alert,
              enabled: parsed[alert.key] ?? alert.enabled
            })));
          } catch (e) {
            console.error('Failed to parse alerts JSON', e);
          }
        }

        if (dToken) setDiscordToken(dToken);
        if (dClient) setDiscordClientId(dClient);
      } catch (err) {
        console.error('Failed to load ASE discord config', err);
        toast.error('Failed to load Discord settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [checkConnection]);

  const handleSaveWebhook = async () => {
    setIsSaving(true);
    try {
      const alertMap = alerts.reduce((acc, alert) => {
        acc[alert.key] = alert.enabled;
        return acc;
      }, {} as Record<string, boolean>);

      await invoke('save_ase_discord_config', {
        webhookUrl: webhookUrl.trim(),
        alertsConfig: JSON.stringify(alertMap)
      });

      toast.success('Webhook alerts saved successfully');
      checkConnection(webhookUrl.trim());
    } catch (err) {
      console.error(err);
      toast.error('Failed to save webhook settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a Webhook URL first');
      return;
    }

    setIsTesting(true);
    try {
      // Find first server for context or default to 1
      let serverId = 1;
      try {
        const servers = await invoke<any[]>('get_ase_servers');
        if (servers && servers.length > 0) {
          serverId = servers[0].id;
        }
      } catch (e) {
        // Safe to ignore
      }

      await invoke('test_ase_discord_webhook', {
        webhookUrl: webhookUrl.trim(),
        serverId
      });

      toast.success('Test message sent to Discord!');
    } catch (err) {
      console.error(err);
      toast.error(`Failed to send test message: ${err}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveBot = async () => {
    setIsBotSaving(true);
    try {
      await invoke('set_setting', { key: 'ase_discord_bot_token', value: discordToken.trim() });
      await invoke('set_setting', { key: 'ase_discord_client_id', value: discordClientId.trim() });
      toast.success('Discord Bot configuration saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save bot settings');
    } finally {
      setIsBotSaving(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!discordClientId.trim()) {
      toast.error('Please enter a Discord Client ID');
      return;
    }

    try {
      const inviteUrl = await invoke<string>('generate_ase_bot_invite_url', {
        clientId: discordClientId.trim()
      });
      
      try {
        await invoke('plugin:opener|open_url', { url: inviteUrl });
      } catch {
        window.open(inviteUrl, '_blank');
      }
      toast.success('Opened bot invite URL in browser');
    } catch (err) {
      toast.error(`Failed to generate invite URL: ${err}`);
    }
  };

  const toggleAlert = (key: string) => {
    setAlerts(prev => prev.map(a => a.key === key ? { ...a, enabled: !a.enabled } : a));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-xl">
            <MessageSquare className="w-6 h-6 text-amber-400" />
          </div>
          Discord Integration
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Bridge your ASE servers to Discord with webhook alerts and remote control bot configurations.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900/50 border border-white/5 rounded-xl self-start w-fit">
        <button
          onClick={() => setActiveTab('webhook')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'webhook'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Bell className="w-4 h-4" />
          Webhook Alerts
        </button>
        <button
          onClick={() => setActiveTab('bot')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'bot'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Bot className="w-4 h-4" />
          Discord Bot
        </button>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === 'webhook' ? (
          <motion.div
            key="webhook"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Connection and config card */}
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Radio className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Webhook Connection</h3>
                    <p className="text-xs text-slate-400">Specify your Discord channel webhook URL</p>
                  </div>
                </div>

                {/* Status indicator */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Status:</span>
                  {connectionStatus === 'checking' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full text-xs font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking
                    </span>
                  )}
                  {connectionStatus === 'connected' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" /> Connected
                    </span>
                  )}
                  {connectionStatus === 'disconnected' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-xs font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" /> Disconnected
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-300">Webhook URL</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      onChange={e => setWebhookUrl(e.target.value)}
                      placeholder="https://discord.com/api/webhooks/..."
                      className="flex-1 px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30"
                    />
                    <button
                      onClick={handleTestWebhook}
                      disabled={isTesting}
                      className="px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 hover:border-white/20 active:bg-slate-800 rounded-xl text-slate-300 hover:text-white transition-all text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Test
                    </button>
                    <button
                      onClick={handleSaveWebhook}
                      disabled={isSaving}
                      className="px-5 py-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl transition-all text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                      Save Configurations
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Notification alert toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Alert Subscriptions</h3>
                <span className="text-xs text-slate-500">Toggle events to post directly to your webhook channel</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {alerts.map(alert => {
                  const Icon = alert.icon;
                  return (
                    <div
                      key={alert.key}
                      onClick={() => toggleAlert(alert.key)}
                      className={`glass-panel p-5 rounded-2xl cursor-pointer hover:border-white/20 transition-all flex items-start gap-4 border ${
                        alert.enabled ? 'border-amber-500/20 bg-amber-500/[0.02]' : 'border-white/5'
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl ${
                        alert.enabled ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white text-sm">{alert.label}</span>
                          <div className={`w-8 h-5 rounded-full relative transition-all duration-300 ${
                            alert.enabled ? 'bg-amber-500/20 border-amber-500/30' : 'bg-slate-950 border-white/10'
                          } border`}>
                            <div 
                              className={`w-3 h-3 rounded-full transition-all duration-300 ease-in-out absolute top-[3px] left-[3px] ${
                                alert.enabled ? 'translate-x-3 bg-amber-400' : 'translate-x-0 bg-slate-500'
                              }`} 
                            />
                          </div>
                        </div>
                        <p className="text-xs text-slate-400">{alert.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="bot"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Setup Guide Card */}
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Bot className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Advanced Discord Bot Integration</h3>
                  <p className="text-xs text-slate-400">Configure a serenity-based Discord bot for real-time status reporting and RCON execution</p>
                </div>
              </div>

              {/* Steps */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">1</span>
                    <span className="font-semibold text-white text-sm">Create Application</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Go to the <span className="text-amber-400 cursor-pointer underline" onClick={() => window.open('https://discord.com/developers/applications', '_blank')}>Discord Developer Portal</span>, click "New Application", name it, and retrieve your Client ID.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">2</span>
                    <span className="font-semibold text-white text-sm">Add Bot Account</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Go to the "Bot" tab, click "Add Bot", copy the bot token, and enable **Server Members Intent** under "Privileged Gateway Intents".
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">3</span>
                    <span className="font-semibold text-white text-sm">Invite and Connect</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Enter the Bot Token and Client ID below, save, click "Invite Bot" to authorize it to your guild, and start the bridge process.
                  </p>
                </div>
              </div>
            </div>

            {/* Inputs Card */}
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Bot Credentials</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-300">Discord Client ID</span>
                  <input
                    type="text"
                    value={discordClientId}
                    onChange={e => setDiscordClientId(e.target.value)}
                    placeholder="Enter Discord application client ID..."
                    className="px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-300">Discord Bot Token</span>
                  <input
                    type="password"
                    value={discordToken}
                    onChange={e => setDiscordToken(e.target.value)}
                    placeholder="Enter Discord bot token..."
                    className="px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500/30"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                <button
                  onClick={handleGenerateInvite}
                  className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 hover:border-white/20 rounded-xl text-slate-300 hover:text-white transition-all text-sm font-semibold flex items-center gap-2"
                >
                  <Link className="w-4 h-4" />
                  Invite Bot
                </button>
                <button
                  onClick={handleSaveBot}
                  disabled={isBotSaving}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold rounded-xl transition-all text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isBotSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                  Save Bot Configuration
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
