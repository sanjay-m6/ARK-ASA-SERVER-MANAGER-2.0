import { useState, useEffect, useCallback } from 'react';
import { Settings, Eye, EyeOff, CheckCircle, XCircle, Loader2, FlaskConical, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '../../utils/helpers';
import {
    saveDiscordBridgeConfig,
    getDiscordBridgeConfig,
    testDiscordConnection,
    DiscordBridgeConfig
} from '../../utils/tauri';
import toast from 'react-hot-toast';

interface DiscordBridgeSettingsProps {
    clusterId: number;
    clusterName: string;
}

export default function DiscordBridgeSettings({ clusterId, clusterName }: DiscordBridgeSettingsProps) {
    const [config, setConfig] = useState<DiscordBridgeConfig>({
        cluster_id: clusterId,
        enabled: false,
        bot_token: '',
        guild_id: '',
        channel_id: '',
        game_to_discord: true,
        discord_to_game: true,
    });

    const [showToken, setShowToken] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [connectionMessage, setConnectionMessage] = useState('');

    const loadConfig = useCallback(async () => {
        try {
            const existingConfig = await getDiscordBridgeConfig(clusterId);
            if (existingConfig) {
                setConfig(existingConfig);
            }
        } catch (error) {
            console.error('Failed to load Discord config:', error);
        }
    }, [clusterId]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const handleTestConnection = async () => {
        if (!config.bot_token || !config.channel_id) {
            toast.error('Bot token and channel ID are required');
            return;
        }

        setIsTesting(true);
        setConnectionStatus('idle');
        try {
            const result = await testDiscordConnection(config.bot_token, config.channel_id);
            setConnectionStatus('success');
            setConnectionMessage(result);
            toast.success(result);
        } catch (error) {
            setConnectionStatus('error');
            setConnectionMessage(String(error));
            toast.error(String(error));
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveDiscordBridgeConfig({
                ...config,
                cluster_id: clusterId,
            });
            toast.success('Discord bridge settings saved');
        } catch (error) {
            toast.error('Failed to save settings');
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-slate-900/50 rounded-xl border border-violet-500/30 p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500/10 rounded-lg">
                        <Settings className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">Discord Bridge</h3>
                            <span className="px-1.5 py-0.5 bg-amber-500 text-[10px] font-bold text-black rounded flex items-center gap-0.5">
                                <FlaskConical className="w-2.5 h-2.5" />
                                BETA
                            </span>
                        </div>
                        <p className="text-sm text-slate-400">Connect {clusterName} to Discord</p>
                    </div>
                </div>

                {/* Enable Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                        className="sr-only"
                    />
                    <div className={cn(
                        "w-11 h-6 rounded-full transition-colors relative",
                        config.enabled ? "bg-violet-600" : "bg-slate-700"
                    )}>
                        <div className={cn(
                            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                            config.enabled && "translate-x-5"
                        )} />
                    </div>
                    <span className="text-sm text-slate-300">
                        {config.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </label>
            </div>

            {/* Configuration Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bot Token */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Bot Token
                    </label>
                    <div className="relative">
                        <input
                            type={showToken ? 'text' : 'password'}
                            value={config.bot_token}
                            onChange={(e) => setConfig({ ...config, bot_token: e.target.value })}
                            placeholder="Enter your Discord bot token"
                            className="w-full px-4 py-2.5 pr-12 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                        />
                        <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Create a bot at <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Discord Developer Portal</a>
                    </p>
                </div>

                {/* Guild ID */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Server (Guild) ID
                    </label>
                    <input
                        type="text"
                        value={config.guild_id}
                        onChange={(e) => setConfig({ ...config, guild_id: e.target.value })}
                        placeholder="e.g., 123456789012345678"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                </div>

                {/* Channel ID */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Channel ID
                    </label>
                    <input
                        type="text"
                        value={config.channel_id}
                        onChange={(e) => setConfig({ ...config, channel_id: e.target.value })}
                        placeholder="e.g., 987654321098765432"
                        className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Direction Toggles */}
            <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={config.game_to_discord}
                        onChange={(e) => setConfig({ ...config, game_to_discord: e.target.checked })}
                        className="sr-only"
                    />
                    <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        config.game_to_discord
                            ? "bg-violet-600 border-violet-500"
                            : "bg-slate-800 border-slate-600 group-hover:border-slate-500"
                    )}>
                        {config.game_to_discord && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-sm text-slate-300 flex items-center gap-1">
                        Game <ArrowRight className="w-3 h-3" /> Discord
                    </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={config.discord_to_game}
                        onChange={(e) => setConfig({ ...config, discord_to_game: e.target.checked })}
                        className="sr-only"
                    />
                    <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        config.discord_to_game
                            ? "bg-violet-600 border-violet-500"
                            : "bg-slate-800 border-slate-600 group-hover:border-slate-500"
                    )}>
                        {config.discord_to_game && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span className="text-sm text-slate-300 flex items-center gap-1">
                        Discord <ArrowLeft className="w-3 h-3" /> Game
                    </span>
                </label>
            </div>

            {/* Connection Status */}
            {connectionStatus !== 'idle' && (
                <div className={cn(
                    "flex items-center gap-2 p-3 rounded-lg",
                    connectionStatus === 'success' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                )}>
                    {connectionStatus === 'success' ? (
                        <CheckCircle className="w-5 h-5" />
                    ) : (
                        <XCircle className="w-5 h-5" />
                    )}
                    <span className="text-sm">{connectionMessage}</span>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
                <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !config.bot_token || !config.channel_id}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Settings className="w-4 h-4" />
                    )}
                    <span>Test Connection</span>
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Save Settings</span>
                </button>
            </div>
        </div>
    );
}
