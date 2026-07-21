import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Globe, Languages, Plus, Settings, Users,
  RefreshCw, Search, ShieldAlert, Cpu, BarChart2, MessageSquare, AlertCircle
} from 'lucide-react';
import { useChatTranslatorStore } from '../../stores/chatTranslatorStore';
import { TranslatorConfig } from '../../types/chat_translator.types';
import { getAllServers } from '../../utils/tauri';
import { Server } from '../../types';
import { useServerStore } from '../../stores/serverStore';
import toast from 'react-hot-toast';
import { cn } from '../../utils/helpers';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Turkish (Türkçe)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'ru', name: 'Russian (Русский)' },
  { code: 'zh', name: 'Chinese (中文)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'it', name: 'Italian (Italiano)' },
  { code: 'pl', name: 'Polish (Polski)' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'ko', name: 'Korean (한국어)' }
];

export default function ChatTranslator() {
  const { t } = useTranslation();
  const { activeServer } = useServerStore();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'players'>('overview');

  useEffect(() => {
    if (activeServer) {
      setSelectedServerId(activeServer.id);
    }
  }, [activeServer]);

  // Search / modal state
  const [searchQuery, setSearchQuery] = useState('');
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false);
  const [editingPref, setEditingPref] = useState<{
    steamId: string;
    playerName: string;
    selectedLanguage: string;
  } | null>(null);

  const {
    config,
    playerPrefs,
    stats,
    isLoading,
    fetchConfig,
    saveConfig,
    fetchPlayerPrefs,
    savePlayerPref,
    deletePlayerPref,
    fetchStats,
    resetStats,
    installPlugin,
    uninstallPlugin,
  } = useChatTranslatorStore();

  const selectedServer = servers.find((s) => s.id === selectedServerId);

  // Load servers list on mount
  useEffect(() => {
    getAllServers()
      .then((s) => {
        setServers(s);
        if (s.length > 0) setSelectedServerId(s[0].id);
      })
      .catch((err) => console.error('Failed to load servers:', err));
  }, []);

  // Fetch all configuration, statistics, and preferences for selected server
  const loadServerData = async () => {
    if (!selectedServerId || !selectedServer) return;
    const type = selectedServer.serverType;
    await fetchConfig(selectedServerId, type);
    await fetchStats(selectedServerId, type);
    await fetchPlayerPrefs(selectedServerId, type);
  };

  useEffect(() => {
    if (selectedServerId && selectedServer) {
      loadServerData();
    }
  }, [selectedServerId, selectedServer]);

  // Plugin Installation Hooks
  const handleInstall = async () => {
    if (!selectedServerId || !selectedServer) return;
    try {
      await installPlugin(selectedServerId, selectedServer.serverType);
      toast.success(t('translator.installSuccess', 'Chat Translator plugin installed successfully!'));
      loadServerData();
    } catch (err) {
      toast.error(`${t('translator.installError', 'Failed to install plugin')}: ${err}`);
    }
  };

  const handleUninstall = async () => {
    if (!selectedServerId || !selectedServer) return;
    if (!window.confirm(t('translator.confirmUninstall', 'Are you sure you want to uninstall Chat Translator? This will delete local configs.'))) return;
    try {
      await uninstallPlugin(selectedServerId, selectedServer.serverType);
      toast.success(t('translator.uninstallSuccess', 'Chat Translator plugin uninstalled.'));
      loadServerData();
    } catch (err) {
      toast.error(`${t('translator.uninstallError', 'Failed to uninstall plugin')}: ${err}`);
    }
  };

  // Config Update Hooks
  const handleSaveConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!config) return;
    try {
      await saveConfig(config);
      toast.success(t('translator.configSaved', 'Translation settings updated successfully!'));
    } catch (err) {
      toast.error(`${t('translator.configSaveError', 'Failed to save config')}: ${err}`);
    }
  };

  const updateConfigField = (key: keyof TranslatorConfig, value: any) => {
    if (!config) return;
    useChatTranslatorStore.setState({
      config: { ...config, [key]: value }
    });
  };

  // Preference Handlers
  const handleOpenPrefModal = (pref?: typeof playerPrefs[0]) => {
    if (pref) {
      setEditingPref({
        steamId: pref.steamId,
        playerName: pref.playerName,
        selectedLanguage: pref.selectedLanguage,
      });
    } else {
      setEditingPref({
        steamId: '',
        playerName: '',
        selectedLanguage: 'en',
      });
    }
    setIsPrefModalOpen(true);
  };

  const handleSavePref = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId || !selectedServer || !editingPref) return;
    if (!editingPref.steamId.trim() || !editingPref.playerName.trim()) {
      toast.error(t('translator.fieldsRequired', 'Steam ID and Player Name are required.'));
      return;
    }

    try {
      await savePlayerPref({
        steamId: editingPref.steamId,
        playerName: editingPref.playerName,
        selectedLanguage: editingPref.selectedLanguage,
        serverId: selectedServerId,
        serverType: selectedServer.serverType,
        lastUpdated: new Date().toISOString(),
      });

      toast.success(t('translator.prefSaved', 'Player translation preference updated.'));
      setIsPrefModalOpen(false);
      fetchPlayerPrefs(selectedServerId, selectedServer.serverType);
    } catch (err) {
      toast.error(`${t('translator.prefSaveError', 'Failed to save player preference')}: ${err}`);
    }
  };

  const handleDeletePref = async (steamId: string) => {
    if (!selectedServerId || !selectedServer) return;
    if (!window.confirm(t('translator.confirmDeletePref', 'Are you sure you want to remove this player preference?'))) return;
    try {
      await deletePlayerPref(steamId, selectedServerId, selectedServer.serverType);
      toast.success(t('translator.prefDeleted', 'Preference removed.'));
      fetchPlayerPrefs(selectedServerId, selectedServer.serverType);
    } catch (err) {
      toast.error(`${t('translator.prefDeleteError', 'Failed to remove preference')}: ${err}`);
    }
  };

  const handleResetStats = async () => {
    if (!selectedServerId || !selectedServer) return;
    if (!window.confirm(t('translator.confirmResetStats', 'Are you sure you want to reset all translation usage counters?'))) return;
    try {
      await resetStats(selectedServerId, selectedServer.serverType);
      toast.success(t('translator.statsReset', 'Statistics reset successfully.'));
    } catch (err) {
      toast.error(`${t('translator.statsResetError', 'Failed to reset statistics')}: ${err}`);
    }
  };

  // Filter player mappings
  const filteredPrefs = playerPrefs.filter(
    (p) =>
      p.playerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.steamId.includes(searchQuery)
  );

  const getLanguageName = (code: string) => {
    return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name || code;
  };

  const cacheRate = stats && stats.totalRequests > 0 
    ? Math.round((stats.cacheHits / stats.totalRequests) * 100) 
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-500">
            {t('translator.title', 'Chat Translator')}
          </h1>
          <p className="text-slate-400 mt-2 text-lg">
            {t('translator.subtitle', 'Auto-translate in-game server chat dynamically across players in different languages')}
          </p>
        </div>

        <div className="flex items-center gap-3">

          <button
            onClick={loadServerData}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            <span>{t('common.refresh', 'Refresh')}</span>
          </button>
        </div>
      </div>

      {/* Main UI Panel */}
      {!selectedServerId ? (
        <div className="glass-panel rounded-2xl p-12 text-center text-slate-400">
          {t('translator.noServers', 'Please select a server to manage.')}
        </div>
      ) : !config ? (
        <div className="glass-panel rounded-2xl p-12 text-center space-y-6">
          <ShieldAlert className="w-16 h-16 text-sky-500 mx-auto" />
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-2xl font-semibold text-white">
              {t('translator.pluginNotInstalled', 'Translator Plugin Not Installed')}
            </h2>
            <p className="text-slate-400">
              {t(
                'translator.pluginDescription',
                'Enable play-to-translate chat mechanics on your server. This hooks directly into game server chat, translating posts into preferred player targets using DeepL/Google API.'
              )}
            </p>
          </div>
          <button
            onClick={handleInstall}
            className="px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-lg transition-all"
          >
            {t('translator.installPlugin', 'Install Chat Translator')}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-panel rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">{t('translator.totalTrans', 'Total Characters Translated')}</p>
                <h3 className="text-3xl font-bold text-white mt-1">{stats?.totalCharsTranslated || 0}</h3>
              </div>
              <div className="w-12 h-12 bg-sky-500/10 rounded-xl flex items-center justify-center">
                <Globe className="w-6 h-6 text-sky-400" />
              </div>
            </div>

            <div className="glass-panel rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">{t('translator.apiProvider', 'Translation API')}</p>
                <h3 className="text-3xl font-bold text-sky-400 mt-1">{config.translationApi}</h3>
              </div>
              <div className="w-12 h-12 bg-sky-500/10 rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6 text-sky-400" />
              </div>
            </div>

            <div className="glass-panel rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">{t('translator.prefCount', 'Player Preferences')}</p>
                <h3 className="text-3xl font-bold text-white mt-1">{playerPrefs.length}</h3>
              </div>
              <div className="w-12 h-12 bg-sky-500/10 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-sky-400" />
              </div>
            </div>

            <div className="glass-panel rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">{t('translator.cacheHits', 'Cache Saving Efficiency')}</p>
                <h3 className="text-3xl font-bold text-emerald-400 mt-1">{cacheRate}%</h3>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <BarChart2 className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-b border-slate-800 pb-px">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                'px-4 py-2.5 font-medium border-b-2 transition-all text-sm',
                activeTab === 'overview'
                  ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              )}
            >
              {t('translator.tabOverview', 'Overview')}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                'px-4 py-2.5 font-medium border-b-2 transition-all text-sm',
                activeTab === 'settings'
                  ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              )}
            >
              {t('translator.tabSettings', 'API & Settings')}
            </button>
            <button
              onClick={() => setActiveTab('players')}
              className={cn(
                'px-4 py-2.5 font-medium border-b-2 transition-all text-sm',
                activeTab === 'players'
                  ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              )}
            >
              {t('translator.tabPlayers', 'Player Language Prefs')}
            </button>
          </div>

          {/* Tab Contents */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Instructions Info Card */}
              <div className="glass-panel rounded-2xl p-6 lg:col-span-2 space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <MessageSquare className="w-5 h-5 text-sky-400" />
                  {t('translator.inGameTitle', 'In-Game Usage & Player Commands')}
                </h3>
                <p className="text-slate-300 text-sm">
                  {t('translator.usageInstructions', 'Once installed and enabled, the Chat Translator plugin automatically translates chat messages between survivors in real-time. Players can configure their own settings using custom chat commands:')}
                </p>

                <div className="space-y-4 pt-2">
                  <div className="flex gap-4 p-3 bg-slate-800/30 border border-slate-800/80 rounded-xl">
                    <span className="font-mono text-sky-400 font-bold bg-sky-400/5 px-2.5 py-1 rounded text-xs h-fit">
                      /lang &lt;code&gt;
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{t('translator.cmdLang', 'Set Preferred Language')}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {t('translator.cmdLangDesc', 'Changes the target language for all incoming translations. E.g. /lang tr sets the player target language to Turkish.')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-3 bg-slate-800/30 border border-slate-800/80 rounded-xl">
                    <span className="font-mono text-sky-400 font-bold bg-sky-400/5 px-2.5 py-1 rounded text-xs h-fit">
                      /translate &lt;on/off&gt;
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{t('translator.cmdTrans', 'Toggle Translations')}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {t('translator.cmdTransDesc', 'Enables or disables auto-translation for the player. E.g., /translate off will stop translating posts.')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-center text-xs text-slate-500">
                  <span>Plugin Version: 1.0.0</span>
                  <button
                    onClick={handleUninstall}
                    className="text-red-400 hover:text-red-300 font-medium hover:underline"
                  >
                    {t('translator.uninstallPluginBtn', 'Uninstall Chat Translator')}
                  </button>
                </div>
              </div>

              {/* Cache hits details */}
              <div className="glass-panel rounded-2xl p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                    <BarChart2 className="w-5 h-5 text-sky-400" />
                    {t('translator.cacheDetails', 'Cache Stats')}
                  </h3>

                  <div className="space-y-4 pt-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('translator.totalRequests', 'Total API Requests')}</span>
                      <span className="text-white font-bold">{stats?.totalRequests || 0}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('translator.totalSaved', 'Cached / Saved Requests')}</span>
                      <span className="text-emerald-400 font-bold">{stats?.cacheHits || 0}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('translator.activeCache', 'Active Cache Rate')}</span>
                      <span className="text-white font-bold">{cacheRate}%</span>
                    </div>

                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex gap-2">
                      <AlertCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                      <p className="text-xs text-slate-400 leading-normal">
                        {t('translator.cacheNotice', 'Caching translations saves API lookup characters, significantly reducing billing costs if you use commercial translation endpoints (like DeepL Pro).')}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleResetStats}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
                >
                  {t('translator.resetStatsBtn', 'Reset Usage Counters')}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <form onSubmit={handleSaveConfig} className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-sky-400" />
                  {t('translator.settingsSetup', 'API Configurations & Translation Prefs')}
                </h3>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  {t('common.save', 'Save Configuration')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* General Setup */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    {t('translator.generalSettings', 'General Config')}
                  </h4>

                  <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-white">{t('translator.enablePlugin', 'Enable Translation Service')}</p>
                      <p className="text-xs text-slate-500">{t('translator.enablePluginDesc', 'Activate auto-translation hooks in chat')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => updateConfigField('enabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t('translator.defaultLang', 'Default Translation Target')}</label>
                    <select
                      value={config.defaultLanguage}
                      onChange={(e) => updateConfigField('defaultLanguage', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-sky-500 text-sm"
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-white">{t('translator.transSys', 'Translate Alerts / System')}</p>
                      <p className="text-xs text-slate-500">{t('translator.transSysDesc', 'Process in-game join/leave alerts and server broadcasts')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.translateSystemMessages}
                        onChange={(e) => updateConfigField('translateSystemMessages', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-white">{t('translator.enableCache', 'Enable Query Cache')}</p>
                      <p className="text-xs text-slate-500">{t('translator.enableCacheDesc', 'Avoid re-fetching translation api for repeating chat lines')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.cacheTranslations}
                        onChange={(e) => updateConfigField('cacheTranslations', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                    </label>
                  </div>
                </div>

                {/* API Setup */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    {t('translator.apiSettings', 'Translation API Provider')}
                  </h4>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">{t('translator.apiProviderLabel', 'Provider API Engine')}</label>
                    <select
                      value={config.translationApi}
                      onChange={(e) => updateConfigField('translationApi', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-sky-500 text-sm"
                    >
                      <option value="Google">Google Translate (Free / Web interface)</option>
                      <option value="DeepL">DeepL (Requires Auth Key)</option>
                      <option value="LibreTranslate">LibreTranslate (Self-Hosted / Open-Source)</option>
                    </select>
                  </div>

                  {config.translationApi !== 'Google' && (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      <label className="text-sm font-medium text-slate-300">
                        {config.translationApi === 'DeepL' ? t('translator.deeplKey', 'DeepL API Auth Key') : t('translator.libreUrl', 'LibreTranslate URL / Key')}
                      </label>
                      <input
                        type="password"
                        value={config.apiKey || ''}
                        onChange={(e) => updateConfigField('apiKey', e.target.value)}
                        placeholder="Enter API Endpoint Key..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-sky-500 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            </form>
          )}

          {activeTab === 'players' && (
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-semibold text-white">{t('translator.playerLanguages', 'Player Language Overrides')}</h3>
                  <button
                    onClick={() => handleOpenPrefModal()}
                    className="flex items-center gap-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded text-xs transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('translator.addPref', 'Add Override')}
                  </button>
                </div>

                <div className="relative md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={t('translator.searchPlayers', 'Search Steam ID or name...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-sky-500 text-sm"
                  />
                </div>
              </div>

              {filteredPrefs.length === 0 ? (
                <p className="text-slate-400 text-center py-8">{t('translator.noMatchingPrefs', 'No player preferences stored.')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-medium">
                        <th className="pb-3">{t('translator.player', 'Player')}</th>
                        <th className="pb-3">{t('translator.steamId', 'Steam ID')}</th>
                        <th className="pb-3">{t('translator.targetLang', 'Target Language')}</th>
                        <th className="pb-3 text-slate-500">{t('translator.lastUpdated', 'Last Updated')}</th>
                        <th className="pb-3 text-center">{t('translator.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredPrefs.map((pref) => (
                        <tr key={pref.steamId} className="text-slate-300 hover:bg-slate-800/20">
                          <td className="py-3 font-semibold text-white">{pref.playerName}</td>
                          <td className="py-3 font-mono text-xs">{pref.steamId}</td>
                          <td className="py-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-sky-500/10 text-sky-400 text-xs font-semibold">
                              <Languages className="w-3 h-3" />
                              {getLanguageName(pref.selectedLanguage)}
                            </span>
                          </td>
                          <td className="py-3 text-xs text-slate-500">{new Date(pref.lastUpdated).toLocaleString()}</td>
                          <td className="py-3 text-center flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenPrefModal(pref)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded transition-all"
                            >
                              {t('common.edit', 'Edit')}
                            </button>
                            <button
                              onClick={() => handleDeletePref(pref.steamId)}
                              className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded transition-all"
                            >
                              {t('common.delete', 'Delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preferences Dialog */}
      {isPrefModalOpen && editingPref && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <form onSubmit={handleSavePref} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-sky-400" />
              {t('translator.prefDetails', 'Language Override Mapping')}
            </h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('translator.playerSteamId', 'Player Steam ID')}</label>
                <input
                  type="text"
                  required
                  value={editingPref.steamId}
                  onChange={(e) => setEditingPref({ ...editingPref, steamId: e.target.value })}
                  placeholder="e.g. 76561198000000000"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('translator.playerNameLabel', 'Player Name')}</label>
                <input
                  type="text"
                  required
                  value={editingPref.playerName}
                  onChange={(e) => setEditingPref({ ...editingPref, playerName: e.target.value })}
                  placeholder="e.g. Survivor"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('translator.targetLanguage', 'Preferred Language')}</label>
                <select
                  value={editingPref.selectedLanguage}
                  onChange={(e) => setEditingPref({ ...editingPref, selectedLanguage: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-sky-500 text-sm"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setIsPrefModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-lg transition-all"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-lg transition-all"
              >
                {t('common.save', 'Save Override')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
