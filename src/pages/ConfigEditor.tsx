
import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Save, Loader2, Search, Sliders, ExternalLink, FileText, Copy, Check, RotateCcw, AlertTriangle, GraduationCap, BarChart3, Shield, X, ChevronDown, ChevronUp, MapPin, Compass, Clock, Sparkles, Globe, Package, Download, Terminal } from 'lucide-react';
import { cn } from '../utils/helpers';
import { readConfig, saveConfig, updateServerSettings, getInstalledMods, installMod } from '../utils/tauri';
import toast from 'react-hot-toast';
import { useServerStore } from '../stores/serverStore';
import { useLocation } from 'react-router-dom';
import { getAllCategories, CATEGORY_INFO, ConfigField, ConfigGroup, parseIniContent, generateIniContent, CaseInsensitiveMap } from '../data/configMappings';
import { SettingsSlider } from '../components/settings/SettingsSlider';
import { CodeEditor } from '../components/ui/CodeEditor';
import { NumberInput } from '../components/ui/NumberInput';
import { PresetSelector } from '../components/config/PresetSelector';
import { ConfigTooltip } from '../components/config/ConfigTooltip';
import { ArrayEditor } from '../components/config/ArrayEditor';
import { CraftingCostEditor } from '../components/config/CraftingCostEditor';
import { ItemStackEditor } from '../components/config/ItemStackEditor';
import { EngramOverridesEditor } from '../components/config/EngramOverridesEditor';
import { EngramPointsPerLevelEditor } from '../components/config/EngramPointsPerLevelEditor';
import { LootCrateEditor } from '../components/config/LootCrateEditor';
import { DinoSpawnEditor } from '../components/config/DinoSpawnEditor';
import { applyPreset, ConfigPreset, createPresetFromConfig, saveCustomPreset, updateCustomPreset, getCustomPresets } from '../data/presets';
import StatMultiplierEditor from '../components/config/StatMultiplierEditor';
import AntiCheatDashboard from '../components/server/AntiCheatDashboard';
import AdvancedConfigDashboard from '../components/server/AdvancedConfigDashboard';
import { MODDED_MAP_PRESETS, ASA_MODDED_MAP_PRESETS, buildLaunchArgs, getModdedMapByMapArg, isModLikelyMap, detectMapArgumentFromMod, isOfficialMap, type ModdedMapPreset } from '../data/moddedMapRegistry';
import PlatformSelector from '../components/config/PlatformSelector';
import ServerSelect from '../components/ui/ServerSelect';
import ServerPresetModal from '../components/presets/ServerPresetModal';
import ModMapHubModal from '../components/modals/ModMapHubModal';
import type { ModInfo } from '../types';

// Map images
import mapTheIsland from '../assets/maps/the_island.png';
import mapScorchedEarth from '../assets/maps/scorched_earth.png';
import mapTheCenter from '../assets/maps/the_center.png';
import mapAberration from '../assets/maps/aberration.png';
import mapExtinction from '../assets/maps/extinction.png';
import mapRagnarok from '../assets/maps/ragnarok.png';
import mapValguero from '../assets/maps/valguero.png';
import mapLostColony from '../assets/maps/lost_colony.png';
import mapAstraeos from '../assets/maps/astraeos.png';
import mapForglar from '../assets/maps/forglar.png';
import mapSvartalfheim from '../assets/maps/svartalfheim.png';
import mapAmissa from '../assets/maps/amissa.png';
import mapInsaluna from '../assets/maps/insaluna.png';
import mapTemptressLagoon from '../assets/maps/temptress_lagoon.png';
import mapReverence from '../assets/maps/reverence.png';
import mapGenesis from '../assets/maps/genesis.png';
import mapGenesis2 from '../assets/maps/genesis2.png';
import mapFjordur from '../assets/maps/fjordur.png';
import mapCrystalIsles from '../assets/maps/crystal_isles.png';
import mapLostIsland from '../assets/maps/lost_island.png';
import mapArkClub from '../assets/maps/ark_club.png';

// Render-time translation helpers for map metadata (keys fall back to the English source text)
const mapDescriptionLabel = (t: any, mapKey: string, description: string) =>
    t(`configEditor.maps.${mapKey}.description`, { defaultValue: description });
const mapDlcLabel = (t: any, dlcType: string) =>
    t(`configEditor.mapDlc.${groupTitleKey(dlcType)}`, { defaultValue: dlcType });
const mapSizeLabel = (t: any, size: string) =>
    size.replace(/^(Large|Medium|Small)/, (m) => t(`configEditor.map.size.${m.toLowerCase()}`, m));

interface MapInfo {
    name: string;
    description: string;
    color: string;
    icon: string;
    size: string;
    image: string;
    dlcType: string;
    author?: string;
}

const MAP_METADATA: Record<string, MapInfo> = {
    'TheIsland_WP': {
        name: 'The Island',
        description: 'The original ARK experience — tropical island with diverse biomes.',
        color: '#22c55e',
        icon: '🏝️',
        size: 'Large (~8 GB)',
        image: mapTheIsland,
        dlcType: 'Official Release'
    },
    'ScorchedEarth_WP': {
        name: 'Scorched Earth',
        description: 'Harsh desert survival. Find water, shield from heat, and tame the desert beasts.',
        color: '#f59e0b',
        icon: '🏜️',
        size: 'Medium (~5 GB)',
        image: mapScorchedEarth,
        dlcType: 'Official Release'
    },
    'TheCenter_WP': {
        name: 'The Center',
        description: 'Massive open-world map with floating islands, lava biomes, and deep oceans.',
        color: '#3b82f6',
        icon: '🌊',
        size: 'Large (~9 GB)',
        image: mapTheCenter,
        dlcType: 'Official Release'
    },
    'Aberration_WP': {
        name: 'Aberration',
        description: 'Bioluminescent underground cave system. Watch out for radiation and hazardous creatures.',
        color: '#a855f7',
        icon: '🍄',
        size: 'Medium (~6 GB)',
        image: mapAberration,
        dlcType: 'Official Release'
    },
    'Extinction_WP': {
        name: 'Extinction',
        description: 'Post-apocalyptic Earth overrun by element-corrupted creatures. Discover proto-ARKs.',
        color: '#64748b',
        icon: '🏚️',
        size: 'Large (~10 GB)',
        image: mapExtinction,
        dlcType: 'Official Release'
    },
    'Ragnarok_WP': {
        name: 'Ragnarok',
        description: 'Viking-themed mega map featuring active volcanoes, hot springs, and high-altitude biomes.',
        color: '#ef4444',
        icon: '⚔️',
        size: 'Large (~11 GB)',
        image: mapRagnarok,
        dlcType: 'Official Release'
    },
    'Valguero_WP': {
        name: 'Valguero',
        description: 'Dramatically diverse terrain featuring valleys, gorges, and a massive underground ocean.',
        color: '#10b981',
        icon: '🦖',
        size: 'Large (~9 GB)',
        image: mapValguero,
        dlcType: 'Official Release'
    },
    'ClubARK_WP': {
        name: 'Club ARK',
        description: 'Social hub featuring mini-games, arenas, and dinosaur racing.',
        color: '#e11d48',
        icon: '🌴',
        size: 'Large (~2 GB)',
        image: mapArkClub,
        dlcType: 'Official Release'
    },
    'LostColony_WP': {
        name: 'Lost Colony',
        description: 'Paid DLC expansion. Explore forgotten celestial outposts and sci-fi hazards.',
        color: '#8b5cf6',
        icon: '🚀',
        size: 'Large (~8 GB)',
        image: mapLostColony,
        dlcType: 'Paid DLC'
    },
    'Astraeos_WP': {
        name: 'Astraeos',
        description: 'Premium community mod map. Dynamic stargates and custom ruins.',
        color: '#ec4899',
        icon: '✨',
        size: 'Large (~7 GB)',
        image: mapAstraeos,
        dlcType: 'Premium Mod'
    },
    'Forglar_WP': {
        name: 'Forglar',
        description: 'Premium community mod map featuring dense fantasy forests and mythical caves.',
        color: '#06b6d4',
        icon: '🌿',
        size: 'Medium (~6 GB)',
        image: mapForglar,
        dlcType: 'Premium Mod'
    },
    'Svartalfheim_WP': {
        name: 'Svartalfheim',
        description: 'Premium dwarf-themed community mod map. Resource rich, no flyers allowed.',
        color: '#0284c7',
        icon: '⛰️',
        size: 'Medium (~5 GB)',
        image: mapSvartalfheim,
        dlcType: 'Premium Mod'
    },
    'Amissa_WP': {
        name: 'Amissa',
        description: 'Premium community mod map. Bounded by majestic floating shrines.',
        color: '#16a34a',
        icon: '🍃',
        size: 'Large (~8 GB)',
        image: mapAmissa,
        dlcType: 'Premium Mod'
    },
    'Insaluna_WP': {
        name: 'Insaluna',
        description: 'Premium community mod map. Deep craters and celestial bioluminescence.',
        color: '#818cf8',
        icon: '🌙',
        size: 'Large (~7 GB)',
        image: mapInsaluna,
        dlcType: 'Premium Mod'
    },
    'TemptressLagoon_WP': {
        name: 'Temptress Lagoon',
        description: 'Premium community mod map. Tropical paradise with volcanic sand beaches.',
        color: '#0ea5e9',
        icon: '🏝️',
        size: 'Medium (~5 GB)',
        image: mapTemptressLagoon,
        dlcType: 'Premium Mod'
    },
    'Reverence_WP': {
        name: 'Reverence',
        description: 'Premium community mod map featuring ancient coliseums and massive arches.',
        color: '#d97706',
        icon: '🏛️',
        size: 'Large (~9 GB)',
        image: mapReverence,
        dlcType: 'Premium Mod'
    },
    'ScorchedEarthRM_WP': {
        name: 'Scorched Earth Reborn',
        description: 'Modded expansion of the Scorched Earth desert with custom biomes and expansions.',
        color: '#f97316',
        icon: '🔥',
        size: 'Large (~6 GB)',
        image: mapScorchedEarth,
        dlcType: 'Modded Expansion'
    },
    'Bjarnheim_WP': {
        name: 'Bjarnheim',
        description: '144km² Nordic fantasy map by Nekatus inspired by Skyrim, featuring Fimbulwinter, custom bosses, and harsh winter biomes.',
        color: '#38bdf8',
        icon: '❄️',
        size: 'Large (~12 GB)',
        image: mapFjordur,
        dlcType: 'CurseForge Mod'
    },
    'Genesis_WP': {
        name: 'Genesis Part 1',
        description: 'Virtual simulation with extreme environments and unique mission biomes.',
        color: '#14b8a6',
        icon: '🧬',
        size: 'Medium (~7 GB)',
        image: mapGenesis,
        dlcType: 'Official Release'
    },
    'Genesis2_WP': {
        name: 'Genesis Part 2',
        description: 'Massive colony spaceship with distinct rings. Coming 2026.',
        color: '#6366f1',
        icon: '🛸',
        size: 'Large (~12 GB)',
        image: mapGenesis2,
        dlcType: 'Upcoming (2026)'
    },
    'Fjordur_WP': {
        name: 'Fjordur',
        description: 'Cold Norse realms with multiple dimensions. Coming 2026.',
        color: '#0ea5e9',
        icon: '❄️',
        size: 'Large (~10 GB)',
        image: mapFjordur,
        dlcType: 'Upcoming (2026)'
    },
    'CrystalIsles_WP': {
        name: 'Crystal Isles',
        description: 'Crystal-infused peaks and colorful floating islands. Coming 2026-2027.',
        color: '#c084fc',
        icon: '💎',
        size: 'Large (~9 GB)',
        image: mapCrystalIsles,
        dlcType: 'Upcoming (2026-2027)'
    },
    'LostIsland_WP': {
        name: 'Lost Island',
        description: 'Massive map featuring diverse biomes and ruins. Coming 2026-2027.',
        color: '#fb923c',
        icon: '🌋',
        size: 'Large (~10 GB)',
        image: mapLostIsland,
        dlcType: 'Upcoming (2026-2027)'
    }
};

// Add modded map entries to MAP_METADATA dynamically
MODDED_MAP_PRESETS.filter(p => p.serverType === 'ASA').forEach(p => {
    MAP_METADATA[p.mapArgument] = {
        name: p.name,
        description: p.description,
        color: p.color,
        icon: p.icon,
        size: p.size,
        image: p.mapArgument === 'ScorchedEarthRM_WP' ? mapScorchedEarth : mapTheIsland, // Use fallback images
        dlcType: p.dlcType,
        author: p.author
    };
});

const TextAreaFieldInput = ({
    field,
    value,
    onChange,
    containerClassName,
    labelContent,
    t
}: {
    field: ConfigField,
    value: string,
    onChange: (val: string) => void,
    containerClassName: string,
    labelContent: React.ReactNode,
    t: any
}) => {
    const [customColor, setCustomColor] = useState('#e2a85c');
    const [showGradientBuilder, setShowGradientBuilder] = useState(false);
    const [gradientText, setGradientText] = useState('');
    const [gradColor1, setGradColor1] = useState('#f59e0b');
    const [gradColor2, setGradColor2] = useState('#3b82f6');
    const [gradMode, setGradMode] = useState<'char' | 'word'>('char');

    const hexToArkColor = (hex: string): string => {
        const cleanHex = hex.replace(/^#/, '');
        if (cleanHex.length !== 6) return '1,1,1,1';
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
        return `${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},1`;
    };

    const interpolateHex = (color1: string, color2: string, ratio: number): string => {
        const c1 = color1.replace('#', '');
        const c2 = color2.replace('#', '');
        const r1 = parseInt(c1.substring(0, 2), 16);
        const g1 = parseInt(c1.substring(2, 4), 16);
        const b1 = parseInt(c1.substring(4, 6), 16);
        const r2 = parseInt(c2.substring(0, 2), 16);
        const g2 = parseInt(c2.substring(2, 4), 16);
        const b2 = parseInt(c2.substring(4, 6), 16);

        const r = Math.round(r1 + (r2 - r1) * ratio);
        const g = Math.round(g1 + (g2 - g1) * ratio);
        const b = Math.round(b1 + (b2 - b1) * ratio);

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    const interpolateColors = (color1: string, color2: string, steps: number): string[] => {
        const c1 = color1.replace('#', '');
        const c2 = color2.replace('#', '');
        const r1 = parseInt(c1.substring(0, 2), 16);
        const g1 = parseInt(c1.substring(2, 4), 16);
        const b1 = parseInt(c1.substring(4, 6), 16);
        const r2 = parseInt(c2.substring(0, 2), 16);
        const g2 = parseInt(c2.substring(2, 4), 16);
        const b2 = parseInt(c2.substring(4, 6), 16);

        const colors = [];
        for (let i = 0; i < steps; i++) {
            const ratio = steps > 1 ? i / (steps - 1) : 0.5;
            const r = (r1 + (r2 - r1) * ratio) / 255;
            const g = (g1 + (g2 - g1) * ratio) / 255;
            const b = (b1 + (b2 - b1) * ratio) / 255;
            colors.push(`${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},1`);
        }
        return colors;
    };

    const insertColorTag = (colorStr: string) => {
        const textarea = document.getElementById(`textarea-asa-${field.key}`) as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = String(value);
        const selectedText = currentText.substring(start, end);

        const replacement = `<RichColor Color="${colorStr}">${selectedText || 'Text'}</>`;
        const newText = currentText.substring(0, start) + replacement + currentText.substring(end);

        onChange(newText);

        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + `<RichColor Color="${colorStr}">`.length + (selectedText ? selectedText.length : 4);
            textarea.setSelectionRange(
                selectedText ? newCursorPos : start + `<RichColor Color="${colorStr}">`.length,
                selectedText ? newCursorPos : start + `<RichColor Color="${colorStr}">`.length + 4
            );
        }, 50);
    };

    const insertNewline = () => {
        const textarea = document.getElementById(`textarea-asa-${field.key}`) as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = String(value);

        const newText = currentText.substring(0, start) + '\\n' + currentText.substring(end);
        onChange(newText);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 2, start + 2);
        }, 50);
    };

    const generateGradientTags = (): string => {
        if (!gradientText) return '';

        if (gradMode === 'char') {
            const chars = Array.from(gradientText);
            const colors = interpolateColors(gradColor1, gradColor2, chars.length);
            return chars.map((char, i) => {
                if (char === ' ') return ' ';
                return `<RichColor Color="${colors[i]}">${char}</>`;
            }).join('');
        } else {
            const words = gradientText.split(' ');
            const colors = interpolateColors(gradColor1, gradColor2, words.length);
            return words.map((word, i) => {
                return `<RichColor Color="${colors[i]}">${word}</>`;
            }).join(' ');
        }
    };

    const insertGradientTag = () => {
        const generated = generateGradientTags();
        if (!generated) return;

        const textarea = document.getElementById(`textarea-asa-${field.key}`) as HTMLTextAreaElement;
        if (!textarea) {
            onChange(String(value) + generated);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = String(value);

        const newText = currentText.substring(0, start) + generated + currentText.substring(end);
        onChange(newText);
        setShowGradientBuilder(false);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + generated.length, start + generated.length);
        }, 50);
    };

    const renderGradPreview = () => {
        if (!gradientText) return null;
        if (gradMode === 'char') {
            const chars = Array.from(gradientText);
            return chars.map((char, i) => {
                const ratio = chars.length > 1 ? i / (chars.length - 1) : 0.5;
                const style = { color: interpolateHex(gradColor1, gradColor2, ratio) };
                return (
                    <span key={i} style={style}>
                        {char}
                    </span>
                );
            });
        } else {
            const words = gradientText.split(' ');
            return words.map((word, i) => {
                const ratio = words.length > 1 ? i / (words.length - 1) : 0.5;
                const style = { color: interpolateHex(gradColor1, gradColor2, ratio) };
                return (
                    <span key={i} style={style} className="mr-1">
                        {word}
                    </span>
                );
            });
        }
    };

    const renderMotdPreview = (text: string) => {
        if (!text) return <span className="text-slate-500 italic text-xs">{t('configEditor.motd.noMessage', 'No message entered yet.')}</span>;

        const lines = text.split('\\n');

        return lines.map((line, lineIdx) => {
            const elements: React.ReactNode[] = [];
            const regex = /<RichColor\s+Color="([^"]+)">([\s\S]*?)<\/>/gi;
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(line)) !== null) {
                const matchIndex = match.index;
                if (matchIndex > lastIndex) {
                    elements.push(<span key={lastIndex}>{line.substring(lastIndex, matchIndex)}</span>);
                }

                const colorParts = match[1].split(',').map(c => parseFloat(c.trim()));
                const textVal = match[2];

                if (colorParts.length >= 3) {
                    const r = Math.round((colorParts[0] || 0) * 255);
                    const g = Math.round((colorParts[1] || 0) * 255);
                    const b = Math.round((colorParts[2] || 0) * 255);
                    const a = colorParts[3] !== undefined ? colorParts[3] : 1;
                    const style = { color: `rgba(${r}, ${g}, ${b}, ${a})` };

                    elements.push(
                        <span key={matchIndex} style={style} className="font-bold">
                            {textVal}
                        </span>
                    );
                } else {
                    elements.push(<span key={matchIndex}>{match[0]}</span>);
                }

                lastIndex = regex.lastIndex;
            }

            if (lastIndex < line.length) {
                elements.push(<span key={lastIndex}>{line.substring(lastIndex)}</span>);
            }

            return (
                <div key={lineIdx} className="min-h-[1.2em]">
                    {elements.length > 0 ? elements : <span className="opacity-0">.</span>}
                </div>
            );
        });
    };

    return (
        <div className="col-span-1 md:col-span-2 lg:col-span-2 animate-fadeIn">
            <div className={containerClassName}>
                {labelContent}
                <div className="w-full flex flex-col gap-2 mt-2">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2 bg-[#0e0e1a]/80 p-2.5 rounded-t-xl border-2 border-b-0 border-[#2d2d44]">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none mr-1">{t('configEditor.motd.colors', 'Colors:')}</span>
                        {[
                            { name: 'Red', label: t('configEditor.motd.colorNames.red', 'Red'), color: '1,0,0,1', bg: 'bg-red-500' },
                            { name: 'Green', label: t('configEditor.motd.colorNames.green', 'Green'), color: '0,1,0,1', bg: 'bg-emerald-500' },
                            { name: 'Blue', label: t('configEditor.motd.colorNames.blue', 'Blue'), color: '0,0.5,1,1', bg: 'bg-blue-500' },
                            { name: 'Yellow', label: t('configEditor.motd.colorNames.yellow', 'Yellow'), color: '1,1,0,1', bg: 'bg-amber-400' },
                            { name: 'Orange', label: t('configEditor.motd.colorNames.orange', 'Orange'), color: '1,0.65,0,1', bg: 'bg-orange-500' },
                            { name: 'Cyan', label: t('configEditor.motd.colorNames.cyan', 'Cyan'), color: '0,1,1,1', bg: 'bg-cyan-400' },
                            { name: 'White', label: t('configEditor.motd.colorNames.white', 'White'), color: '1,1,1,1', bg: 'bg-white' },
                        ].map(c => (
                            <button
                                key={c.name}
                                type="button"
                                onClick={() => insertColorTag(c.color)}
                                className={`w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm ${c.bg}`}
                                title={t('configEditor.motd.formatSelection', { defaultValue: 'Format selection to {{color}}', color: c.label })}
                            />
                        ))}

                        {/* Custom Color Picker */}
                        <label
                            className="w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm cursor-pointer flex items-center justify-center relative"
                            style={{ background: 'linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)' }}
                            title={t('configEditor.motd.customColor', 'Choose custom color')}
                        >
                            <input
                                type="color"
                                value={customColor}
                                onChange={(e) => {
                                    const arkColor = hexToArkColor(e.target.value);
                                    insertColorTag(arkColor);
                                    setCustomColor(e.target.value);
                                }}
                                className="sr-only opacity-0 absolute w-0 h-0 cursor-pointer"
                            />
                        </label>

                        <div className="h-4 w-px bg-slate-800 mx-1" />

                        <button
                            type="button"
                            onClick={insertNewline}
                            className="px-2.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/5 text-[10px] font-bold transition-colors"
                            title={t('configEditor.motd.insertNewlineTitle', 'Insert literal newline \\n tag')}
                        >
                            {t('configEditor.motd.newLine', '+ New Line (\\n)')}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                const textarea = document.getElementById(`textarea-asa-${field.key}`) as HTMLTextAreaElement;
                                if (textarea) {
                                    const selected = String(value).substring(textarea.selectionStart, textarea.selectionEnd);
                                    if (selected) {
                                        setGradientText(selected);
                                    }
                                }
                                setShowGradientBuilder(!showGradientBuilder);
                            }}
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${showGradientBuilder ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-white/5'}`}
                            title={t('configEditor.motd.gradientBuilderTitle', 'Create beautiful multi-color gradient text')}
                        >
                            🎨 {t('configEditor.motd.gradientBuilder', 'Gradient Builder')}
                        </button>
                    </div>

                    {/* Gradient Builder Panel */}
                    {showGradientBuilder && (
                        <div className="flex flex-col gap-3 bg-[#0f0f20]/90 p-3.5 rounded-lg border-2 border-[#2d2d44] mb-2 text-left animate-fadeIn">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-orange-400">{t('configEditor.motd.gradientTitle', 'Multi-Color Gradient Builder')}</span>
                                <span className="text-[10px] text-slate-500">{t('configEditor.motd.gradientSubtitle', 'Generates ArkML color codes dynamically')}</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Input Text */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">{t('configEditor.motd.textToColorize', 'Text to Colorize')}</label>
                                    <input
                                        type="text"
                                        value={gradientText}
                                        onChange={e => setGradientText(e.target.value)}
                                        placeholder={t('configEditor.motd.gradientPlaceholder', 'Enter text to make gradient...')}
                                        className="px-3 py-1.5 bg-[#080812] border border-[#2d2d44] rounded-lg text-xs text-white focus:outline-none focus:border-orange-500/50"
                                    />
                                </div>

                                {/* Mode & Colors */}
                                <div className="flex items-end gap-3">
                                    {/* Colors */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">{t('configEditor.motd.colorsStartEnd', 'Colors (Start → End)')}</label>
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <label className="w-8 h-8 rounded-lg border border-[#2d2d44] hover:border-slate-650 transition-all shadow-sm cursor-pointer flex items-center justify-center border-dashed" style={{ backgroundColor: gradColor1 }}>
                                                    <input type="color" value={gradColor1} onChange={e => setGradColor1(e.target.value)} className="sr-only opacity-0 absolute w-0 h-0" />
                                                </label>
                                            </div>
                                            <span className="text-slate-500 text-xs">→</span>
                                            <div className="relative">
                                                <label className="w-8 h-8 rounded-lg border border-[#2d2d44] hover:border-slate-650 transition-all shadow-sm cursor-pointer flex items-center justify-center border-dashed" style={{ backgroundColor: gradColor2 }}>
                                                    <input type="color" value={gradColor2} onChange={e => setGradColor2(e.target.value)} className="sr-only opacity-0 absolute w-0 h-0" />
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mode Toggle */}
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">{t('configEditor.motd.spreadMode', 'Spread Mode')}</label>
                                        <div className="flex rounded-lg overflow-hidden border border-[#2d2d44] bg-[#080812] p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setGradMode('char')}
                                                className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${gradMode === 'char' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                {t('configEditor.motd.smooth', 'Smooth (Letter)')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGradMode('word')}
                                                className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${gradMode === 'word' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                {t('configEditor.motd.bold', 'Bold (Word)')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Preview */}
                            {gradientText && (
                                <div className="flex flex-col gap-1 bg-[#080812] p-2.5 rounded-lg border border-[#2d2d44]">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('configEditor.motd.livePreview', 'Live Builder Preview')}</span>
                                    <div className="text-sm font-semibold tracking-wide flex flex-wrap select-none">
                                        {renderGradPreview()}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-2 mt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowGradientBuilder(false)}
                                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-350 text-xs font-medium transition-colors border border-white/5"
                                >
                                    {t('common.cancel', 'Cancel')}
                                </button>
                                <button
                                    type="button"
                                    disabled={!gradientText}
                                    onClick={insertGradientTag}
                                    className="px-3 py-1 rounded bg-orange-500 hover:bg-orange-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-orange-500/20"
                                >
                                    {t('configEditor.motd.insertGradient', 'Insert Gradient')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Text Area */}
                    <textarea
                        id={`textarea-asa-${field.key}`}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={t('configEditor.placeholders.enterValues')}
                        rows={5}
                        className="w-full bg-[#1a1a2e] border-2 border-t-0 border-[#2d2d44] rounded-b-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:shadow-[0_0_15px_rgba(249,115,22,0.2)] font-mono text-sm min-h-[120px] transition-all placeholder-slate-500 resize-y"
                    />

                    {/* Real-time Game Preview */}
                    <div className="mt-1 flex flex-col gap-1.5 bg-[#0a0a14]/60 border-2 border-[#2d2d44] rounded-2xl p-4 text-left">
                        <div className="text-[10px] uppercase font-black text-slate-400 tracking-wider flex items-center justify-between">
                            <span>{t('configEditor.motd.broadcastPreview', 'In-Game Broadcast Preview')}</span>
                            <span className="text-[8px] bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold px-1.5 py-0.5 rounded">{t('configEditor.motd.realTime', 'Real-Time')}</span>
                        </div>
                        <div className="text-sm font-semibold tracking-wide leading-relaxed p-2.5 rounded-xl bg-black/40 border border-[#2d2d44] font-sans break-words select-none max-h-[150px] overflow-y-auto custom-scrollbar text-left">
                            {renderMotdPreview(value)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MapSelectorDropdown = ({
    value,
    dropdownValue,
    selectedMapMeta,
    selectedOption,
    groupedOptions,
    handleChange,
    matchedInstalledMod,
}: {
    value: string;
    dropdownValue: string;
    selectedMapMeta: MapInfo | undefined;
    selectedOption: any;
    groupedOptions: Record<string, any[]>;
    handleChange: (val: string) => void;
    matchedInstalledMod?: ModInfo;
}) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const mapButtonRef = useRef<HTMLButtonElement>(null);
    const mapListRef = useRef<HTMLDivElement>(null);
    const [mapDropdownPos, setMapDropdownPos] = useState({ top: 0, left: 0, width: 0 });

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const insideButton = dropdownRef.current?.contains(target);
            const insideList = mapListRef.current?.contains(target);
            if (!insideButton && !insideList) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Recalculate dropdown position whenever isOpen becomes true or window resizes/scrolls
    useEffect(() => {
        if (isOpen && mapButtonRef.current) {
            const updatePosition = () => {
                const rect = mapButtonRef.current!.getBoundingClientRect();
                setMapDropdownPos({
                    top: rect.bottom + 8,
                    left: rect.left,
                    width: rect.width
                });
            };
            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);
            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, true);
            };
        }
    }, [isOpen]);

    return (
        <div ref={dropdownRef} className={cn("relative z-20", isOpen ? "z-30" : "z-20")}>
            {/* Custom Select Button */}
            <button
                ref={mapButtonRef}
                type="button"
                onClick={() => {
                    setIsOpen(!isOpen);
                }}
                className="w-full flex items-center justify-between bg-[var(--input-background)] border border-[var(--input-border)] hover:border-violet-500/50 rounded-xl px-4 py-3 text-[var(--text-primary)] transition-all focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] text-left cursor-pointer"
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl flex-shrink-0">
                        {matchedInstalledMod ? '📦' : selectedMapMeta ? selectedMapMeta.icon : (dropdownValue === '__CUSTOM__' ? '✏️' : '🗺️')}
                    </span>
                    <div className="min-w-0">
                        <div className="font-semibold text-[var(--text-primary)] leading-tight truncate">
                            {matchedInstalledMod
                                ? matchedInstalledMod.name
                                : (dropdownValue === '__CUSTOM__'
                                    ? (value || t('configEditor.map.customMap', 'Custom Map'))
                                    : (selectedMapMeta ? selectedMapMeta.name : (selectedOption ? selectedOption.label.replace(/^[^\s]+\s+/, '') : value || t('configEditor.map.customMap', 'Custom Map'))))}
                        </div>
                        <div className="text-[10px] text-violet-400 font-medium tracking-wider uppercase mt-0.5 truncate flex items-center gap-1.5">
                            {matchedInstalledMod ? (
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    {t('configEditor.map.installedModMapId', { defaultValue: 'Installed Mod Map • ID: {{id}}', id: matchedInstalledMod.id })}
                                </span>
                            ) : dropdownValue === '__CUSTOM__' ? (
                                value ? t('configEditor.map.customModMap', 'Custom Mod Map') : t('configEditor.map.customMapArgument', 'Custom Map Argument')
                            ) : selectedMapMeta ? (
                                selectedMapMeta.author ? `${mapDlcLabel(t, selectedMapMeta.dlcType)} • ${t('configEditor.map.byAuthor', { defaultValue: 'By {{author}}', author: selectedMapMeta.author })}` : mapDlcLabel(t, selectedMapMeta.dlcType)
                            ) : (
                                t('configEditor.map.officialMap', 'Official Map')
                            )}
                        </div>
                    </div>
                </div>
                {isOpen ? <ChevronUp className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0" />}
            </button>

            {/* Grouped Dropdown Options List — fixed so it escapes overflow:hidden/scroll ancestors */}
            {isOpen && createPortal(
                <div
                    ref={mapListRef}
                    className="fixed bg-[var(--card-background)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden max-h-[380px] overflow-y-auto backdrop-blur-md transition-all duration-200 z-[150] custom-scrollbar p-1.5 space-y-3"
                    style={{ top: mapDropdownPos.top, left: mapDropdownPos.left, width: mapDropdownPos.width }}
                >

                    {/* Installed Mod Maps */}
                    {groupedOptions.installed && groupedOptions.installed.length > 0 && (
                        <div className="space-y-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center justify-between select-none">
                                <div className="flex items-center gap-1.5">
                                    <Package className="w-3.5 h-3.5 text-emerald-400" /> {t('configEditor.map.groups.installed', 'Installed Mod Maps')}
                                </div>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                    {t('configEditor.map.detected', { defaultValue: '{{count}} detected', count: groupedOptions.installed.length })}
                                </span>
                            </div>
                            <div className="space-y-1">
                                {groupedOptions.installed.map(opt => {
                                    const isSelected = dropdownValue.toLowerCase() === opt.value.toLowerCase() || value.toLowerCase() === opt.value.toLowerCase();
                                    const mod = opt.mod as ModInfo | undefined;
                                    const meta = MAP_METADATA[opt.value];
                                    const thumbnail = mod?.thumbnailUrl || meta?.image;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                handleChange(opt.value);
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-sm transition-all duration-150 border gap-3 cursor-pointer",
                                                isSelected
                                                    ? "bg-emerald-600/25 border-emerald-500/60 text-[var(--text-primary)] font-medium shadow-sm"
                                                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border-transparent hover:text-[var(--text-primary)] hover:border-[var(--border)]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {thumbnail ? (
                                                    <div className="w-14 h-9 rounded-md overflow-hidden relative border border-emerald-500/30 flex-shrink-0 bg-slate-950">
                                                        <img
                                                            src={thumbnail}
                                                            alt={opt.label}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => {
                                                                (e.currentTarget as HTMLElement).style.display = 'none';
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                                    </div>
                                                ) : (
                                                    <div className="w-14 h-9 rounded-md border border-emerald-500/30 flex-shrink-0 bg-emerald-950/40 flex items-center justify-center text-emerald-400">
                                                        <Package className="w-5 h-5" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                                                        <span className="truncate">{opt.label}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                                                        <span className="font-mono text-emerald-400/90">{opt.value}</span>
                                                        {mod?.id && (
                                                            <>
                                                                <span className="w-1 h-1 rounded-full bg-slate-600" />
                                                                <span>{t('configEditor.map.modId', { defaultValue: 'Mod ID: {{id}}', id: mod.id })}</span>
                                                            </>
                                                        )}
                                                        {mod?.author && (
                                                            <>
                                                                <span className="w-1 h-1 rounded-full bg-slate-600" />
                                                                <span className="text-emerald-400 font-medium">{t('configEditor.map.byAuthor', { defaultValue: 'By {{author}}', author: mod.author })}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                                                    {t('configEditor.map.installed', 'Installed')}
                                                </span>
                                                {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Released/Official Maps */}
                    {groupedOptions.released && groupedOptions.released.length > 0 && (
                        <div className="space-y-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg flex items-center gap-1.5 select-none">
                                <Globe className="w-3 h-3 text-emerald-400" /> {t('configEditor.map.groups.released', 'Official Release Maps')}
                            </div>
                            <div className="space-y-1">
                                {groupedOptions.released.map(opt => {
                                    const isSelected = dropdownValue.toLowerCase() === opt.value.toLowerCase() || value.toLowerCase() === opt.value.toLowerCase();
                                    const meta = MAP_METADATA[opt.value];
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                handleChange(opt.value);
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-sm transition-all duration-150 border gap-3 cursor-pointer",
                                                isSelected
                                                    ? "bg-violet-600/25 border-violet-500/60 text-[var(--text-primary)] font-medium shadow-sm"
                                                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border-transparent hover:text-[var(--text-primary)] hover:border-[var(--border)]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {meta?.image && (
                                                    <div className="w-14 h-9 rounded-md overflow-hidden relative border border-[var(--border)] flex-shrink-0 bg-slate-950">
                                                        <img
                                                            src={meta.image}
                                                            alt={meta.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                                                        <span className="text-base flex-shrink-0">{meta?.icon || '🏝️'}</span>
                                                        <span className="truncate">{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                                                        <span>{meta?.size ? mapSizeLabel(t, meta.size) : t('configEditor.map.unknownSize', 'Unknown Size')}</span>
                                                        {meta?.author && (
                                                            <>
                                                                <span className="w-1 h-1 rounded-full bg-slate-650" />
                                                                <span className="text-violet-400 font-semibold">{t('configEditor.map.byAuthor', { defaultValue: 'By {{author}}', author: meta.author })}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {meta?.dlcType && (
                                                    <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-800 border border-white/5 text-slate-350">
                                                        {mapDlcLabel(t, meta.dlcType)}
                                                    </span>
                                                )}
                                                {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Premium Mod Maps */}
                    {groupedOptions.premium && groupedOptions.premium.length > 0 && (
                        <div className="space-y-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/40 border border-[#2d2d44]/30 rounded-lg flex items-center gap-1.5 select-none">
                                <Sparkles className="w-3 h-3 text-pink-400" /> {t('configEditor.map.groups.premium', 'Premium Mod Maps')}
                            </div>
                            <div className="space-y-1">
                                {groupedOptions.premium.map(opt => {
                                    const isSelected = dropdownValue.toLowerCase() === opt.value.toLowerCase() || value.toLowerCase() === opt.value.toLowerCase();
                                    const meta = MAP_METADATA[opt.value];
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                handleChange(opt.value);
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-sm transition-all duration-150 border gap-3",
                                                isSelected
                                                    ? "bg-violet-600/25 border-violet-500/60 text-white font-medium shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                                                    : "text-slate-300 hover:bg-[#1c1c38]/80 border-transparent hover:text-white hover:border-[#2d2d44]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {meta?.image && (
                                                    <div className="w-14 h-9 rounded-md overflow-hidden relative border border-slate-700/40 flex-shrink-0 bg-slate-950">
                                                        <img
                                                            src={meta.image}
                                                            alt={meta.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                                                        <span className="text-base flex-shrink-0">{meta?.icon || '✨'}</span>
                                                        <span className="truncate">{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                                                        <span>{meta?.size ? mapSizeLabel(t, meta.size) : t('configEditor.map.unknownSize', 'Unknown Size')}</span>
                                                        {meta?.author && (
                                                            <>
                                                                <span className="w-1 h-1 rounded-full bg-slate-650" />
                                                                <span className="text-pink-400 font-semibold">{t('configEditor.map.byAuthor', { defaultValue: 'By {{author}}', author: meta.author })}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {meta?.dlcType && (
                                                    <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-800 border border-white/5 text-slate-350">
                                                        {mapDlcLabel(t, meta.dlcType)}
                                                    </span>
                                                )}
                                                {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Modded Expansion Maps */}
                    {groupedOptions.modded && groupedOptions.modded.length > 0 && (
                        <div className="space-y-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/40 border border-[#2d2d44]/30 rounded-lg flex items-center gap-1.5 select-none">
                                <Compass className="w-3 h-3 text-orange-400" /> {t('configEditor.map.groups.modded', 'Modded Expansion Maps')}
                            </div>
                            <div className="space-y-1">
                                {groupedOptions.modded.map(opt => {
                                    const isSelected = dropdownValue.toLowerCase() === opt.value.toLowerCase() || value.toLowerCase() === opt.value.toLowerCase();
                                    const meta = MAP_METADATA[opt.value];
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                handleChange(opt.value);
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-sm transition-all duration-150 border gap-3",
                                                isSelected
                                                    ? "bg-violet-600/25 border-violet-500/60 text-white font-medium shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                                                    : "text-slate-300 hover:bg-[#1c1c38]/80 border-transparent hover:text-white hover:border-[#2d2d44]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {meta?.image && (
                                                    <div className="w-14 h-9 rounded-md overflow-hidden relative border border-slate-700/40 flex-shrink-0 bg-slate-950">
                                                        <img
                                                            src={meta.image}
                                                            alt={meta.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                                                        <span className="text-base flex-shrink-0">{meta?.icon || '🔥'}</span>
                                                        <span className="truncate">{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                                                        <span>{meta?.size ? mapSizeLabel(t, meta.size) : t('configEditor.map.unknownSize', 'Unknown Size')}</span>
                                                        {meta?.author && (
                                                            <>
                                                                <span className="w-1 h-1 rounded-full bg-slate-650" />
                                                                <span className="text-orange-400 font-semibold">{t('configEditor.map.byAuthor', { defaultValue: 'By {{author}}', author: meta.author })}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {meta?.dlcType && (
                                                    <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-800 border border-white/5 text-slate-355">
                                                        {mapDlcLabel(t, meta.dlcType)}
                                                    </span>
                                                )}
                                                {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Upcoming Maps */}
                    {groupedOptions.upcoming && groupedOptions.upcoming.length > 0 && (
                        <div className="space-y-1">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/40 border border-[#2d2d44]/30 rounded-lg flex items-center gap-1.5 select-none">
                                <Clock className="w-3 h-3 text-amber-400 animate-pulse" /> {t('configEditor.map.groups.upcoming', 'Upcoming Maps (Soon)')}
                            </div>
                            <div className="space-y-1">
                                {groupedOptions.upcoming.map(opt => {
                                    const isSelected = dropdownValue.toLowerCase() === opt.value.toLowerCase() || value.toLowerCase() === opt.value.toLowerCase();
                                    const meta = MAP_METADATA[opt.value];
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                handleChange(opt.value);
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-sm transition-all duration-150 border gap-3",
                                                isSelected
                                                    ? "bg-violet-600/25 border-violet-500/60 text-white font-medium shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                                                    : "text-slate-300 hover:bg-[#1c1c38]/80 border-transparent hover:text-white hover:border-[#2d2d44]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {meta?.image && (
                                                    <div className="w-14 h-9 rounded-md overflow-hidden relative border border-slate-700/40 flex-shrink-0 bg-slate-950">
                                                        <img
                                                            src={meta.image}
                                                            alt={meta.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                                                        <span className="text-base flex-shrink-0">{meta?.icon || '🧬'}</span>
                                                        <span className="truncate">{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                                                        <span>{meta?.size ? mapSizeLabel(t, meta.size) : t('configEditor.map.unknownSize', 'Unknown Size')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {meta?.dlcType && (
                                                    <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-800 border border-white/5 text-slate-355">
                                                        {mapDlcLabel(t, meta.dlcType)}
                                                    </span>
                                                )}
                                                {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Custom option */}
                    {groupedOptions.custom && groupedOptions.custom.length > 0 && (
                        <div className="border-t border-[#2d2d44]/35 pt-2">
                            <div className="space-y-1">
                                {groupedOptions.custom.map(opt => {
                                    const isSelected = dropdownValue === '__CUSTOM__';
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                handleChange('__CUSTOM__');
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-sm transition-all duration-150 border gap-3",
                                                isSelected
                                                    ? "bg-amber-600/25 border-amber-500/60 text-white font-medium shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                                                    : "text-slate-300 hover:bg-[#1c1c38]/80 border-transparent hover:text-white hover:border-[#2d2d44]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-14 h-9 rounded-md border border-slate-700/40 flex-shrink-0 bg-slate-950 flex items-center justify-center text-slate-500">
                                                    <span className="text-base">✏️</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-slate-100 truncate">{t(`configEditor.options.MapName.${opt.value}`, { defaultValue: opt.label })}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{t('configEditor.map.specifyCustom', 'Specify a custom map argument')}</div>
                                                </div>
                                            </div>
                                            {isSelected && <Check className="w-4 h-4 text-amber-500" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

// Field Render Component
// Field Render Component - Memoized to prevent re-renders of all fields on single keypress
const NUMERIC = /^-?\d+(\.\d+)?$/;
/** INI values are equal if they match as numbers ("2" == "2.000000") or case-insensitively ("True" == "true") */
export const sameIniValue = (a: string, b: string) => {
    const x = a.trim(), y = b.trim();
    if (NUMERIC.test(x) && NUMERIC.test(y)) return parseFloat(x) === parseFloat(y);
    return x.toLowerCase() === y.toLowerCase();
};

type IniFile = 'GameUserSettings' | 'Game';
type IniMaps = Record<IniFile, Map<string, Map<string, string>> | CaseInsensitiveMap<CaseInsensitiveMap<string>>>;

interface PendingChange {
    file: IniFile;
    section: string;
    key: string;
    /** undefined = key not in the file yet */
    oldValue?: string;
    newValue: string;
}

/** Keys whose value differs from what is saved on disk (empty values are not written, so skipped) */
export const computeConfigChanges = (current: IniMaps, saved: IniMaps): PendingChange[] => {
    const changes: PendingChange[] = [];
    for (const file of ['GameUserSettings', 'Game'] as IniFile[]) {
        for (const [section, values] of current[file]) {
            for (const [key, newValue] of values) {
                if (newValue === undefined || newValue === null || newValue.trim() === '') continue;
                const oldValue = saved[file].get(section)?.get(key);
                if (oldValue !== undefined && sameIniValue(oldValue, newValue)) continue;
                changes.push({ file, section, key, oldValue, newValue });
            }
        }
    }
    return changes;
};

// Multi-line (repeated key) values are summarized, long ones truncated
const describeIniValue = (v: string | undefined, entriesLabel: (count: number) => string) => {
    if (v === undefined) return null;
    const lines = v.split('\n').filter(l => l.trim());
    if (lines.length > 1) return entriesLabel(lines.length);
    return v.length > 60 ? `${v.slice(0, 60)}…` : v;
};

function SaveChangesDialog({ changes, onCancel, onConfirm }: { changes: PendingChange[]; onCancel: () => void; onConfirm: () => void }) {
    const { t } = useTranslation();
    const entriesLabel = (count: number) => t('configEditor.saveDialog.entries', { count, defaultValue: '{{count}} entries' });
    const labels = useMemo(() => {
        const map = new Map<string, string>();
        for (const cat of getAllCategories()) for (const g of cat.groups) for (const f of g.fields) {
            map.set(f.key.toLowerCase(), t(`configEditor.fields.${f.key}.label`, { defaultValue: f.label }));
        }
        return map;
    }, [t]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onConfirm();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel, onConfirm]);

    const byFile = (['GameUserSettings', 'Game'] as IniFile[])
        .map(file => ({ file, items: changes.filter(c => c.file === file) }))
        .filter(g => g.items.length > 0);

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                <div className="px-5 py-4 border-b border-[var(--border)]">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Save className="w-5 h-5 text-violet-400" />
                        {t('configEditor.saveDialog.title', { count: changes.length, defaultValue: 'Save {{count}} changes?' })}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{t('configEditor.saveDialog.subtitle', 'Review what will be written to the INI files.')}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {byFile.map(({ file, items }) => (
                        <div key={file}>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">{file}.ini</div>
                            <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                                {items.map(c => {
                                    const label = labels.get(c.key.toLowerCase());
                                    const oldText = describeIniValue(c.oldValue, entriesLabel);
                                    return (
                                        <div key={`${c.section}.${c.key}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2 bg-[var(--surface-hover)]">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-[var(--text-primary)] truncate">{label ?? c.key}</div>
                                                <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">[{c.section}] {c.key}</div>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                                                {oldText !== null
                                                    ? <span className="text-red-300/80 line-through">{oldText}</span>
                                                    : <span className="text-[var(--text-muted)] italic">{t('configEditor.saveDialog.new', 'new')}</span>}
                                                <span className="text-[var(--text-muted)]">→</span>
                                                <span className="text-emerald-300">{describeIniValue(c.newValue, entriesLabel)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer">{t('common.cancel', 'Cancel')}</button>
                    <button onClick={onConfirm} autoFocus className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center gap-2 cursor-pointer">
                        <Save className="w-4 h-4" /> {t('configEditor.saveDialog.confirm', { count: changes.length, defaultValue: 'Save {{count}} changes' })}
                    </button>
                </div>
            </div>
        </div>
    );
}

const ConfigInput = memo(({
    field,
    value,
    source,
    onFieldChange,
    isModified,
    onFieldReset,
    installedMods,
    selectedServerId,
    onOpenMapHub,
    onRefreshInstalledMods,
    fileValue
}: {
    field: ConfigField,
    value: string,
    source: 'GameUserSettings' | 'Game',
    onFieldChange: (source: 'GameUserSettings' | 'Game', section: string, key: string, val: string, defaultValue?: string) => void,
    isModified?: boolean,
    onFieldReset?: (source: 'GameUserSettings' | 'Game', section: string, key: string, defaultValue: string) => void,
    installedMods?: ModInfo[],
    selectedServerId?: number | null,
    onOpenMapHub?: () => void,
    onRefreshInstalledMods?: () => Promise<void> | void
    /** Value saved in the INI file on disk (undefined = key absent) */
    fileValue?: string
}) => {
    const { t } = useTranslation();
    const [isInstallingMap, setIsInstallingMap] = useState(false);

    // Edited in the UI but different from what is saved in the file (numbers compared numerically,
    // booleans case-insensitively). A key absent from the file counts as its default value.
    const isUnsaved = !sameIniValue(value, fileValue ?? field.defaultValue ?? "");

    const fieldLabel = t(`configEditor.fields.${field.key}.label`, { defaultValue: field.label });
    const fieldDescription = field.description
        ? t(`configEditor.fields.${field.key}.description`, { defaultValue: field.description })
        : undefined;

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
            label={fieldLabel}
            description={fieldDescription}
            defaultValue={field.defaultValue}
            currentValue={value}
            wikiLink={field.wikiLink}
            iniFile={`${source}.ini`}
            iniSection={field.section}
            iniKey={field.key}
            fileValue={fileValue}
            isUnsaved={isUnsaved}
        >
            <div className="flex items-center gap-2 mb-1">
                <div className="text-[var(--text-primary)] font-medium flex items-center gap-2">
                    {fieldLabel}
                    {isModified && (
                        <span className="w-2 h-2 rounded-full bg-orange-500 shadow-lg shadow-orange-500/50" title={t('configEditor.tooltips.modified')} />
                    )}
                    {isUnsaved && (
                        <span className="w-2 h-2 rounded-full bg-sky-400 shadow-lg shadow-sky-400/50" title={t("configEditor.tooltips.unsaved", "Changed, not saved yet")} />
                    )}
                </div>
                {isModified && onFieldReset && (
                    <button
                        onClick={handleReset}
                        className="p-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        title={t('configEditor.tooltips.reset')}
                    >
                        <RotateCcw className="w-3 h-3" />
                    </button>
                )}
            </div>
        </ConfigTooltip>
    );

    // Container classes computed inline - Theme Native Glassmorphism
    const containerClassName = cn(
        "bg-[var(--surface)] p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.01] group relative overflow-hidden",
        isModified
            ? "border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.2)] hover:shadow-[0_0_30px_rgba(249,115,22,0.35)] bg-orange-500/5"
            : "border-[var(--border)] hover:border-[var(--border-hover)] hover:shadow-lg"
    );

    switch (field.type) {
        case 'slider':
            return (
                <SettingsSlider
                    label={
                        <ConfigTooltip
                            label={fieldLabel}
                            description={fieldDescription}
                            defaultValue={field.defaultValue}
                            currentValue={value}
                            wikiLink={field.wikiLink}
                            iniFile={`${source}.ini`}
                            iniSection={field.section}
                            iniKey={field.key}
                            fileValue={fileValue}
                            isUnsaved={isUnsaved}
                        >
                            <div className="flex items-center gap-2">
                                {fieldLabel}
                                {isModified && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                                {isUnsaved && <span className="w-2 h-2 rounded-full bg-sky-400" title={t("configEditor.tooltips.unsaved", "Changed, not saved yet")} />}
                                {isModified && onFieldReset && (
                                    <button onClick={(e) => { e.stopPropagation(); handleReset(); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                        <RotateCcw className="w-3 h-3 text-slate-400 hover:text-white" />
                                    </button>
                                )}
                            </div>
                        </ConfigTooltip>
                    }
                    description={fieldDescription}
                    // `|| field.min` used to turn a real 0 into the field minimum
                    value={Number.isFinite(parseFloat(value)) ? parseFloat(value) : (field.min ?? 0)}
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
                            {fieldDescription && <div className="text-sm text-slate-400">{fieldDescription}</div>}
                        </div>
                        <button
                            onClick={() => handleChange(['true', '1'].includes(value.toLowerCase()) ? 'False' : 'True')}
                            className={cn(
                                "relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 mt-1",
                                ['true', '1'].includes(value.toLowerCase())
                                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30"
                                    : "bg-[#2d2d44]"
                            )}
                        >
                            <span
                                className={cn(
                                    "block w-5 h-5 rounded-full bg-white shadow-lg transform transition-all duration-300",
                                    ['true', '1'].includes(value.toLowerCase())
                                        ? "translate-x-8"
                                        : "translate-x-1"
                                )}
                            />
                        </button>
                    </div>
                </div>
            );
        case 'dropdown': {
            const isMapField = field.key === 'MapName';
            const hasCustomOption = field.options?.some(o => o.value === '__CUSTOM__') ?? false;

            // Collect all known/recognized values for this dropdown (supporting case-insensitivity)
            const allKnownValues = useMemo(() => {
                const values = new Set<string>();
                field.options?.forEach(o => {
                    if (o.value !== '__CUSTOM__') {
                        values.add(o.value.toLowerCase().trim());
                    }
                });
                if (isMapField) {
                    (installedMods || []).forEach(m => {
                        const arg = detectMapArgumentFromMod(m);
                        if (arg) values.add(arg.toLowerCase().trim());
                        if (m.id) values.add(m.id.toLowerCase().trim());
                        if (m.name) values.add(m.name.toLowerCase().trim());
                    });
                    ASA_MODDED_MAP_PRESETS.forEach(p => {
                        if (p.mapArgument) values.add(p.mapArgument.toLowerCase().trim());
                        if (p.mapModId) values.add(p.mapModId.toLowerCase().trim());
                    });
                    Object.keys(MAP_METADATA).forEach(k => {
                        values.add(k.toLowerCase().trim());
                    });
                }
                return values;
            }, [isMapField, field.options, installedMods]);

            const isValueKnown = useCallback((val: string) => {
                if (!val) return false;
                return allKnownValues.has(val.toLowerCase().trim());
            }, [allKnownValues]);

            const [isCustomMode, setIsCustomMode] = useState<boolean>(() => {
                return hasCustomOption && !isValueKnown(value);
            });

            const lastKnownValueRef = useRef(value);
            useEffect(() => {
                if (hasCustomOption && value !== lastKnownValueRef.current) {
                    lastKnownValueRef.current = value;
                    if (isValueKnown(value)) {
                        setIsCustomMode(false);
                    } else if (value !== '') {
                        setIsCustomMode(true);
                    }
                }
            }, [value, hasCustomOption, isValueKnown]);

            const isCustomValue = hasCustomOption && (isCustomMode || !isValueKnown(value));
            const dropdownValue = isCustomValue ? '__CUSTOM__' : value;

            const handleDropdownSelect = (selectedVal: string) => {
                if (selectedVal === '__CUSTOM__') {
                    setIsCustomMode(true);
                } else {
                    setIsCustomMode(false);
                    handleChange(selectedVal);
                }
            };

            if (field.key === 'MapName') {
                // Filter installed mods that are likely maps
                const installedModMaps = (installedMods || []).filter(isModLikelyMap);

                // Find currently matched installed mod by value or map argument or ID or name
                const matchedInstalledMod = (installedMods || []).find(m =>
                    m.id === value ||
                    detectMapArgumentFromMod(m).toLowerCase() === value.toLowerCase() ||
                    m.name.toLowerCase() === value.toLowerCase()
                );

                // Find currently selected map metadata
                const selectedMapMeta = MAP_METADATA[value];
                const selectedOption = field.options?.find(o => o.value === dropdownValue);

                // Group options by their group property for premium organization
                // Groups: installed, released, premium, modded, upcoming, custom
                const groupedOptions: Record<string, any[]> = {
                    installed: [],
                    released: [],
                    premium: [],
                    modded: [],
                    upcoming: [],
                    custom: []
                };

                // Add detected installed mod maps to groupedOptions.installed
                const addedInstalledValues = new Set<string>();
                installedModMaps.forEach(mod => {
                    const mapArg = detectMapArgumentFromMod(mod);
                    if (isOfficialMap(mapArg)) return;
                    addedInstalledValues.add(mapArg.toLowerCase());
                    groupedOptions.installed.push({
                        value: mapArg,
                        label: mod.name,
                        group: 'installed',
                        mod: mod
                    });
                });

                field.options?.forEach(opt => {
                    // Don't duplicate if already in installed mod maps unless custom
                    if (addedInstalledValues.has(opt.value.toLowerCase()) && opt.group !== 'custom') {
                        return;
                    }
                    const g = opt.group || 'released';
                    if (groupedOptions[g]) {
                        groupedOptions[g].push(opt);
                    } else {
                        groupedOptions[g] = [opt];
                    }
                });

                const knownModPreset = ASA_MODDED_MAP_PRESETS.find(
                    (p: ModdedMapPreset) => p.mapArgument.toLowerCase() === value.toLowerCase() || p.mapModId === value
                ) || getModdedMapByMapArg(value, 'ASA');

                const isModdedMapNotInstalled = Boolean(
                    !isOfficialMap(value) && !isOfficialMap(dropdownValue) && knownModPreset && !matchedInstalledMod && (installedMods || []).every(m => m.id !== knownModPreset.mapModId && detectMapArgumentFromMod(m).toLowerCase() !== value.toLowerCase())
                );

                return (
                    <div className={containerClassName}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                                {labelContent}
                            </div>
                            {onOpenMapHub && (
                                <button
                                    type="button"
                                    onClick={onOpenMapHub}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 hover:from-violet-600/35 hover:to-indigo-600/35 border border-violet-500/40 hover:border-violet-400 rounded-xl text-xs font-semibold text-violet-300 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                                    title={t('configEditor.map.hubTitle', 'Open Curated Modded Maps Hub: browse popular maps, search CurseForge & 1-click install')}
                                >
                                    <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                                    <span>✨ {t('configEditor.map.hub', 'Modded Maps Hub')}</span>
                                </button>
                            )}
                        </div>

                        <MapSelectorDropdown
                            value={value}
                            dropdownValue={dropdownValue}
                            selectedMapMeta={selectedMapMeta}
                            selectedOption={selectedOption}
                            groupedOptions={groupedOptions}
                            handleChange={handleDropdownSelect}
                            matchedInstalledMod={matchedInstalledMod}
                        />

                        {/* Custom Map Text Input when custom selection or non-predefined map name */}
                        {dropdownValue === '__CUSTOM__' && (
                            <div className="mt-3.5 space-y-2.5 relative z-10 animate-fadeIn bg-[var(--surface-hover)]/40 border border-amber-500/30 rounded-xl p-3.5 backdrop-blur-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Terminal className="w-3.5 h-3.5 text-amber-400" />
                                        <span>{t('configEditor.map.customLaunchArg', 'Custom Map Launch Argument')}</span>
                                    </label>
                                    <span className="text-[10px] text-slate-400 font-mono">{t('configEditor.map.example', 'e.g. MapName_WP')}</span>
                                </div>
                                <input
                                    type="text"
                                    value={value}
                                    onChange={(e) => handleChange(e.target.value)}
                                    placeholder={t('configEditor.map.launchArgPlaceholder', 'Enter map launch argument (e.g. ScorchedEarthRM_WP, CustomMap_WP)')}
                                    autoFocus={!value}
                                    className="w-full bg-[var(--input-background)] border border-amber-500/50 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-[var(--text-primary)] font-mono text-sm transition-all placeholder-[var(--text-muted)] focus:outline-none focus:shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                                />
                                <div className="flex items-center justify-between text-[11px] text-slate-400 gap-2">
                                    <p className="leading-tight">
                                        {t('configEditor.map.exactIdentifier', 'Enter the exact map identifier from the mod (usually ends with')} <code className="text-amber-300 font-mono">_WP</code>).
                                    </p>
                                    {onOpenMapHub && (
                                        <button
                                            type="button"
                                            onClick={onOpenMapHub}
                                            className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                                        >
                                            <Sparkles className="w-3 h-3 text-violet-400" />
                                            <span>{t('configEditor.map.hub', 'Modded Maps Hub')} →</span>
                                        </button>
                                    )}
                                </div>

                                {/* Compact quick-fill chips from installed mods if available */}
                                {installedModMaps.length > 0 && (
                                    <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mr-1">
                                            <Package className="w-3 h-3 text-emerald-400" /> {t('configEditor.map.quickFill', 'Quick-fill installed:')}
                                        </span>
                                        {installedModMaps.map(mod => {
                                            const mapArg = detectMapArgumentFromMod(mod);
                                            const isSelected = value.toLowerCase() === mapArg.toLowerCase();
                                            return (
                                                <button
                                                    key={mod.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setIsCustomMode(true);
                                                        handleChange(mapArg);
                                                    }}
                                                    className={cn(
                                                        "text-[10px] px-2 py-0.5 rounded-md border font-mono transition-all cursor-pointer flex items-center gap-1",
                                                        isSelected
                                                            ? "bg-emerald-500/25 border-emerald-500 text-emerald-300 font-semibold"
                                                            : "bg-slate-900/60 border-slate-700/60 text-slate-300 hover:border-emerald-500/50 hover:text-white"
                                                    )}
                                                    title={`Mod: ${mod.name} (ID: ${mod.id})`}
                                                >
                                                    {isSelected && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                                                    <span>{mod.name}</span>
                                                    <span className="text-[9px] opacity-70">({mapArg})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Real-time Premium Map Preview Card */}
                        <div className="mt-4 relative rounded-xl overflow-hidden border-2 border-[#2d2d44] bg-slate-900 group/card min-h-[190px] flex flex-col justify-end transition-all duration-300 hover:border-violet-500/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] select-none">
                            {selectedMapMeta || matchedInstalledMod || knownModPreset ? (
                                <>
                                    {/* Image background with zoom and transition */}
                                    <img
                                        src={matchedInstalledMod?.thumbnailUrl || selectedMapMeta?.image || mapTheIsland}
                                        alt={matchedInstalledMod?.name || selectedMapMeta?.name || knownModPreset?.name}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-105"
                                        onError={(e) => {
                                            if (selectedMapMeta?.image) {
                                                e.currentTarget.src = selectedMapMeta.image;
                                            }
                                        }}
                                    />
                                    {/* Glassmorphic/gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10" />

                                    {/* Header badges */}
                                    <div className="absolute top-3 right-3 flex gap-1.5 items-center z-10">
                                        {matchedInstalledMod ? (
                                            <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 backdrop-blur-md">
                                                {t('configEditor.map.installedModMap', 'Installed Mod Map')}
                                            </span>
                                        ) : isModdedMapNotInstalled ? (
                                            <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-amber-500/30 border border-amber-400/50 text-amber-300 backdrop-blur-md">
                                                {t('configEditor.map.modNotInstalled', 'Mod Not Installed')}
                                            </span>
                                        ) : (
                                            <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-black/60 border border-white/10 text-slate-300 backdrop-blur-md">
                                                {(selectedMapMeta?.size || knownModPreset?.size) ? mapSizeLabel(t, (selectedMapMeta?.size || knownModPreset?.size) as string) : t('configEditor.map.modMap', 'Mod Map')}
                                            </span>
                                        )}
                                        <span
                                            className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-white backdrop-blur-md"
                                            style={{
                                                backgroundColor: matchedInstalledMod ? '#10b98170' : `${selectedMapMeta?.color || '#8b5cf6'}70`,
                                                border: `1px solid ${matchedInstalledMod ? '#10b981' : (selectedMapMeta?.color || '#8b5cf6')}`
                                            }}
                                        >
                                            {matchedInstalledMod
                                                ? t('configEditor.map.modId', { defaultValue: 'Mod ID: {{id}}', id: matchedInstalledMod.id })
                                                : knownModPreset
                                                    ? t('configEditor.map.modId', { defaultValue: 'Mod ID: {{id}}', id: knownModPreset.mapModId })
                                                    : (selectedMapMeta?.dlcType ? mapDlcLabel(t, selectedMapMeta.dlcType) : '')}
                                        </span>
                                    </div>

                                    {/* Details content */}
                                    <div className="relative p-4 z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">{matchedInstalledMod ? '📦' : selectedMapMeta?.icon || knownModPreset?.icon || '🗺️'}</span>
                                            <h4 className="font-bold text-white text-base leading-tight drop-shadow-md">
                                                {matchedInstalledMod ? matchedInstalledMod.name : (selectedMapMeta?.name || knownModPreset?.name)}
                                            </h4>
                                        </div>
                                        {(matchedInstalledMod?.author || selectedMapMeta?.author || knownModPreset?.author) && (
                                            <div className="text-[10px] text-amber-400 font-semibold mb-1">
                                                {t('configEditor.map.byAuthor', { defaultValue: 'By {{author}}', author: matchedInstalledMod?.author || selectedMapMeta?.author || knownModPreset?.author })}
                                            </div>
                                        )}
                                        <p className="text-xs text-slate-300/90 leading-normal drop-shadow-sm line-clamp-2 mb-2">
                                            {matchedInstalledMod?.description || (selectedMapMeta?.description ? mapDescriptionLabel(t, value, selectedMapMeta.description) : knownModPreset?.description)}
                                        </p>

                                        {/* In-place 1-Click Install Banner when modded map is selected but not yet installed */}
                                        {isModdedMapNotInstalled && knownModPreset && (
                                            <div className="mt-3 p-3 bg-gradient-to-r from-amber-500/20 via-slate-900/95 to-amber-500/10 border border-amber-500/40 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-md shadow-lg animate-in fade-in">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0 text-amber-300">
                                                        <Download className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-amber-200 truncate flex items-center gap-1.5">
                                                            <span>{t('configEditor.map.filesNotInstalled', 'Mod Map files not installed on server')}</span>
                                                            <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 border border-amber-500/30 rounded text-amber-300 font-normal">{t('configEditor.map.required', 'Required')}</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                                            {t('configEditor.map.modIdLabel', 'Mod ID:')} <span className="font-mono text-amber-400 font-bold">{knownModPreset.mapModId}</span> • {t('configEditor.map.creator', { defaultValue: 'Creator: {{author}}', author: knownModPreset.author })}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={isInstallingMap}
                                                    onClick={async () => {
                                                        if (!selectedServerId) {
                                                            toast.error(t('configEditor.toasts.selectServerFirst', 'Please select a server first'));
                                                            return;
                                                        }
                                                        try {
                                                            setIsInstallingMap(true);
                                                            toast.loading(t('configEditor.toasts.installingMod', { defaultValue: 'Installing {{name}}...', name: knownModPreset.name }), { id: `install-${knownModPreset.mapModId}` });
                                                            await installMod(selectedServerId, {
                                                                id: knownModPreset.mapModId || '',
                                                                name: knownModPreset.name,
                                                                description: knownModPreset.description,
                                                                author: knownModPreset.author,
                                                            });
                                                            toast.success(t('configEditor.toasts.installedMod', { defaultValue: 'Installed & configured {{name}}!', name: knownModPreset.name }), { id: `install-${knownModPreset.mapModId}` });
                                                            if (onRefreshInstalledMods) await onRefreshInstalledMods();
                                                        } catch (err: any) {
                                                            toast.error(t('configEditor.toasts.installFailed', { defaultValue: 'Installation failed: {{error}}', error: err?.message || err }), { id: `install-${knownModPreset.mapModId}` });
                                                        } finally {
                                                            setIsInstallingMap(false);
                                                        }
                                                    }}
                                                    className="w-full sm:w-auto flex-shrink-0 px-3.5 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                >
                                                    {isInstallingMap ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                    <span>⚡ {t('configEditor.map.oneClickInstall', '1-Click Install Mod')}</span>
                                                </button>
                                            </div>
                                        )}

                                        {/* Auto-injected indicator */}
                                        {!isOfficialMap(dropdownValue) && ((dropdownValue && getModdedMapByMapArg(dropdownValue, 'ASA')) || matchedInstalledMod) && (
                                            <div className="mt-2 text-[10px] px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium rounded-lg flex items-center gap-1.5 backdrop-blur-md">
                                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                                                <span>
                                                    ✓ {t('configEditor.map.autoLaunchConfig', 'Launch configuration will be set automatically')} (-MapModID={matchedInstalledMod?.id || getModdedMapByMapArg(dropdownValue, 'ASA')?.mapModId})
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Custom/Fallback Map Card design */}
                                    <div className="absolute inset-0 bg-[#121225] flex items-center justify-center">
                                        <div className="absolute inset-0 opacity-10 bg-radial-gradient from-amber-500 to-transparent" />
                                        <MapPin className="w-12 h-12 text-amber-500/20" />
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                                    {/* Header badge */}
                                    <div className="absolute top-3 right-3 z-10">
                                        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/50 text-amber-300 backdrop-blur-md">
                                            {t('configEditor.map.customMap', 'Custom Map')}
                                        </span>
                                    </div>

                                    {/* Details content */}
                                    <div className="relative p-4 z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">✏️</span>
                                            <h4 className="font-bold text-white text-base leading-tight font-mono">{value || t('configEditor.map.customMap', 'Custom Map')}</h4>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-normal">
                                            {value ? t('configEditor.map.customLoaded', 'Custom mod or unofficial map loaded via launch argument.') : t('configEditor.map.selectOrSpecify', 'Please select a map or specify a custom map identifier.')}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        {fieldDescription && <div className="mt-2.5 text-xs text-slate-400">{fieldDescription}</div>}
                    </div>
                );
            }

            // Normal dropdown rendering for other dropdown fields
            return (
                <div className={containerClassName}>
                    {labelContent}
                    <select
                        value={dropdownValue}
                        onChange={(e) => handleDropdownSelect(e.target.value)}
                        className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] cursor-pointer transition-all hover:border-[var(--border-hover)]"
                    >
                        {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[var(--card-background)] text-[var(--text-primary)]">{optionLabel(t, field.key, opt)}</option>
                        ))}
                    </select>
                    {dropdownValue === '__CUSTOM__' && (
                        <div className="mt-3 space-y-2">
                            <label className="text-xs font-semibold text-amber-400 uppercase tracking-wider">{t('configEditor.customValue', 'Custom Value')}</label>
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => handleChange(e.target.value)}
                                className="w-full bg-[var(--input-background)] border border-amber-500/40 rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-amber-500 font-mono text-sm transition-all placeholder-[var(--text-muted)]"
                            />
                        </div>
                    )}
                    {fieldDescription && <div className="mt-2 text-sm text-[var(--text-secondary)]">{fieldDescription}</div>}
                </div>
            );
        }
        case 'array':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <ArrayEditor
                        label={fieldLabel}
                        value={value as string}
                        onChange={handleChange}
                        template={field.template || {}}
                        fieldKey={field.key}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] px-1 italic">
                            {fieldDescription}
                        </div>
                    )}
                </div>
            );
        case 'loot_crates':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <LootCrateEditor
                        value={value as string}
                        onChange={(val: string) => handleChange(val)}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] px-1 italic">
                            {fieldDescription}
                        </div>
                    )}
                </div>
            );
        case 'dino_spawns':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <DinoSpawnEditor
                        value={value as string}
                        onChange={(val: string) => handleChange(val)}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] px-1 italic">
                            {fieldDescription}
                        </div>
                    )}
                </div>
            );
        case 'item_stack_overrides':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <ItemStackEditor
                        value={value}
                        onChange={(val: string) => handleChange(val)}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] px-1 italic">
                            {fieldDescription}
                        </div>
                    )}
                </div>
            );
        case 'crafting_costs':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <CraftingCostEditor
                        value={value}
                        onChange={(val: string) => handleChange(val)}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] px-1 italic">
                            {fieldDescription}
                        </div>
                    )}
                </div>
            );
        case 'engram_entries':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <EngramOverridesEditor
                        value={value}
                        onChange={(val: string) => handleChange(val)}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] px-1 italic">
                            {fieldDescription}
                        </div>
                    )}
                </div>
            );
        case 'engram_points_per_level':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <EngramPointsPerLevelEditor
                        value={value}
                        onChange={(val: string) => handleChange(val)}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-[var(--text-muted)] px-1 italic">
                            {fieldDescription}
                        </div>
                    )}
                </div>
            );
        case 'textarea':
            return (
                <TextAreaFieldInput
                    field={field}
                    value={value}
                    onChange={handleChange}
                    containerClassName={containerClassName}
                    labelContent={labelContent}
                    t={t}
                />
            );
        default:
            return (
                <div className={containerClassName}>
                    {labelContent}
                    {field.type === 'number' ? (
                        <NumberInput
                            value={value}
                            onValueChange={(n) => handleChange(String(n))}
                            className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-orange-500 font-mono transition-all placeholder-[var(--text-muted)]"
                        />
                    ) : (
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => handleChange(e.target.value)}
                            className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-orange-500 font-mono transition-all placeholder-[var(--text-muted)]"
                        />
                    )}
                    {fieldDescription && <div className="mt-2 text-sm text-[var(--text-secondary)]">{fieldDescription}</div>}
                </div>
            );
    }
});

// Translated label for a dropdown option (falls back to the English label from configMappings)
const optionLabel = (t: any, fieldKey: string, opt: { value: string; label: string }) =>
    t(`configEditor.options.${fieldKey}.${opt.value || '_default'}`, { defaultValue: opt.label });

const groupTitleKey = (title: string) =>
    title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/)
        .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join('');

// Lowercase + strip accents so searches match regardless of diacritics ("domesticação" ≈ "domesticacao")
const normalizeSearchText = (text: string) =>
    text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// "TamingSpeedMultiplier" -> "Taming Speed Multiplier", so multi-word queries also match INI keys
const splitCamelCase = (key: string) =>
    key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ');

export default function ConfigEditor() {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const { servers, activeServer } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(() => activeServer?.id || null);

    // Follow the active server only when its *id* changes. Depending on the object itself made the
    // editor jump back to the active server after every refreshServers() (e.g. right after saving),
    // so edits of a non-active server appeared to be wiped.
    const activeServerId = activeServer?.id;
    useEffect(() => {
        if (activeServerId) {
            setSelectedServerId(activeServerId);
        }
    }, [activeServerId]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>('server');
    const [activeFileFilter, setActiveFileFilter] = useState<'GameUserSettings' | 'Game'>('GameUserSettings');
    const [searchQuery, setSearchQuery] = useState('');
    // While searching, clicking a tab in the sidebar narrows the results to that tab
    const [searchScope, setSearchScope] = useState<{ category: string; source: 'GameUserSettings' | 'Game' } | null>(null);
    const [viewMode, setViewMode] = useState<'visual' | 'gus' | 'game' | 'levels' | 'stats' | 'anti-cheat' | 'advanced'>('visual');

    const [customDinoLevel, setCustomDinoLevel] = useState(150);
    const [customPlayerLevel, setCustomPlayerLevel] = useState(105);
    const [copied, setCopied] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(256);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [currentPreset, setCurrentPreset] = useState<string | undefined>();
    const [showPresetHub, setShowPresetHub] = useState(false);
    const [showMapHubModal, setShowMapHubModal] = useState(false);
    const [configReloadTrigger, setConfigReloadTrigger] = useState(0);
    const [modifiedSettings, setModifiedSettings] = useState<Set<string>>(new Set());
    const [installedMods, setInstalledMods] = useState<ModInfo[]>([]);

    // Fetch installed mods for current server to populate modded map options
    useEffect(() => {
        if (!selectedServerId) {
            setInstalledMods([]);
            return;
        }
        let isMounted = true;
        getInstalledMods(selectedServerId)
            .then(mods => {
                if (isMounted) setInstalledMods(mods || []);
            })
            .catch(err => {
                console.error('Failed to load installed mods in ConfigEditor:', err);
                if (isMounted) setInstalledMods([]);
            });
        return () => { isMounted = false; };
    }, [selectedServerId, configReloadTrigger]);

    // Store parsed configs: CaseInsensitiveMap<Section, CaseInsensitiveMap<Key, Value>>
    const [configs, setConfigs] = useState<{
        GameUserSettings: CaseInsensitiveMap<CaseInsensitiveMap<string>> | Map<string, Map<string, string>>,
        Game: CaseInsensitiveMap<CaseInsensitiveMap<string>> | Map<string, Map<string, string>>
    }>({
        GameUserSettings: new CaseInsensitiveMap(),
        Game: new CaseInsensitiveMap()
    });

    // Store raw text for direct editing
    const [rawText, setRawText] = useState({ gus: '', game: '' });

    // INI contents as they are on disk (last load or save) — shown in field tooltips and used to
    // flag fields that were edited but not saved yet
    const [savedConfigs, setSavedConfigs] = useState<{
        GameUserSettings: CaseInsensitiveMap<CaseInsensitiveMap<string>>,
        Game: CaseInsensitiveMap<CaseInsensitiveMap<string>>
    }>({ GameUserSettings: new CaseInsensitiveMap(), Game: new CaseInsensitiveMap() });

    // Initialize from navigation. Runs only when the navigation state changes — not on every
    // server list refresh, which used to override the server the user picked in the selector.
    useEffect(() => {
        if (location.state?.serverId) {
            setSelectedServerId(location.state.serverId);
        }
        if (location.state?.initialMode) {
            // Raw text is filled in by the loader once the INI files have been read
            setViewMode(location.state.initialMode);
            setConfigReloadTrigger(c => c + 1);
        }
    }, [location.state]);

    // Fallback selection when nothing is selected yet
    useEffect(() => {
        if (!selectedServerId && servers.length > 0) {
            setSelectedServerId(activeServerId ?? servers[0].id);
        }
    }, [servers, activeServerId, selectedServerId]);

    // Server whose INI files are currently held in `configs`. Saving is only allowed into this server,
    // so a load that failed or is still in flight can never write one server's settings into another.
    const loadedServerIdRef = useRef<number | null>(null);
    const viewModeRef = useRef(viewMode);
    viewModeRef.current = viewMode;

    // Load configs
    useEffect(() => {
        if (!selectedServerId) return;
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            loadedServerIdRef.current = null;
            setConfigs({
                GameUserSettings: new CaseInsensitiveMap(),
                Game: new CaseInsensitiveMap()
            });
            setRawText({ gus: '', game: '' });
            setSavedConfigs({ GameUserSettings: new CaseInsensitiveMap(), Game: new CaseInsensitiveMap() });
            try {
                const [gusContent, gameContent] = await Promise.all([
                    readConfig(selectedServerId, 'GameUserSettings'),
                    readConfig(selectedServerId, 'Game')
                ]);

                // Untouched copy of the files (before the migrations/back-fills below)
                if (!cancelled) {
                    setSavedConfigs({ GameUserSettings: parseIniContent(gusContent), Game: parseIniContent(gameContent) });
                }
                const parsedGus = parseIniContent(gusContent);
                const parsedGame = parseIniContent(gameContent);

                // Migrate legacy ServerName to SessionName if present
                let serverSettings = parsedGus.get('ServerSettings');
                if (!serverSettings) {
                    serverSettings = new CaseInsensitiveMap<string>();
                    parsedGus.set('ServerSettings', serverSettings);
                }
                if (serverSettings.has('ServerName') && !serverSettings.has('SessionName')) {
                    serverSettings.set('SessionName', serverSettings.get('ServerName')!);
                }

                // Initialize MapName, Port, and QueryPort from current server configuration if missing in INI
                let currentServer = useServerStore.getState().servers.find(s => s.id === selectedServerId);
                if (!currentServer) {
                    await useServerStore.getState().refreshServers();
                    currentServer = useServerStore.getState().servers.find(s => s.id === selectedServerId);
                }
                if (currentServer) {
                    if (!serverSettings.has('MapName') && currentServer.config?.mapName) {
                        serverSettings.set('MapName', currentServer.config.mapName);
                    }
                    if (!serverSettings.has('Port') && currentServer.ports?.gamePort) {
                        serverSettings.set('Port', String(currentServer.ports.gamePort));
                    }
                    if (!serverSettings.has('QueryPort') && currentServer.ports?.queryPort) {
                        serverSettings.set('QueryPort', String(currentServer.ports.queryPort));
                    }
                }

                // Also ensure [URL] section is in sync with ServerSettings if both exist
                const urlSection = parsedGus.get('URL');
                if (urlSection && serverSettings) {
                    if (serverSettings.has('Port')) {
                        urlSection.set('Port', serverSettings.get('Port')!);
                    }
                    if (serverSettings.has('QueryPort')) {
                        urlSection.set('QueryPort', serverSettings.get('QueryPort')!);
                    }
                }

                // A newer load (server switch) superseded this one — drop the stale result
                if (cancelled) return;

                setConfigs({
                    GameUserSettings: parsedGus,
                    Game: parsedGame
                });

                checkModifications({
                    GameUserSettings: parsedGus,
                    Game: parsedGame
                });

                // Raw editors need their text populated too (e.g. opened directly in raw mode
                // or switched server while in raw mode); otherwise they show an empty file.
                const mode = viewModeRef.current;
                if (mode === 'gus' || mode === 'game') {
                    setRawText({
                        gus: generateIniContent(parsedGus),
                        game: generateIniContent(parsedGame)
                    });
                }

                loadedServerIdRef.current = selectedServerId;
            } catch (err) {
                console.error(err);
                if (!cancelled) toast.error(t('configEditor.toasts.loadError'));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedServerId, configReloadTrigger]);



    // Check for modifications against defaults
    const checkModifications = (
        currentConfigs: { GameUserSettings: Map<string, Map<string, string>> | CaseInsensitiveMap<CaseInsensitiveMap<string>>, Game: Map<string, Map<string, string>> | CaseInsensitiveMap<CaseInsensitiveMap<string>> }
    ) => {
        const modified = new Set<string>();
        const allCats = getAllCategories();

        allCats.forEach(cat => {
            cat.groups.forEach(group => {
                group.fields.forEach(field => {
                    const sourceMap = currentConfigs[group.source as 'GameUserSettings' | 'Game'];
                    const currentVal = sourceMap?.get(field.section)?.get(field.key);

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

    // Switch between editor modes, keeping `configs` (all structured modes) and `rawText` (raw modes)
    // in sync. Previously raw text was only regenerated when coming from 'visual', so going
    // levels/stats → raw showed an empty file, and raw → visual then parsed that empty text and
    // wiped every setting in the editor. Raw edits were also lost when leaving raw for levels/stats.
    const switchViewMode = (target: typeof viewMode) => {
        if (viewMode === target) return;
        const leavingRaw = viewMode === 'gus' || viewMode === 'game';
        const enteringRaw = target === 'gus' || target === 'game';

        if (leavingRaw && !enteringRaw) {
            const parsed = {
                GameUserSettings: parseIniContent(rawText.gus),
                Game: parseIniContent(rawText.game)
            };
            setConfigs(parsed);
            checkModifications(parsed);
            // Optimization: Clear raw text from memory when leaving raw mode
            setRawText({ gus: '', game: '' });
        } else if (!leavingRaw && enteringRaw) {
            setRawText({
                gus: generateIniContent(configs.GameUserSettings),
                game: generateIniContent(configs.Game)
            });
        }
        setViewMode(target);
    };

    const handleUpdate = useCallback((source: 'GameUserSettings' | 'Game', section: string, key: string, val: string, defaultValue?: string) => {
        setConfigs(prev => {
            const fileMap = prev[source] || new CaseInsensitiveMap<CaseInsensitiveMap<string>>();
            const newFileMap = fileMap instanceof CaseInsensitiveMap
                ? (fileMap as CaseInsensitiveMap<CaseInsensitiveMap<string>>).clone()
                : new Map(fileMap);
            const existingSection = fileMap.get(section);
            const sectionMap = existingSection instanceof CaseInsensitiveMap
                ? (existingSection as CaseInsensitiveMap<string>).clone()
                : new CaseInsensitiveMap<string>(existingSection || []);
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

    // Stable callback to refresh installed mods on demand
    const refreshInstalledMods = useCallback(async () => {
        if (!selectedServerId) return;
        try {
            const mods = await getInstalledMods(selectedServerId);
            setInstalledMods(mods || []);
        } catch (err) {
            console.error('Failed to refresh installed mods in ConfigEditor:', err);
        }
    }, [selectedServerId]);

    // Handle 1-click install & activate from ModMapHubModal
    const handleMapInstalledAndSelected = useCallback(async (mapArg: string, _modId?: string) => {
        handleUpdate('GameUserSettings', 'ServerSettings', 'MapName', mapArg);
        await refreshInstalledMods();
        setShowMapHubModal(false);
    }, [handleUpdate, refreshInstalledMods]);

    // Turn the editor state into the INI texts that would be written
    const buildSavePayload = () => {
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
                // Keep URL section in sync with ServerSettings so both sections reflect user port edits
                const srv = configs.GameUserSettings.get('ServerSettings');
                const url = configs.GameUserSettings.get('URL');
                if (srv && url) {
                    if (srv.has('Port')) url.set('Port', srv.get('Port')!);
                    if (srv.has('QueryPort')) url.set('QueryPort', srv.get('QueryPort')!);
                }
                gusString = generateIniContent(configs.GameUserSettings);
                gameString = generateIniContent(configs.Game);
            }

            // Ensure Game.ini has the required section header even if empty
            if (!gameString.includes('[/Script/ShooterGame.ShooterGameMode]')) {
                gameString = '[/Script/ShooterGame.ShooterGameMode]\n' + gameString;
            }
            return { parsedConfigs, gusString, gameString };
    };

    // Save is two-step: list what changed and ask for confirmation, then write
    const [pendingSave, setPendingSave] = useState<null | { payload: ReturnType<typeof buildSavePayload>; changes: PendingChange[] }>(null);

    const handleSave = () => {
        if (!selectedServerId) return;
        // Never write settings that were not loaded from this server's files (load failed, still in
        // flight, or the selection changed) — that would replace its INI values with another server's.
        if (loadedServerIdRef.current !== selectedServerId) {
            toast.error(t('configEditor.toasts.notLoaded', 'Configuration is not loaded for this server yet. Reload and try again.'));
            return;
        }
        const payload = buildSavePayload();
        const changes = computeConfigChanges(payload.parsedConfigs, savedConfigs);
        if (changes.length === 0) {
            toast(t('configEditor.saveDialog.noChanges', 'No changes to save'), { icon: 'ℹ️' });
            return;
        }
        setPendingSave({ payload, changes });
    };

    const performSave = async ({ parsedConfigs, gusString, gameString }: ReturnType<typeof buildSavePayload>, changes: PendingChange[]) => {
        if (!selectedServerId) return;
        setPendingSave(null);
        setIsLoading(true);
        try {
            // Only write the files that actually changed
            const gusChanged = changes.some(c => c.file === 'GameUserSettings');
            const gameChanged = changes.some(c => c.file === 'Game');
            await Promise.all([
                gusChanged ? saveConfig(selectedServerId, 'GameUserSettings', gusString) : Promise.resolve(),
                gameChanged ? saveConfig(selectedServerId, 'Game', gameString) : Promise.resolve(),
            ]);
            // What we just wrote is now the on-disk state (the backend merges, so keys missing here
            // keep their previous saved value)
            setSavedConfigs(prev => {
                const merge = (base: CaseInsensitiveMap<CaseInsensitiveMap<string>>, written: string) => {
                    const next = base.clone();
                    for (const [section, values] of parseIniContent(written)) {
                        const sec = (next.get(section) ?? new CaseInsensitiveMap<string>()).clone();
                        for (const [k, v] of values) sec.set(k, v);
                        next.set(section, sec);
                    }
                    return next;
                };
                return { GameUserSettings: merge(prev.GameUserSettings, gusString), Game: merge(prev.Game, gameString) };
            });

            // Extract critical settings from the parsed configs and sync to database
            // This ensures settings are always saved even if INI parsing in backend fails
            const serverSettings = parsedConfigs.GameUserSettings.get('ServerSettings');
            const sessionSettings = parsedConfigs.GameUserSettings.get('SessionSettings');
            const urlSettings = parsedConfigs.GameUserSettings.get('URL');
            const gameSessionSettings = parsedConfigs.GameUserSettings.get('/Script/Engine.GameSession');

            const getSetting = (map: Map<string, string> | undefined, key: string): string | undefined => {
                if (!map) return undefined;
                return map.get(key);
            };

            const updateParams: Parameters<typeof updateServerSettings>[0] = {
                serverId: selectedServerId
            };

            // Map name
            const mapName = getSetting(serverSettings, 'MapName') || getSetting(serverSettings, 'ServerMap');
            if (mapName) {
                updateParams.mapName = mapName;

                if (isOfficialMap(mapName)) {
                    // Official map - clean up -MapModID if present
                    const server = useServerStore.getState().servers.find(s => s.id === selectedServerId);
                    const currentCustomArgs = server?.config?.customArgs || server?.config?.custom_args || '';
                    if (/-MapModID=[^\s]+/i.test(currentCustomArgs)) {
                        updateParams.customArgs = currentCustomArgs.replace(/-MapModID=[^\s]+/gi, '').replace(/\s+/g, ' ').trim();
                    }
                } else {
                    // If it is a modded map or installed mod map, auto-inject launch arguments
                    let targetModId: string | undefined = undefined;
                    const moddedPreset = getModdedMapByMapArg(mapName, 'ASA');
                    if (moddedPreset?.mapModId) {
                        targetModId = moddedPreset.mapModId;
                    } else {
                        const matchedMod = installedMods.find(m =>
                            m.id === mapName ||
                            detectMapArgumentFromMod(m).toLowerCase() === mapName.toLowerCase() ||
                            m.name.toLowerCase() === mapName.toLowerCase()
                        );
                        if (matchedMod?.id) {
                            targetModId = matchedMod.id;
                        }
                    }

                    if (targetModId) {
                        const server = useServerStore.getState().servers.find(s => s.id === selectedServerId);
                        const currentCustomArgs = server?.config?.customArgs || server?.config?.custom_args || '';
                        const newCustomArgs = buildLaunchArgs({ mapModId: targetModId }, currentCustomArgs);
                        if (newCustomArgs !== currentCustomArgs) {
                            updateParams.customArgs = newCustomArgs;
                        }
                    }
                }
            }

            // Clean up legacy/incorrect ServerName key in GameUserSettings.ini to avoid conflicts
            if (serverSettings) {
                serverSettings.delete('ServerName');
            }

            // Session name / Server name
            const sessionName = getSetting(sessionSettings, 'SessionName') || 
                                getSetting(serverSettings, 'SessionName') || 
                                getSetting(serverSettings, 'ServerName');
            if (sessionName) updateParams.sessionName = sessionName;

            // Max players
            const maxPlayers = getSetting(serverSettings, 'MaxPlayers') || 
                               getSetting(sessionSettings, 'MaxPlayers') || 
                               getSetting(gameSessionSettings, 'MaxPlayers');
            if (maxPlayers) updateParams.maxPlayers = parseInt(maxPlayers, 10);

            // Passwords
            const serverPassword = getSetting(serverSettings, 'ServerPassword');
            if (serverPassword !== undefined) updateParams.serverPassword = serverPassword;

            const adminPassword = getSetting(serverSettings, 'ServerAdminPassword');
            if (adminPassword) updateParams.adminPassword = adminPassword;

            // Ports from ServerSettings or URL section (prioritize ServerSettings where visual editor fields reside)
            const gamePort = getSetting(serverSettings, 'Port') || getSetting(serverSettings, 'GamePort') || getSetting(urlSettings, 'Port');
            if (gamePort) {
                updateParams.gamePort = parseInt(gamePort, 10);
                if (urlSettings) urlSettings.set('Port', gamePort);
            }

            const queryPort = getSetting(serverSettings, 'QueryPort') || getSetting(urlSettings, 'QueryPort');
            if (queryPort) {
                updateParams.queryPort = parseInt(queryPort, 10);
                if (urlSettings) urlSettings.set('QueryPort', queryPort);
            }

            // RCON port from ServerSettings
            const rconPort = getSetting(serverSettings, 'RCONPort');
            if (rconPort) updateParams.rconPort = parseInt(rconPort, 10);

            // IP Address from ServerSettings
            const ipAddress = getSetting(serverSettings, 'IPAddress') || getSetting(serverSettings, 'MultiHome') || getSetting(urlSettings, 'MultiHome');
            if (ipAddress !== undefined) updateParams.ipAddress = ipAddress;

            // Sync critical settings to database — only the ones that differ from what the DB has,
            // and skip the call entirely when nothing changed (it also re-checks the firewall)
            const current = useServerStore.getState().servers.find(s => s.id === selectedServerId);
            if (current) {
                const known: Partial<Record<keyof typeof updateParams, unknown>> = {
                    mapName: current.config?.mapName,
                    sessionName: current.config?.sessionName,
                    maxPlayers: current.config?.maxPlayers,
                    serverPassword: current.config?.serverPassword ?? '',
                    adminPassword: current.config?.adminPassword,
                    gamePort: current.ports?.gamePort,
                    queryPort: current.ports?.queryPort,
                    rconPort: current.ports?.rconPort,
                    ipAddress: current.ipAddress ?? '',
                    customArgs: current.config?.customArgs ?? current.config?.custom_args ?? '',
                };
                for (const k of Object.keys(updateParams) as (keyof typeof updateParams)[]) {
                    if (k !== 'serverId' && k in known && String(known[k] ?? '') === String(updateParams[k] ?? '')) {
                        delete updateParams[k];
                    }
                }
            }
            if (Object.keys(updateParams).length > 1) {
                await updateServerSettings(updateParams);
                // Refresh servers list to reflect updates in UI
                await useServerStore.getState().refreshServers();
            }

            toast.success(t('configEditor.toasts.saveSuccess'));
            toast((toastItem) => (
                <div className="flex items-center gap-3 w-full">
                    <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
                    <span className="font-medium text-slate-200 flex-1">{t('configEditor.toasts.restartRequired')}</span>
                    <button onClick={() => toast.dismiss(toastItem.id)} className="p-1 hover:bg-white/10 rounded-md transition-colors shrink-0">
                        <X className="w-4 h-4 text-slate-400 hover:text-white" />
                    </button>
                </div>
            ), { duration: 10000, icon: null, style: { background: '#1e1e3a', border: '1px solid #f97316', maxWidth: '450px' } });

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
        const fileMap = configs[source];
        if (!fileMap) return defaultValue ?? '';
        const sectionMap = fileMap.get(section);
        if (!sectionMap) return defaultValue ?? '';
        return sectionMap.get(key) ?? defaultValue ?? '';
    };

    const categories = useMemo(() => getAllCategories(), []);

    // Searchable text for every group/field across ALL tabs and both INI files: INI key (also split
    // into words), section, English + translated label/description, dropdown options, group title and
    // tab name. Accent-insensitive so "domesticacao" finds "Domesticação".
    const searchIndex = useMemo(() => {
        const field = (f: ConfigField) => normalizeSearchText([
            f.key, splitCamelCase(f.key), f.section,
            f.label, t(`configEditor.fields.${f.key}.label`, { defaultValue: f.label }),
            f.description ?? '', f.description ? t(`configEditor.fields.${f.key}.description`, { defaultValue: f.description }) : '',
            ...(f.options ?? []).map(o => `${o.label} ${optionLabel(t, f.key, o)} ${o.value}`)
        ].join(' '));
        return categories.flatMap(({ category, info, groups }) => groups.map(group => ({
            category,
            group,
            groupText: normalizeSearchText([
                group.title,
                t(`configEditor.groups.${groupTitleKey(group.title)}.title`, { defaultValue: group.title }),
                info.label,
                t(`configEditor.categories.${category}`, { defaultValue: info.label })
            ].join(' ')),
            fieldTexts: group.fields.map(field)
        })));
    }, [categories, t, i18n.language]);

    // Search results per tab, keyed by `${category}:${source}` (drives the counts in the sidebar)
    const searchResults = useMemo(() => {
        const terms = normalizeSearchText(searchQuery).split(/\s+/).filter(Boolean);
        if (terms.length === 0) return null;
        const matches = (text: string) => terms.every(term => text.includes(term));

        const results: { category: string; group: ConfigGroup }[] = [];
        const countByTab = new Map<string, number>();
        for (const { category, group, groupText, fieldTexts } of searchIndex) {
            // A matching group/tab name shows the whole group; otherwise only the matching fields
            const fields = matches(groupText)
                ? group.fields
                : group.fields.filter((_, i) => matches(`${groupText} ${fieldTexts[i]}`));
            if (fields.length === 0) continue;
            results.push({ category, group: { ...group, fields } });
            const tabKey = `${category}:${group.source}`;
            countByTab.set(tabKey, (countByTab.get(tabKey) ?? 0) + fields.length);
        }
        return { results, countByTab };
    }, [searchQuery, searchIndex]);

    const filteredGroups = useMemo(() => {
        if (searchResults) {
            return searchResults.results
                .filter(r => !searchScope || (r.category === searchScope.category && r.group.source === searchScope.source))
                .map(r => r.group);
        }
        const groups = categories.find(c => c.category === activeCategory)?.groups || [];
        // Filter groups by activeFileFilter
        return groups.filter(g => g.source === activeFileFilter);
    }, [activeCategory, activeFileFilter, searchResults, searchScope, categories]);

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

    const handleSaveCurrentAsPreset = useCallback((name: string, description: string) => {
        const preset = createPresetFromConfig(name, description, configs);
        saveCustomPreset(preset);
        setCurrentPreset(preset.id);
        toast.success(t('configEditor.toasts.presetSaved', 'Preset saved successfully'));
    }, [configs, t]);

    const handleUpdatePresetWithCurrent = useCallback((presetId: string) => {
        const currentPresetObj = getCustomPresets().find(p => p.id === presetId);
        if (!currentPresetObj) return;

        const updatedData = createPresetFromConfig(currentPresetObj.name, currentPresetObj.description, configs);
        updateCustomPreset(presetId, {
            settings: updatedData.settings
        });
        toast.success(t('configEditor.toasts.presetUpdated', { name: currentPresetObj.name, defaultValue: `Preset "${currentPresetObj.name}" updated with current settings` }));
    }, [configs, t]);

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

        // Generate XP ramp using cumulative totals
        const levels = [];
        let total = 0;
        for (let i = 0; i < maxLevel - 1; i++) {
            // i = 0 represents the transition from Level 1 to Level 2.
            const xp = Math.floor(10 * Math.pow(i + 1, 2.2));
            total += xp;
            levels.push(`ExperiencePointsForLevel[${i}]=${total}`);
        }

        const rampString = `(${levels.join(',')})`;

        handleUpdate('Game', '/Script/ShooterGame.ShooterGameMode', 'LevelExperienceRampOverrides', rampString);
        handleUpdate('Game', '/Script/ShooterGame.ShooterGameMode', 'OverrideMaxExperiencePointsPlayer', (total + 1).toString());
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

        // 4. PvE + Offline PvP Conflict
        const pveMode = getValue('GameUserSettings', 'ServerSettings', 'ServerPVE');
        const offlinePvP = getValue('GameUserSettings', 'ServerSettings', 'PreventOfflinePvP');
        if (pveMode === 'True' && offlinePvP === 'True') {
            issues.push({
                type: 'warning',
                message: t('configEditor.validation.pveOfflinePvpConflict', 'PvE Mode is enabled alongside Prevent Offline PvP. Offline PvP protection is redundant in PvE mode — consider disabling it to avoid confusion.')
            });
        }

        return issues;
    }, [configs, t]);

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
        <div className="h-full flex flex-col glass-panel rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-[var(--border)] flex flex-col gap-5 bg-[var(--surface)]">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 flex-wrap">
                        <h2 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                                <Sliders className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-[var(--text-primary)]">{t('configEditor.title')}</span>
                        </h2>

                        <div className="w-56">
                            <ServerSelect
                                value={selectedServerId}
                                onChange={(id) => setSelectedServerId(id)}
                                accentColor="purple"
                            />
                        </div>

                        <PresetSelector
                            onApplyPreset={handleApplyPreset}
                            currentPreset={currentPreset}
                            onSaveCurrentAsPreset={handleSaveCurrentAsPreset}
                            onUpdatePresetWithCurrent={handleUpdatePresetWithCurrent}
                        />

                        <button
                            onClick={() => setShowPresetHub(true)}
                            className="px-3.5 py-2 bg-gradient-to-r from-violet-500/15 to-purple-500/15 hover:from-violet-500/25 hover:to-purple-500/25 text-violet-600 dark:text-violet-300 border border-violet-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                            title={t('configEditor.templateHubTitle', 'Server Templates Hub: Export or import complete server presets')}
                        >
                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                            <span>{t('configEditor.templateHub', 'Template Hub')}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <a
                            href="https://ark.wiki.gg/wiki/Server_configuration"
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-violet-500/50 text-sm flex items-center gap-2 transition-all hover:shadow-md cursor-pointer"
                        >
                            <ExternalLink className="w-4 h-4" /> {t('configEditor.buttons.wiki')}
                        </a>
                        <button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {t('configEditor.buttons.save')}
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs - Modern Pill Style */}
                <div className="flex items-center gap-2 bg-[var(--surface-hover)] p-2 rounded-2xl self-start border border-[var(--border)] max-w-full overflow-x-auto scrollbar-thin">
                    <button
                        onClick={() => switchViewMode('visual')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0 cursor-pointer",
                            viewMode === 'visual'
                                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
                        )}
                    >
                        <Sliders className="w-4 h-4" /> {t('configEditor.tabs.visual')}
                    </button>
                    <button
                        onClick={() => switchViewMode('gus')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0 cursor-pointer",
                            viewMode === 'gus'
                                ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/30"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
                        )}
                    >
                        <FileText className="w-4 h-4" /> {t('configEditor.tabs.gus')}
                    </button>
                    <button
                        onClick={() => switchViewMode('game')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0 cursor-pointer",
                            viewMode === 'game'
                                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
                        )}
                    >
                        <FileText className="w-4 h-4" /> {t('configEditor.tabs.game')}
                    </button>
                    <button
                        onClick={() => switchViewMode('levels')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0 cursor-pointer",
                            viewMode === 'levels'
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
                        )}
                    >
                        <GraduationCap className="w-4 h-4" /> {t('configEditor.tabs.levels')}
                    </button>
                    <button
                        onClick={() => switchViewMode('stats')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0 cursor-pointer",
                            viewMode === 'stats'
                                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/30"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
                        )}
                    >
                        <BarChart3 className="w-4 h-4" /> {t('configEditor.tabs.stats')}
                    </button>
                    <button
                        onClick={() => switchViewMode('anti-cheat')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0 cursor-pointer",
                            viewMode === 'anti-cheat'
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
                        )}
                    >
                        <Shield className="w-4 h-4" /> {t('configEditor.tabs.antiCheat')}
                    </button>
                    <button
                        onClick={() => switchViewMode('advanced')}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0 cursor-pointer",
                            viewMode === 'advanced'
                                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
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
                            <span className="text-orange-300">{issue.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative">
                {viewMode === 'anti-cheat' ? (
                    <div className="w-full h-full overflow-y-auto bg-[var(--card-background)]">
                        <AntiCheatDashboard serverId={selectedServerId} />
                    </div>
                ) : viewMode === 'advanced' ? (
                    <div className="w-full h-full overflow-y-auto bg-[var(--card-background)] p-8">
                        <AdvancedConfigDashboard serverId={selectedServerId} />
                    </div>
                ) : viewMode === 'visual' ? (
                    <>
                        {/* Sidebar */}
                        <div
                            className={cn(
                                "bg-[var(--surface)] border-r border-[var(--border)] overflow-y-auto relative transition-all duration-300",
                                isSidebarCollapsed && "w-0"
                            )}
                            style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
                        >
                            {!isSidebarCollapsed && (
                                <>
                                    <div className="p-4 border-b border-[var(--border)]">
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                            <input
                                                type="text"
                                                placeholder={t('configEditor.placeholders.searchSettings')}
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    setSearchScope(null);
                                                }}
                                                className="w-full bg-[var(--input-background)] border border-[var(--input-border)] rounded-xl pl-11 pr-10 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] transition-all"
                                            />
                                            {searchQuery && (
                                                <button
                                                    onClick={() => {
                                                        setSearchQuery('');
                                                        setSearchScope(null);
                                                    }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                                                    title={t('common.clear', 'Clear')}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        {searchResults && (
                                            <p className="text-[11px] text-[var(--text-muted)] mt-2 px-1">
                                                {t('configEditor.search.resultsSummary', {
                                                    defaultValue: '{{count}} settings found in {{tabs}} tabs',
                                                    count: searchResults.results.reduce((n, r) => n + r.group.fields.length, 0),
                                                    tabs: searchResults.countByTab.size
                                                })}
                                            </p>
                                        )}
                                    </div>
                                    <div className="p-3 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                                        {([
                                            { source: 'GameUserSettings' as const, heading: t('configEditor.sidebar.gus', 'GameUserSettings.ini (GUS)'), activeClass: "bg-violet-500/15 border-violet-500/30 text-violet-400 shadow-[inset_3px_0_0_0_#8b5cf6]" },
                                            { source: 'Game' as const, heading: t('configEditor.sidebar.gameIni', 'Game.ini Settings'), activeClass: "bg-indigo-500/15 border-indigo-500/30 text-indigo-400 shadow-[inset_3px_0_0_0_#6366f1]" }
                                        ]).map(({ source, heading, activeClass }) => (
                                            <div key={source} className="flex flex-col gap-1.5 text-left">
                                                <h3 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest px-3 mb-1">{heading}</h3>
                                                {categories
                                                    .filter(c => c.groups.some(g => g.source === source))
                                                    .map(({ category, info }) => {
                                                        // While searching, each tab shows how many of its parameters match
                                                        const matchCount = searchResults?.countByTab.get(`${category}:${source}`) ?? 0;
                                                        const isActive = searchResults
                                                            ? searchScope?.category === category && searchScope.source === source
                                                            : activeCategory === category && activeFileFilter === source;
                                                        return (
                                                            <button
                                                                key={`${category}-${source}`}
                                                                disabled={!!searchResults && matchCount === 0}
                                                                onClick={() => {
                                                                    if (searchResults) {
                                                                        // Narrow results to this tab (click again to show all tabs)
                                                                        setSearchScope(isActive ? null : { category, source });
                                                                        return;
                                                                    }
                                                                    setActiveCategory(category);
                                                                    setActiveFileFilter(source);
                                                                }}
                                                                className={cn(
                                                                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 border text-left group cursor-pointer disabled:opacity-30 disabled:cursor-default",
                                                                    isActive
                                                                        ? activeClass
                                                                        : "bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                                                                )}
                                                            >
                                                                <span className="text-base group-hover:scale-110 transition-transform duration-300">{info.icon}</span>
                                                                <span className="flex-1">{t(`configEditor.categories.${category}`, { defaultValue: info.label })}</span>
                                                                {searchResults && matchCount > 0 && (
                                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300">{matchCount}</span>
                                                                )}
                                                            </button>
                                                        );
                                                    })
                                                }
                                            </div>
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
                            className="absolute top-20 left-0 z-20 w-7 h-10 bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-violet-600 hover:border-violet-500 hover:text-white transition-all shadow-lg flex items-center justify-center rounded-r-xl cursor-pointer"
                            style={{ marginLeft: isSidebarCollapsed ? '0px' : `${sidebarWidth}px` }}
                        >
                            {isSidebarCollapsed ? '›' : '‹'}
                        </button>

                        {/* Editor Area */}
                        <div className="flex-1 overflow-y-auto bg-[var(--card-background)] p-6 scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent">
                            {isLoading && !configs.GameUserSettings.size ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 animate-pulse">
                                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                                        </div>
                                        <span className="text-[var(--text-secondary)] text-sm font-medium">{t('configEditor.loading')}</span>
                                    </div>
                                </div>
                            ) : filteredGroups.length > 0 ? (
                                <div className="space-y-10 max-w-4xl mx-auto">
                                    {activeCategory === 'server' && activeFileFilter === 'GameUserSettings' && !searchQuery && (
                                        <PlatformSelector serverId={selectedServerId} />
                                    )}
                                    {filteredGroups.map((group, idx) => (
                                        <div key={idx} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                                            {/* Section Header with dynamic gradient decoration */}
                                            <div className="flex items-center gap-3 pb-3 border-b border-[var(--border)] relative">
                                                <div className={cn(
                                                    "absolute bottom-0 left-0 w-24 h-px bg-gradient-to-r to-transparent",
                                                    categories.find(c => c.category === activeCategory)?.info.color.replace('from-', 'from-').replace('to-', 'to-') || "from-cyan-500"
                                                )}></div>
                                                <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{t(`configEditor.groups.${groupTitleKey(group.title)}.title`, { defaultValue: group.title })}</h3>
                                                <span className={cn(
                                                    "text-xs px-2.5 py-1 rounded-full border font-medium",
                                                    group.source === 'GameUserSettings'
                                                        ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                                                        : "border-purple-500/40 text-purple-400 bg-purple-500/10"
                                                )}>
                                                    {group.source === 'GameUserSettings' ? 'INI' : 'GAME'}
                                                </span>
                                                {searchResults && (
                                                    <span className="text-xs px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--text-secondary)]">
                                                        {CATEGORY_INFO[group.category]?.icon} {t(`configEditor.categories.${group.category}`, { defaultValue: CATEGORY_INFO[group.category]?.label ?? group.category })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 items-start">
                                                {group.fields.map((field) => (
                                                    <ConfigInput
                                                        key={`${field.section}.${field.key}`}
                                                        field={field}
                                                        value={getValue(group.source as any, field.section, field.key, field.defaultValue)}
                                                        source={group.source as any}
                                                        onFieldChange={handleUpdate}
                                                        isModified={modifiedSettings.has(`${field.section}.${field.key}`)}
                                                        onFieldReset={handleReset}
                                                        installedMods={field.key === 'MapName' ? installedMods : undefined}
                                                        selectedServerId={selectedServerId}
                                                        onOpenMapHub={() => setShowMapHubModal(true)}
                                                        onRefreshInstalledMods={refreshInstalledMods}
                                                        fileValue={savedConfigs[group.source === 'Game' ? 'Game' : 'GameUserSettings'].get(field.section)?.get(field.key)}
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
                                            <NumberInput
                                                integer
                                                value={customDinoLevel}
                                                onValueChange={setCustomDinoLevel}
                                                className="w-full bg-slate-900/80 backdrop-blur-sm border border-slate-600/50 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none shadow-inner transition-all font-mono text-lg"
                                                min={1}
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
                                            <NumberInput
                                                integer
                                                value={customPlayerLevel}
                                                onValueChange={setCustomPlayerLevel}
                                                min={1}
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

            {/* Server Preset & Template Hub Modal */}
            <ServerPresetModal
                isOpen={showPresetHub}
                onClose={() => {
                    setShowPresetHub(false);
                    setConfigReloadTrigger(c => c + 1);
                }}
                servers={servers}
                initialServerId={selectedServerId || undefined}
                initialTab="library"
            />

            {/* Save confirmation: list of changed keys */}
            {pendingSave && (
                <SaveChangesDialog
                    changes={pendingSave.changes}
                    onCancel={() => setPendingSave(null)}
                    onConfirm={() => performSave(pendingSave.payload, pendingSave.changes)}
                />
            )}

            {/* Curated Modded Map Hub Modal */}
            <ModMapHubModal
                isOpen={showMapHubModal}
                onClose={() => setShowMapHubModal(false)}
                serverId={selectedServerId || 0}
                currentMapArg={getValue('GameUserSettings', 'ServerSettings', 'MapName', 'TheIsland_WP')}
                installedMods={installedMods}
                onMapInstalledAndSelected={handleMapInstalledAndSelected}
                onRefreshInstalledMods={refreshInstalledMods}
            />
        </div>
    );
}
