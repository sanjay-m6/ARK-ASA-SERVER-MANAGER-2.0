
import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2, Search, Sliders, ExternalLink, FileText, Copy, Check, RotateCcw, AlertTriangle, GraduationCap, BarChart3, Shield } from 'lucide-react';
import { cn } from '../utils/helpers';
import { readConfig, saveConfig, updateServerSettings } from '../utils/tauri';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { useLocation } from 'react-router-dom';
import { getAllCategories, ConfigField, parseIniContent, generateIniContent } from '../data/configMappings';
import { SettingsSlider } from '../components/settings/SettingsSlider';
import { CodeEditor } from '../components/ui/CodeEditor';
import { PresetSelector } from '../components/config/PresetSelector';
import { ConfigTooltip } from '../components/config/ConfigTooltip';
import { ArrayEditor } from '../components/config/ArrayEditor';
import { applyPreset, ConfigPreset } from '../data/presets';
import StatMultiplierEditor from '../components/config/StatMultiplierEditor';
import AntiCheatDashboard from '../components/server/AntiCheatDashboard';
import AdvancedConfigDashboard from '../components/server/AdvancedConfigDashboard';

// Field Render Component
// Field Render Component - Memoized to prevent re-renders of all fields on single keypress
const ConfigInput = memo(({
    field,
    value,
    source,
    onFieldChange,
    isModified,
    onFieldReset
}: {
    field: ConfigField,
    value: string,
    source: 'GameUserSettings' | 'Game',
    onFieldChange: (source: 'GameUserSettings' | 'Game', section: string, key: string, val: string, defaultValue?: string) => void,
    isModified?: boolean,
    onFieldReset?: (source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue: string) => void
}) => {
    const { t } = useTranslation();

    // Stable handlers that call the parent's stable callbacks
    const handleChange = (val: string) => {
        onFieldChange(source, field.section, field.key, val, field.defaultValue);
    };

    const handleReset = () => {
        if (onFieldReset && field.defaultValue) {
            onFieldReset(source, field.section, field.key, field.defaultValue);
        }
    };

    // Inline label JSX to avoid recreating component on each render
    const labelContent = (
        <ConfigTooltip
            label={field.label}
            description={field.description}
            defaultValue={field.defaultValue}
            currentValue={value}
            wikiLink={field.wikiLink}
        >
            <div className="flex items-center gap-2 mb-1">
                <div className="text-white font-medium flex items-center gap-2">
                    {field.label}
                    {isModified && (
                        <span className="w-2 h-2 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50" title={t('configEditor.tooltips.modified')} />
                    )}
                </div>
                {isModified && onFieldReset && (
                    <button
                        onClick={handleReset}
                        className="p-1 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title={t('configEditor.tooltips.reset')}
                    >
                        <RotateCcw className="w-3 h-3" />
                    </button>
                )}
            </div>
        </ConfigTooltip>
    );

    // Container classes computed inline - Modern Dark Minimal
    const containerClassName = cn(
        "bg-[#1a1a2e]/80 p-5 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.01] group relative overflow-hidden",
        isModified
            ? "border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.2)] hover:shadow-[0_0_30px_rgba(249,115,22,0.35)] bg-orange-500/5"
            : "border-[#2d2d44] hover:border-violet-500/50 hover:shadow-[0_0_25px_rgba(139,92,246,0.15)]"
    );

    switch (field.type) {
        case 'slider':
            return (
                <SettingsSlider
                    label={
                        <ConfigTooltip
                            label={field.label}
                            description={field.description}
                            defaultValue={field.defaultValue}
                            currentValue={value}
                            wikiLink={field.wikiLink}
                        >
                            <div className="flex items-center gap-2">
                                {field.label}
                                {isModified && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                                {isModified && onFieldReset && (
                                    <button onClick={(e) => { e.stopPropagation(); handleReset(); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                        <RotateCcw className="w-3 h-3 text-slate-400 hover:text-white" />
                                    </button>
                                )}
                            </div>
                        </ConfigTooltip>
                    }
                    description={field.description}
                    value={parseFloat(value) || field.min || 0}
                    min={field.min || 0}
                    max={field.max || 100}
                    step={field.step || 1}
                    onChange={(val) => handleChange(val.toString())}
                />
            );
        case 'boolean':
            return (
                <div className={containerClassName}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            {labelContent}
                            {field.description && <div className="text-sm text-slate-400">{field.description}</div>}
                        </div>
                        <button
                            onClick={() => handleChange(value.toLowerCase() === 'true' ? 'False' : 'True')}
                            className={cn(
                                "relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 mt-1",
                                value.toLowerCase() === 'true'
                                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30"
                                    : "bg-[#2d2d44]"
                            )}
                        >
                            <span
                                className={cn(
                                    "block w-5 h-5 rounded-full bg-white shadow-lg transform transition-all duration-300",
                                    value.toLowerCase() === 'true'
                                        ? "translate-x-8"
                                        : "translate-x-1"
                                )}
                            />
                        </button>
                    </div>
                </div>
            );
        case 'dropdown':
            return (
                <div className={containerClassName}>
                    {labelContent}
                    <select
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                        className="w-full bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] cursor-pointer transition-all hover:border-[#3d3d5c]"
                    >
                        {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    {field.description && <div className="mt-2 text-sm text-slate-400">{field.description}</div>}
                </div>
            );
        case 'array':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <ArrayEditor
                        label={field.label}
                        value={value}
                        onChange={handleChange}
                        template={field.template || {}}
                    />
                    {field.description && (
                        <div className="mt-2 text-xs text-slate-500 px-1 italic">
                            {field.description}
                        </div>
                    )}
                </div>
            );
        case 'textarea':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <div className={containerClassName}>
                        {labelContent}
                        <textarea
                            value={value}
                            onChange={(e) => handleChange(e.target.value)}
                            className="w-full bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:shadow-[0_0_15px_rgba(249,115,22,0.2)] font-mono text-sm min-h-[150px] transition-all placeholder-slate-500 resize-none"
                            placeholder={t('configEditor.placeholders.enterValues')}
                        />
                        {field.description && <div className="mt-2 text-sm text-slate-400">{field.description}</div>}
                    </div>
                </div>
            );
        default:
            return (
                <div className={containerClassName}>
                    {labelContent}
                    <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                        className="w-full bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:shadow-[0_0_15px_rgba(249,115,22,0.2)] font-mono transition-all placeholder-slate-500"
                    />
                    {field.description && <div className="mt-2 text-sm text-slate-400">{field.description}</div>}
                </div>
            );
    }
});

export default function ConfigEditor() {
    const { t } = useTranslation();
    const location = useLocation();
    const { servers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>('server');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'visual' | 'gus' | 'game' | 'levels' | 'stats' | 'anti-cheat' | 'advanced'>('visual');

    const [customDinoLevel, setCustomDinoLevel] = useState(150);
    const [customPlayerLevel, setCustomPlayerLevel] = useState(105);
    const [copied, setCopied] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(256);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [currentPreset, setCurrentPreset] = useState<string | undefined>();
    const [modifiedSettings, setModifiedSettings] = useState<Set<string>>(new Set());

    // Store parsed configs: Map<Section, Map<Key, Value>>
    const [configs, setConfigs] = useState<{
        GameUserSettings: Map<string, Map<string, string>>,
        Game: Map<string, Map<string, string>>
    }>({
        GameUserSettings: new Map(),
        Game: new Map()
    });

    // Store raw text for direct editing
    const [rawText, setRawText] = useState({ gus: '', game: '' });

    // Initialize from navigation or default
    useEffect(() => {
        if (location.state?.serverId) setSelectedServerId(location.state.serverId);
        else if (servers.length > 0 && !selectedServerId) setSelectedServerId(servers[0].id);
    }, [servers, selectedServerId, location.state]);

    // Load configs
    useEffect(() => {
        if (!selectedServerId) return;
        const load = async () => {
            setIsLoading(true);
            try {
                const [gusContent, gameContent] = await Promise.all([
                    readConfig(selectedServerId, 'GameUserSettings'),
                    readConfig(selectedServerId, 'Game')
                ]);

                const parsedGus = parseIniContent(gusContent);
                const parsedGame = parseIniContent(gameContent);
                setConfigs({
                    GameUserSettings: parsedGus,
                    Game: parsedGame
                });

                checkModifications({
                    GameUserSettings: parsedGus,
                    Game: parsedGame
                });

                // Optimization: Don't store rawText in state initially to save RAM
                // setRawText({ gus: gusContent, game: gameContent });
            } catch (err) {
                console.error(err);
                toast.error(t('configEditor.toasts.loadError'));
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [selectedServerId]);



    // Check for modifications against defaults
    const checkModifications = (
        currentConfigs: { GameUserSettings: Map<string, Map<string, string>>, Game: Map<string, Map<string, string>> }
    ) => {
        const modified = new Set<string>();
        const allCats = getAllCategories();

        allCats.forEach(cat => {
            cat.groups.forEach(group => {
                group.fields.forEach(field => {
                    const currentVal = currentConfigs[group.source as 'GameUserSettings' | 'Game']
                        ?.get(field.section)
                        ?.get(field.key);

                    // Normalize for comparison (handle float strings "1.0" == "1")
                    // String comparison fallback if parse fails or distinct string values
                    const isStrictDiff = currentVal !== undefined && currentVal !== field.defaultValue;

                    if (field.type === 'slider' || field.type === 'number') {
                        if (parseFloat(currentVal || '0') !== parseFloat(field.defaultValue || '0')) {
                            modified.add(`${field.section}.${field.key}`);
                        }
                    } else if (isStrictDiff) {
                        modified.add(`${field.section}.${field.key}`);
                    }
                });
            });
        });
        setModifiedSettings(modified);
    };

    const handleSwitchToVisual = () => {
        if (viewMode === 'visual') return;

        setConfigs({
            GameUserSettings: parseIniContent(rawText.gus),
            Game: parseIniContent(rawText.game)
        });
        // Optimization: Clear raw text from memory when in visual mode
        setRawText({ gus: '', game: '' });
        setViewMode('visual');
    };

    const handleSwitchToRaw = (target: 'gus' | 'game') => {
        if (viewMode === target) return;

        // Only regenerate if coming from visual mode or if we need to sync
        // If switching between raw views (gus <-> game), we should keep existing edits?
        // Actually, rawText holds both. switching viewMode just changes what is displayed.
        // But if we come from Visual, we must regenerate.

        if (viewMode === 'visual') {
            setRawText({
                gus: generateIniContent(configs.GameUserSettings),
                game: generateIniContent(configs.Game)
            });
        }
        setViewMode(target);
    };

    const handleUpdate = useCallback((source: 'GameUserSettings' | 'Game', section: string, key: string, val: string, defaultValue?: string) => {
        setConfigs(prev => {
            const fileMap = prev[source];
            const newFileMap = new Map(fileMap);
            const sectionMap = new Map(newFileMap.get(section) || []);
            sectionMap.set(key, val);
            newFileMap.set(section, sectionMap);

            const newConfigs = { ...prev, [source]: newFileMap };

            // Check modification for this specific field
            setModifiedSettings(prevMod => {
                const newMod = new Set(prevMod);
                const uniqueKey = `${section}.${key}`;

                // Simple equality check is usually enough for updates as inputs are controlled
                // But for numbers "1" vs "1.0" could happen
                const isModified = val !== defaultValue &&
                    (isNaN(parseFloat(val)) || parseFloat(val) !== parseFloat(defaultValue || '0'));

                if (isModified) newMod.add(uniqueKey);
                else newMod.delete(uniqueKey);

                return newMod;
            });

            return newConfigs;
        });
    }, []);

    const handleReset = useCallback((source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue: string) => {
        handleUpdate(source, section, key, defaultValue, defaultValue);
        toast.success(t('configEditor.toasts.resetSuccess'));
    }, [handleUpdate]);

    const handleSave = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            let gusString = rawText.gus;
            let gameString = rawText.game;

            // Get parsed configs for extracting values
            let parsedConfigs = configs;

            // If in Raw Editor mode, use the text content. Otherwise (Visual, Stats, Levels, etc), use the parsed configs.
            if (viewMode === 'gus' || viewMode === 'game') {
                // Parse raw text to get current values to ensure we save what's in the text editor
                parsedConfigs = {
                    GameUserSettings: parseIniContent(rawText.gus),
                    Game: parseIniContent(rawText.game)
                };
                gusString = rawText.gus;
                gameString = rawText.game;
            } else {
                // For all other modes, generate INI from the current state maps
                gusString = generateIniContent(configs.GameUserSettings);
                gameString = generateIniContent(configs.Game);
            }

            // Ensure Game.ini has the required section header even if empty
            if (!gameString.includes('[/Script/ShooterGame.ShooterGameMode]')) {
                gameString = '[/Script/ShooterGame.ShooterGameMode]\n' + gameString;
            }

            // Save INI files
            await Promise.all([
                saveConfig(selectedServerId, 'GameUserSettings', gusString),
                saveConfig(selectedServerId, 'Game', gameString)
            ]);

            // Extract critical settings from the parsed configs and sync to database
            // This ensures settings are always saved even if INI parsing in backend fails
            const serverSettings = parsedConfigs.GameUserSettings.get('ServerSettings');
            const urlSettings = parsedConfigs.GameUserSettings.get('URL');

            const updateParams: Parameters<typeof updateServerSettings>[0] = {
                serverId: selectedServerId
            };

            // Map name
            const mapName = serverSettings?.get('MapName');
            if (mapName) updateParams.mapName = mapName;

            // Session name
            const sessionName = serverSettings?.get('ServerName') || serverSettings?.get('SessionName');
            if (sessionName) updateParams.sessionName = sessionName;

            // Max players
            const maxPlayers = serverSettings?.get('MaxPlayers');
            if (maxPlayers) updateParams.maxPlayers = parseInt(maxPlayers);

            // Passwords
            const serverPassword = serverSettings?.get('ServerPassword');
            if (serverPassword !== undefined) updateParams.serverPassword = serverPassword;

            const adminPassword = serverSettings?.get('ServerAdminPassword');
            if (adminPassword) updateParams.adminPassword = adminPassword;

            // Ports from URL section
            const gamePort = urlSettings?.get('Port');
            if (gamePort) updateParams.gamePort = parseInt(gamePort);

            const queryPort = urlSettings?.get('QueryPort');
            if (queryPort) updateParams.queryPort = parseInt(queryPort);

            // RCON port from ServerSettings
            const rconPort = serverSettings?.get('RCONPort');
            if (rconPort) updateParams.rconPort = parseInt(rconPort);

            // IP Address from ServerSettings
            const ipAddress = serverSettings?.get('IPAddress');
            if (ipAddress !== undefined) updateParams.ipAddress = ipAddress;

            // Sync critical settings to database
            await updateServerSettings(updateParams);

            // Refresh servers list to reflect updates in UI
            useServerStore.getState().refreshServers();

            toast.success(t('configEditor.toasts.saveSuccess'));
            toast(() => (
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    <span className="font-medium text-slate-200">{t('configEditor.toasts.restartRequired')}</span>
                </div>
            ), { duration: 5000, icon: null, style: { background: '#1e1e3a', border: '1px solid #f97316' } });

        } catch (err) {
            console.error(err);
            toast.error(t('configEditor.toasts.saveError'));
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success(t('configEditor.toasts.copySuccess'));
    };

    const getValue = (source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue?: string) => {
        return configs[source]?.get(section)?.get(key) ?? defaultValue ?? '';
    };

    const categories = useMemo(() => getAllCategories(), []);

    const filteredGroups = useMemo(() => {
        let groups = categories.find(c => c.category === activeCategory)?.groups || [];
        if (searchQuery) {
            const allGroups = categories.flatMap(c => c.groups);
            const search = searchQuery.toLowerCase();
            return allGroups.filter(g =>
                g.title.toLowerCase().includes(search) ||
                g.fields.some(f => f.label.toLowerCase().includes(search) || f.key.toLowerCase().includes(search))
            ).map(g => ({
                ...g,
                fields: g.fields.filter(f => f.label.toLowerCase().includes(search) || f.key.toLowerCase().includes(search))
            }));
        }
        return groups;
    }, [activeCategory, searchQuery, categories]);

    // Preset handler
    const handleApplyPreset = (preset: ConfigPreset) => {
        const newConfigs = applyPreset(preset, configs);
        setConfigs({
            GameUserSettings: newConfigs.GameUserSettings,
            Game: newConfigs.Game
        });

        // Update raw text if in raw mode
        if (viewMode !== 'visual') {
            setRawText({
                gus: generateIniContent(newConfigs.GameUserSettings),
                game: generateIniContent(newConfigs.Game)
            });
        }

        setCurrentPreset(preset.id);
        toast.success(t('configEditor.toasts.presetApplied', { name: preset.name }));
        checkModifications(newConfigs);
    };

    // Custom Level Generator Functions
    const applyDinoLevel = (level: number) => {
        setCustomDinoLevel(level);
        const difficulty = (level / 30).toFixed(1);
        handleUpdate('GameUserSettings', 'ServerSettings', 'OverrideOfficialDifficulty', difficulty);
        handleUpdate('GameUserSettings', 'ServerSettings', 'DifficultyOffset', '1.0');
        toast.success(t('configEditor.toasts.dinoLevelSet', { level }));
    };

    const applyPlayerLevel = (maxLevel: number) => {
        setCustomPlayerLevel(maxLevel);

        // Generate XP ramp
        const levels = [];
        for (let i = 0; i < maxLevel; i++) {
            const xp = Math.floor(10 * Math.pow(i, 2.2));
            levels.push(`ExperiencePointsForLevel[${i}]=${xp}`);
        }

        const rampString = `(${levels.join(',')})`;

        handleUpdate('Game', '/Script/ShooterGame.ShooterGameMode', 'LevelExperienceRampOverrides', rampString);
        handleUpdate('Game', '/Script/ShooterGame.ShooterGameMode', 'OverrideMaxExperiencePointsPlayer', Math.floor(10 * Math.pow(maxLevel, 2.2)).toString());
        toast.success(t('configEditor.toasts.playerLevelSet', { level: maxLevel }));
    };

    const conflicts = useMemo(() => {
        const issues: { type: 'warning' | 'error', message: string }[] = [];

        // 1. Taming Conflict
        const disableTaming = getValue('Game', '/Script/ShooterGame.ShooterGameMode', 'bDisableDinoTaming');
        const tamingSpeed = getValue('GameUserSettings', 'ServerSettings', 'TamingSpeedMultiplier');
        if (disableTaming === 'True' && parseFloat(tamingSpeed) > 1) {
            issues.push({
                type: 'warning',
                message: t('configEditor.validation.tamingConflict')
            });
        }

        // 2. Friendly Fire Conflict
        const disableFF = getValue('Game', '/Script/ShooterGame.ShooterGameMode', 'bPvEDisableFriendlyFire');
        const ffMult = getValue('Game', '/Script/ShooterGame.ShooterGameMode', 'bPvEFriendlyFireMultiplier');
        if (disableFF === 'True' && parseFloat(ffMult) !== 1) {
            issues.push({
                type: 'warning',
                message: t('configEditor.validation.friendlyFireConflict')
            });
        }

        // 3. Ultra High Rates Warning
        const xpMult = getValue('GameUserSettings', 'ServerSettings', 'XPMultiplier');
        if (parseFloat(xpMult) > 50) {
            issues.push({
                type: 'warning',
                message: t('configEditor.validation.xpWarning')
            });
        }

        return issues;
    }, [configs]);

    // Sidebar resize handlers
    const startResizing = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = e.clientX;
            if (newWidth >= 200 && newWidth <= 500) {
                setSidebarWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    return (
        <div className="h-full flex flex-col bg-[#0d0d1a] rounded-2xl overflow-hidden border border-[#1e1e3a] shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-[#1e1e3a]/80 flex flex-col gap-5 bg-[#12121f]">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-5 flex-1">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                                <Sliders className="w-5 h-5 text-white" />
                            </div>
                            <span className="bg-gradient-to-r from-white via-violet-200 to-indigo-200 bg-clip-text text-transparent">{t('configEditor.title')}</span>
                        </h2>

                        <select
                            value={selectedServerId || ''}
                            onChange={(e) => setSelectedServerId(Number(e.target.value))}
                            className="bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] transition-all cursor-pointer hover:border-[#3d3d5c]"
                        >
                            {servers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>

                        <div className="h-8 w-px bg-[#2d2d44] mx-2" />

                        <PresetSelector
                            onApplyPreset={handleApplyPreset}
                            currentPreset={currentPreset}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <a
                            href="https://ark.wiki.gg/wiki/Server_configuration"
                            target="_blank"
                            className="px-4 py-2 bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl text-slate-400 hover:text-white hover:border-violet-500/50 text-sm flex items-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                        >
                            <ExternalLink className="w-4 h-4" /> {t('configEditor.buttons.wiki')}
                        </a>
                        <button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {t('configEditor.buttons.save')}
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs - Modern Pill Style */}
                <div className="flex items-center gap-2 bg-[#0d0d1a] p-2 rounded-2xl self-start border border-[#1e1e3a]">
                    <button
                        onClick={handleSwitchToVisual}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                            viewMode === 'visual'
                                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30"
                                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                        )}
                    >
                        <Sliders className="w-4 h-4" /> {t('configEditor.tabs.visual')}
                    </button>
                    <button
                        onClick={() => handleSwitchToRaw('gus')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                            viewMode === 'gus'
                                ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/30"
                                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                        )}
                    >
                        <FileText className="w-4 h-4" /> {t('configEditor.tabs.gus')}
                    </button>
                    <button
                        onClick={() => handleSwitchToRaw('game')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                            viewMode === 'game'
                                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30"
                                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                        )}
                    >
                        <FileText className="w-4 h-4" /> {t('configEditor.tabs.game')}
                    </button>
                    <button
                        onClick={() => setViewMode('levels')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                            viewMode === 'levels'
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                        )}
                    >
                        <GraduationCap className="w-4 h-4" /> {t('configEditor.tabs.levels')}
                    </button>
                    <button
                        onClick={() => setViewMode('stats')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                            viewMode === 'stats'
                                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/30"
                                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                        )}
                    >
                        <BarChart3 className="w-4 h-4" /> {t('configEditor.tabs.stats')}
                    </button>
                    <button
                        onClick={() => setViewMode('anti-cheat')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                            viewMode === 'anti-cheat'
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                        )}
                    >
                        <Shield className="w-4 h-4" /> {t('configEditor.tabs.antiCheat')}
                    </button>
                    <button
                        onClick={() => setViewMode('advanced')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                            viewMode === 'advanced'
                                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30"
                                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                        )}
                    >
                        <Sliders className="w-4 h-4" /> {t('configEditor.tabs.advanced')}
                    </button>
                </div>
            </div>

            {/* Validation Banner */}
            {conflicts.length > 0 && viewMode === 'visual' && (
                <div className="bg-orange-500/10 border-b border-orange-500/20 px-6 py-3 flex flex-col gap-2">
                    {conflicts.map((issue, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-sm">
                            <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                            <span className="text-orange-200/90">{issue.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative">
                {viewMode === 'anti-cheat' ? (
                    <div className="w-full h-full overflow-y-auto bg-[#0d0d1a]">
                        <AntiCheatDashboard serverId={selectedServerId} />
                    </div>
                ) : viewMode === 'advanced' ? (
                    <div className="w-full h-full overflow-y-auto bg-[#0d0d1a] p-8">
                        <AdvancedConfigDashboard serverId={selectedServerId} />
                    </div>
                ) : viewMode === 'visual' ? (
                    <>
                        {/* Sidebar */}
                        <div
                            className={cn(
                                "bg-[#12121f] border-r-2 border-[#1e1e3a] overflow-y-auto relative transition-all duration-300",
                                isSidebarCollapsed && "w-0"
                            )}
                            style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
                        >
                            {!isSidebarCollapsed && (
                                <>
                                    <div className="p-4 border-b-2 border-[#1e1e3a]">
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input
                                                type="text"
                                                placeholder={t('configEditor.placeholders.searchSettings')}
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-2">
                                        {categories.map(({ category, info }) => (
                                            <button
                                                key={category}
                                                onClick={() => {
                                                    setActiveCategory(category);
                                                    setSearchQuery('');
                                                }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300",
                                                    activeCategory === category && !searchQuery
                                                        ? `bg-gradient-to-r ${info.color} text-white shadow-lg`
                                                        : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
                                                )}
                                            >
                                                <span className="text-lg">{info.icon}</span>
                                                <span>{info.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Resize Handle */}
                                    <div
                                        className={cn(
                                            "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-violet-500/50 transition-colors z-10",
                                            isResizing && "bg-violet-500"
                                        )}
                                        onMouseDown={startResizing}
                                    />
                                </>
                            )}
                        </div>

                        {/* Collapse/Expand Button */}
                        <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="absolute top-20 left-0 z-20 w-7 h-10 bg-[#1a1a2e] border-2 border-[#2d2d44] text-slate-400 hover:bg-violet-600 hover:border-violet-500 hover:text-white transition-all shadow-lg flex items-center justify-center rounded-r-xl"
                            style={{ marginLeft: isSidebarCollapsed ? '0px' : `${sidebarWidth}px` }}
                        >
                            {isSidebarCollapsed ? '›' : '‹'}
                        </button>

                        {/* Editor Area */}
                        <div className="flex-1 overflow-y-auto bg-[#0d0d1a] p-6 scrollbar-thin scrollbar-thumb-[#2d2d44] scrollbar-track-transparent">
                            {isLoading && !configs.GameUserSettings.size ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 animate-pulse">
                                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                                        </div>
                                        <span className="text-slate-400 text-sm font-medium">{t('configEditor.loading')}</span>
                                    </div>
                                </div>
                            ) : filteredGroups.length > 0 ? (
                                <div className="space-y-10 max-w-4xl mx-auto">
                                    {filteredGroups.map((group, idx) => (
                                        <div key={idx} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                                            {/* Section Header with dynamic gradient decoration */}
                                            <div className="flex items-center gap-3 pb-3 border-b border-white/10 relative">
                                                <div className={cn(
                                                    "absolute bottom-0 left-0 w-24 h-px bg-gradient-to-r to-transparent",
                                                    categories.find(c => c.category === activeCategory)?.info.color.replace('from-', 'from-').replace('to-', 'to-') || "from-cyan-500"
                                                )}></div>
                                                <h3 className="text-lg font-bold text-white tracking-tight">{group.title}</h3>
                                                <span className={cn(
                                                    "text-xs px-2.5 py-1 rounded-full border font-medium",
                                                    group.source === 'GameUserSettings'
                                                        ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                                                        : "border-purple-500/40 text-purple-400 bg-purple-500/10"
                                                )}>
                                                    {group.source === 'GameUserSettings' ? 'INI' : 'GAME'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                                                {group.fields.map((field) => (
                                                    <ConfigInput
                                                        key={`${field.section}.${field.key}`}
                                                        field={field}
                                                        value={getValue(group.source as any, field.section, field.key, field.defaultValue)}
                                                        source={group.source as any}
                                                        onFieldChange={handleUpdate}
                                                        isModified={modifiedSettings.has(`${field.section}.${field.key}`)}
                                                        onFieldReset={handleReset}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <div className="relative mb-6">
                                        <div className="absolute inset-0 bg-slate-500/10 blur-2xl rounded-full"></div>
                                        <Search className="w-16 h-16 opacity-30 relative z-10" />
                                    </div>
                                    <p className="text-lg font-medium text-slate-400">{t('configEditor.emptyState.title')}</p>
                                    <p className="text-sm text-slate-500 mt-1">{t('configEditor.emptyState.description', { query: searchQuery })}</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : viewMode === 'levels' ? (
                    <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-slate-900/30 to-slate-950/50">
                        <div className="max-w-2xl mx-auto space-y-8">
                            <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 rounded-2xl p-8 border border-slate-700/50 shadow-xl backdrop-blur-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-emerald-500/30 blur-lg rounded-full"></div>
                                        <GraduationCap className="w-8 h-8 text-emerald-400 relative z-10" />
                                    </div>
                                    <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                                        {t('configEditor.levelsGenerator.title')}
                                    </h2>
                                </div>
                                <p className="text-slate-400 mb-8">{t('configEditor.levelsGenerator.subtitle')}</p>

                                <div className="grid gap-8 md:grid-cols-2">
                                    {/* Dino Levels */}
                                    <div className="space-y-4">
                                        <label className="block text-sm font-semibold text-slate-200">{t('configEditor.levelsGenerator.dinoLevelLabel')}</label>
                                        <div className="flex gap-4">
                                            <input
                                                type="number"
                                                value={customDinoLevel}
                                                onChange={(e) => setCustomDinoLevel(parseInt(e.target.value) || 30)}
                                                className="w-full bg-slate-900/80 backdrop-blur-sm border border-slate-600/50 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none shadow-inner transition-all font-mono text-lg"
                                                min="30" max="3000" step="30"
                                            />
                                        </div>
                                        <button
                                            onClick={() => applyDinoLevel(customDinoLevel)}
                                            className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 border border-emerald-400/20"
                                        >
                                            {t('configEditor.levelsGenerator.applyDinoLevel')}
                                        </button>
                                        <p className="text-xs text-slate-400 bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700/30">
                                            {t('configEditor.levelsGenerator.dinoLevelReset', { offset: (customDinoLevel / 30).toFixed(1) })}
                                        </p>
                                    </div>

                                    {/* Player Levels */}
                                    <div className="space-y-4">
                                        <label className="block text-sm font-semibold text-slate-200">{t('configEditor.levelsGenerator.playerLevelLabel')}</label>
                                        <div className="flex gap-4">
                                            <input
                                                type="number"
                                                value={customPlayerLevel}
                                                onChange={(e) => setCustomPlayerLevel(parseInt(e.target.value) || 105)}
                                                className="flex-1 bg-slate-900/80 backdrop-blur-sm border border-slate-600/50 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 outline-none shadow-inner transition-all font-mono text-lg"
                                            />
                                        </div>
                                        <button
                                            onClick={() => applyPlayerLevel(customPlayerLevel)}
                                            className="w-full px-4 py-3 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 border border-sky-400/20"
                                        >
                                            {t('configEditor.levelsGenerator.generateXpRamp')}
                                        </button>
                                        <p className="text-xs text-slate-400 bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700/30">
                                            {t('configEditor.levelsGenerator.playerLevelDescription', { level: customPlayerLevel })}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Info Section */}
                            <div className="bg-gradient-to-br from-slate-800/40 to-slate-800/20 rounded-xl p-5 border border-slate-700/40 backdrop-blur-sm">
                                <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">{t('configEditor.levelsGenerator.howItWorks')}</h3>
                                <ul className="text-xs text-slate-400 space-y-2">
                                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> <span>{t('configEditor.levelsGenerator.howItWorksDino')}</span></li>
                                    <li className="flex items-start gap-2"><span className="text-sky-400">•</span> <span>{t('configEditor.levelsGenerator.howItWorksPlayer')}</span></li>
                                    <li>• {t('configEditor.levelsGenerator.howItWorksSave')}</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                ) : viewMode === 'stats' ? (
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="max-w-4xl mx-auto">
                            <StatMultiplierEditor
                                getValue={getValue}
                                setValue={(source, section, key, value) => handleUpdate(source, section, key, value)}
                            />
                        </div>
                    </div>


                ) : (
                    <div className="flex-1 overflow-hidden relative p-4 bg-[#0f0f0f]">
                        <div className="absolute top-6 right-8 z-10">
                            <button
                                onClick={() => copyToClipboard(viewMode === 'gus' ? rawText.gus : rawText.game)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-[#252526] hover:bg-[#333] text-slate-300 rounded-md border border-[#3e3e3e] shadow-sm transition-all text-sm font-medium"
                            >
                                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                {t('configEditor.buttons.copy')}
                            </button>
                        </div>
                        <CodeEditor
                            value={viewMode === 'gus' ? rawText.gus : rawText.game}
                            onChange={(val) => setRawText(prev => ({
                                ...prev,
                                [viewMode as 'gus' | 'game']: val
                            }))}
                            className="h-full shadow-2xl"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
