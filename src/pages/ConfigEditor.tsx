
import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Search, Sliders, ExternalLink, FileText, Copy, Check, RotateCcw, AlertTriangle, GraduationCap, BarChart3 } from 'lucide-react';
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
// Field Render Component
const ConfigInput = ({
    field,
    value,
    onChange,
    isModified,
    onReset
}: {
    field: ConfigField,
    value: string,
    onChange: (val: string) => void,
    isModified?: boolean,
    onReset?: () => void
}) => {
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
                        <span className="w-2 h-2 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50" title="Modified from default" />
                    )}
                </div>
                {isModified && onReset && (
                    <button
                        onClick={onReset}
                        className="p-1 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Reset to default"
                    >
                        <RotateCcw className="w-3 h-3" />
                    </button>
                )}
            </div>
        </ConfigTooltip>
    );

    // Container classes computed inline
    const containerClassName = cn(
        "bg-slate-800/50 p-4 rounded-lg border transition-all duration-300",
        isModified
            ? "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50"
            : "border-slate-700/50 hover:border-cyan-500/30"
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
                                {isModified && <span className="w-2 h-2 rounded-full bg-orange-500" />}
                                {isModified && onReset && (
                                    <button onClick={(e) => { e.stopPropagation(); onReset(); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
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
                    onChange={(val) => onChange(val.toString())}
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
                            onClick={() => onChange(value.toLowerCase() === 'true' ? 'False' : 'True')}
                            className={cn(
                                "relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 flex-shrink-0 mt-1",
                                value.toLowerCase() === 'true' ? "bg-cyan-600" : "bg-slate-700"
                            )}
                        >
                            <span
                                className={cn(
                                    "block w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200",
                                    value.toLowerCase() === 'true' ? "translate-x-7" : "translate-x-1"
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
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-1 focus:ring-cyan-500 outline-none"
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
                        onChange={onChange}
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
                            onChange={(e) => onChange(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-1 focus:ring-cyan-500 outline-none font-mono text-sm min-h-[150px]"
                            placeholder="Enter values, one per line..."
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
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-1 focus:ring-cyan-500 outline-none font-mono"
                    />
                    {field.description && <div className="mt-2 text-sm text-slate-400">{field.description}</div>}
                </div>
            );
    }
};

export default function ConfigEditor() {
    const location = useLocation();
    const { servers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>('server');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'visual' | 'gus' | 'game' | 'levels' | 'stats'>('visual');
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

                setRawText({ gus: gusContent, game: gameContent });
            } catch (err) {
                console.error(err);
                toast.error('Failed to load configuration files');
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
        setConfigs({
            GameUserSettings: parseIniContent(rawText.gus),
            Game: parseIniContent(rawText.game)
        });
        setViewMode('visual');
    };

    const handleSwitchToRaw = (target: 'gus' | 'game') => {
        setRawText({
            gus: generateIniContent(configs.GameUserSettings),
            game: generateIniContent(configs.Game)
        });
        setViewMode(target);
    };

    const handleUpdate = (source: 'GameUserSettings' | 'Game', section: string, key: string, val: string, defaultValue?: string) => {
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
    };

    const handleReset = (source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue: string) => {
        handleUpdate(source, section, key, defaultValue, defaultValue);
        toast.success('Reset to default');
    };

    const handleSave = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            let gusString = rawText.gus;
            let gameString = rawText.game;

            // Get parsed configs for extracting values
            let parsedConfigs = configs;
            if (viewMode === 'visual') {
                gusString = generateIniContent(configs.GameUserSettings);
                gameString = generateIniContent(configs.Game);
            } else {
                // Parse raw text to get current values
                parsedConfigs = {
                    GameUserSettings: parseIniContent(rawText.gus),
                    Game: parseIniContent(rawText.game)
                };
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

            // Sync critical settings to database
            await updateServerSettings(updateParams);

            // Refresh servers list to reflect updates in UI
            useServerStore.getState().refreshServers();

            toast.success('All configurations saved successfully');
        } catch (err) {
            console.error(err);
            toast.error('Failed to save configurations');
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Copied to clipboard');
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
        toast.success(`Applied ${preset.name} preset`);
        checkModifications(newConfigs);
    };

    // Custom Level Generator Functions
    const applyDinoLevel = (level: number) => {
        setCustomDinoLevel(level);
        const difficulty = (level / 30).toFixed(1);
        handleUpdate('GameUserSettings', 'ServerSettings', 'OverrideOfficialDifficulty', difficulty);
        handleUpdate('GameUserSettings', 'ServerSettings', 'DifficultyOffset', '1.0');
        toast.success(`Max wild dino level set to ${level}`);
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
        toast.success(`Max player level set to ${maxLevel}`);
    };

    const conflicts = useMemo(() => {
        const issues: { type: 'warning' | 'error', message: string }[] = [];

        // 1. Taming Conflict
        const disableTaming = getValue('Game', '/Script/ShooterGame.ShooterGameMode', 'bDisableDinoTaming');
        const tamingSpeed = getValue('GameUserSettings', 'ServerSettings', 'TamingSpeedMultiplier');
        if (disableTaming === 'True' && parseFloat(tamingSpeed) > 1) {
            issues.push({
                type: 'warning',
                message: 'Taming is disabled, but Taming Speed Multiplier is > 1.0 (multiplier will have no effect).'
            });
        }

        // 2. Friendly Fire Conflict
        const disableFF = getValue('Game', '/Script/ShooterGame.ShooterGameMode', 'bPvEDisableFriendlyFire');
        const ffMult = getValue('Game', '/Script/ShooterGame.ShooterGameMode', 'bPvEFriendlyFireMultiplier');
        if (disableFF === 'True' && parseFloat(ffMult) !== 1) {
            issues.push({
                type: 'warning',
                message: 'PvE Friendly Fire is disabled, but Multiplier is modified (multiplier will have no effect).'
            });
        }

        // 3. Ultra High Rates Warning
        const xpMult = getValue('GameUserSettings', 'ServerSettings', 'XPMultiplier');
        if (parseFloat(xpMult) > 50) {
            issues.push({
                type: 'warning',
                message: 'Extreme XP Multiplier detected (> 50x). This may cause instability or rapid progression loops.'
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
        <div className="h-full flex flex-col bg-slate-950/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-800/50">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex flex-col gap-4 bg-slate-900/50">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
                            <Sliders className="w-5 h-5 text-cyan-500" />
                            Config Editor
                        </h2>

                        <select
                            value={selectedServerId || ''}
                            onChange={(e) => setSelectedServerId(Number(e.target.value))}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        >
                            {servers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>

                        <div className="h-6 w-px bg-slate-700 mx-2" />

                        <PresetSelector
                            onApplyPreset={handleApplyPreset}
                            currentPreset={currentPreset}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <a
                            href="https://ark.wiki.gg/wiki/Server_configuration"
                            target="_blank"
                            className="text-slate-400 hover:text-cyan-400 text-sm flex items-center gap-1 transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" /> Wiki
                        </a>
                        <button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg shadow-lg shadow-cyan-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg self-start">
                    <button
                        onClick={handleSwitchToVisual}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                            viewMode === 'visual' ? "bg-cyan-500/10 text-cyan-400" : "text-slate-400 hover:bg-white/5"
                        )}
                    >
                        <Sliders className="w-4 h-4" /> Visual Editor
                    </button>
                    <button
                        onClick={() => handleSwitchToRaw('gus')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                            viewMode === 'gus' ? "bg-blue-500/10 text-blue-400" : "text-slate-400 hover:bg-white/5"
                        )}
                    >
                        <FileText className="w-4 h-4" /> GameUserSettings.ini
                    </button>
                    <button
                        onClick={() => handleSwitchToRaw('game')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                            viewMode === 'game' ? "bg-purple-500/10 text-purple-400" : "text-slate-400 hover:bg-white/5"
                        )}
                    >
                        <FileText className="w-4 h-4" /> Game.ini
                    </button>
                    <button
                        onClick={() => setViewMode('levels')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                            viewMode === 'levels' ? "bg-emerald-500/10 text-emerald-400" : "text-slate-400 hover:bg-white/5"
                        )}
                    >
                        <GraduationCap className="w-4 h-4" /> Levels Generator
                    </button>
                    <button
                        onClick={() => setViewMode('stats')}
                        className={cn(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                            viewMode === 'stats' ? "bg-indigo-500/10 text-indigo-400" : "text-slate-400 hover:bg-white/5"
                        )}
                    >
                        <BarChart3 className="w-4 h-4" /> Per-Stat Multipliers
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
                {viewMode === 'visual' ? (
                    <>
                        {/* Sidebar */}
                        <div
                            className={cn(
                                "bg-slate-900/30 border-r border-white/5 overflow-y-auto relative transition-all duration-300",
                                isSidebarCollapsed && "w-0"
                            )}
                            style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
                        >
                            {!isSidebarCollapsed && (
                                <>
                                    <div className="p-4 border-b border-white/5">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input
                                                type="text"
                                                placeholder="Search..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-2 space-y-1">
                                        {categories.map(({ category, info }) => (
                                            <button
                                                key={category}
                                                onClick={() => {
                                                    setActiveCategory(category);
                                                    setSearchQuery('');
                                                }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all",
                                                    activeCategory === category && !searchQuery
                                                        ? `bg-gradient-to-r ${info.color} text-white shadow-lg`
                                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                                )}
                                            >
                                                <span className="text-lg">{info.icon}</span>
                                                {info.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Resize Handle - Inside sidebar */}
                                    <div
                                        className={cn(
                                            "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-cyan-500/50 transition-colors z-10",
                                            isResizing && "bg-cyan-500"
                                        )}
                                        onMouseDown={startResizing}
                                    />
                                </>
                            )}
                        </div>

                        {/* Collapse/Expand Button */}
                        <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="absolute top-20 left-0 z-20 w-6 h-8 bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-cyan-400 transition-all shadow-lg flex items-center justify-center rounded-r-md"
                            style={{ marginLeft: isSidebarCollapsed ? '0px' : `${sidebarWidth}px` }}
                        >
                            {isSidebarCollapsed ? '›' : '‹'}
                        </button>

                        {/* Editor Area */}
                        <div className="flex-1 overflow-y-auto bg-slate-900/20 p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {isLoading && !configs.GameUserSettings.size ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                                </div>
                            ) : filteredGroups.length > 0 ? (
                                <div className="space-y-8 max-w-4xl mx-auto">
                                    {filteredGroups.map((group, idx) => (
                                        <div key={idx} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                                            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                                                <h3 className="text-lg font-semibold text-white">{group.title}</h3>
                                                <span className={cn(
                                                    "text-xs px-2 py-0.5 rounded border",
                                                    group.source === 'GameUserSettings'
                                                        ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
                                                        : "border-purple-500/30 text-purple-400 bg-purple-500/10"
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
                                                        onChange={(val) => handleUpdate(group.source as any, field.section, field.key, val, field.defaultValue)}
                                                        isModified={modifiedSettings.has(`${field.section}.${field.key}`)}
                                                        onReset={() => handleReset(group.source as any, field.section, field.key, field.defaultValue || '')}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <Search className="w-12 h-12 mb-4 opacity-50" />
                                    <p className="text-lg">No settings found match "{searchQuery}"</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : viewMode === 'levels' ? (
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="max-w-2xl mx-auto space-y-8">
                            <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                    <GraduationCap className="w-6 h-6 text-emerald-400" />
                                    Custom Levels Generator
                                </h2>
                                <p className="text-slate-400 mb-6">Easily generate complex difficulty and XP configurations.</p>

                                <div className="grid gap-8 md:grid-cols-2">
                                    {/* Dino Levels */}
                                    <div className="space-y-4">
                                        <label className="block text-sm font-medium text-slate-300">Max Wild Dino Level</label>
                                        <div className="flex gap-4">
                                            <input
                                                type="number"
                                                value={customDinoLevel}
                                                onChange={(e) => setCustomDinoLevel(parseInt(e.target.value) || 30)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-cyan-500 outline-none"
                                                min="30" max="3000" step="30"
                                            />
                                        </div>
                                        <button
                                            onClick={() => applyDinoLevel(customDinoLevel)}
                                            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Apply Dino Level
                                        </button>
                                        <p className="text-xs text-slate-500">
                                            Sets Difficulty Offset to 1.0 and Override Official Difficulty to {(customDinoLevel / 30).toFixed(1)}.
                                        </p>
                                    </div>

                                    {/* Player Levels */}
                                    <div className="space-y-4">
                                        <label className="block text-sm font-medium text-slate-300">Max Player Level</label>
                                        <div className="flex gap-4">
                                            <input
                                                type="number"
                                                value={customPlayerLevel}
                                                onChange={(e) => setCustomPlayerLevel(parseInt(e.target.value) || 105)}
                                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-1 focus:ring-cyan-500 outline-none"
                                            />
                                        </div>
                                        <button
                                            onClick={() => applyPlayerLevel(customPlayerLevel)}
                                            className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Generate XP Ramp
                                        </button>
                                        <p className="text-xs text-slate-500">
                                            Generates a standard exponential XP ramp for {customPlayerLevel} levels.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Info Section */}
                            <div className="bg-slate-800/20 rounded-lg p-4 border border-slate-700/30">
                                <h3 className="text-sm font-medium text-slate-300 mb-2">💡 How it works</h3>
                                <ul className="text-xs text-slate-500 space-y-1">
                                    <li>• <strong>Dino Level</strong>: Sets OverrideOfficialDifficulty based on max level / 30</li>
                                    <li>• <strong>Player Level</strong>: Generates LevelExperienceRampOverrides with exponential XP curve</li>
                                    <li>• Changes are applied to the config and will be saved when you click Save</li>
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
                                Copy
                            </button>
                        </div>
                        <CodeEditor
                            value={viewMode === 'gus' ? rawText.gus : rawText.game}
                            onChange={(val) => setRawText(prev => ({
                                ...prev,
                                [viewMode]: val
                            }))}
                            className="h-full shadow-2xl"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
