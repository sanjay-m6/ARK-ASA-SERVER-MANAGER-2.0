
import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2, Search, Sliders, ExternalLink, FileText, Copy, Check, RotateCcw, AlertTriangle, GraduationCap, BarChart3, Shield, X, ChevronDown, ChevronUp, MapPin, Compass, Clock, Sparkles, Globe } from 'lucide-react';
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
import { CraftingCostEditor } from '../components/config/CraftingCostEditor';
import { EngramOverridesEditor } from '../components/config/EngramOverridesEditor';
import { applyPreset, ConfigPreset, createPresetFromConfig, saveCustomPreset } from '../data/presets';
import StatMultiplierEditor from '../components/config/StatMultiplierEditor';
import AntiCheatDashboard from '../components/server/AntiCheatDashboard';
import AdvancedConfigDashboard from '../components/server/AdvancedConfigDashboard';
import ServerSelect from '../components/ui/ServerSelect';
import { MODDED_MAP_PRESETS, buildLaunchArgs, getModdedMapByMapArg } from '../data/moddedMapRegistry';

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
    'Genesis_WP': {
        name: 'Genesis Part 1',
        description: 'Virtual simulation with extreme environments. Coming June 2026.',
        color: '#14b8a6',
        icon: '🧬',
        size: 'Medium (~7 GB)',
        image: mapGenesis,
        dlcType: 'Upcoming (2026)'
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
        if (!text) return <span className="text-slate-500 italic text-xs">No message entered yet.</span>;

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
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none mr-1">Colors:</span>
                        {[
                            { name: 'Red', color: '1,0,0,1', bg: 'bg-red-500' },
                            { name: 'Green', color: '0,1,0,1', bg: 'bg-emerald-500' },
                            { name: 'Blue', color: '0,0.5,1,1', bg: 'bg-blue-500' },
                            { name: 'Yellow', color: '1,1,0,1', bg: 'bg-amber-400' },
                            { name: 'Orange', color: '1,0.65,0,1', bg: 'bg-orange-500' },
                            { name: 'Cyan', color: '0,1,1,1', bg: 'bg-cyan-400' },
                            { name: 'White', color: '1,1,1,1', bg: 'bg-white' },
                        ].map(c => (
                            <button
                                key={c.name}
                                type="button"
                                onClick={() => insertColorTag(c.color)}
                                className={`w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm ${c.bg}`}
                                title={`Format selection to ${c.name}`}
                            />
                        ))}

                        {/* Custom Color Picker */}
                        <label
                            className="w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm cursor-pointer flex items-center justify-center relative"
                            style={{ background: 'linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)' }}
                            title="Choose custom color"
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
                            title="Insert literal newline \n tag"
                        >
                            + New Line (\n)
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
                            title="Create beautiful multi-color gradient text"
                        >
                            🎨 Gradient Builder
                        </button>
                    </div>

                    {/* Gradient Builder Panel */}
                    {showGradientBuilder && (
                        <div className="flex flex-col gap-3 bg-[#0f0f20]/90 p-3.5 rounded-lg border-2 border-[#2d2d44] mb-2 text-left animate-fadeIn">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-orange-400">Multi-Color Gradient Builder</span>
                                <span className="text-[10px] text-slate-500">Generates ArkML color codes dynamically</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Input Text */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Text to Colorize</label>
                                    <input
                                        type="text"
                                        value={gradientText}
                                        onChange={e => setGradientText(e.target.value)}
                                        placeholder="Enter text to make gradient..."
                                        className="px-3 py-1.5 bg-[#080812] border border-[#2d2d44] rounded-lg text-xs text-white focus:outline-none focus:border-orange-500/50"
                                    />
                                </div>

                                {/* Mode & Colors */}
                                <div className="flex items-end gap-3">
                                    {/* Colors */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Colors (Start → End)</label>
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
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Spread Mode</label>
                                        <div className="flex rounded-lg overflow-hidden border border-[#2d2d44] bg-[#080812] p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setGradMode('char')}
                                                className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${gradMode === 'char' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Smooth (Letter)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGradMode('word')}
                                                className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${gradMode === 'word' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Bold (Word)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Preview */}
                            {gradientText && (
                                <div className="flex flex-col gap-1 bg-[#080812] p-2.5 rounded-lg border border-[#2d2d44]">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Live Builder Preview</span>
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
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!gradientText}
                                    onClick={insertGradientTag}
                                    className="px-3 py-1 rounded bg-orange-500 hover:bg-orange-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-orange-500/20"
                                >
                                    Insert Gradient
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
                            <span>In-Game Broadcast Preview</span>
                            <span className="text-[8px] bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold px-1.5 py-0.5 rounded">Real-Time</span>
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
        >
            <div className="flex items-center gap-2 mb-1">
                <div className="text-white font-medium flex items-center gap-2">
                    {fieldLabel}
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
                            label={fieldLabel}
                            description={fieldDescription}
                            defaultValue={field.defaultValue}
                            currentValue={value}
                            wikiLink={field.wikiLink}
                        >
                            <div className="flex items-center gap-2">
                                {fieldLabel}
                                {isModified && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
                                {isModified && onFieldReset && (
                                    <button onClick={(e) => { e.stopPropagation(); handleReset(); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                        <RotateCcw className="w-3 h-3 text-slate-400 hover:text-white" />
                                    </button>
                                )}
                            </div>
                        </ConfigTooltip>
                    }
                    description={fieldDescription}
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
                            {fieldDescription && <div className="text-sm text-slate-400">{fieldDescription}</div>}
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
        case 'dropdown': {
            // Detect if the current value is a custom (not in predefined options)
            const knownValues = field.options?.filter(o => o.value !== '__CUSTOM__').map(o => o.value) || [];
            const isCustomValue = value !== '' && !knownValues.includes(value);
            const dropdownValue = isCustomValue ? '__CUSTOM__' : value;

            if (field.key === 'MapName') {
                const [isOpen, setIsOpen] = useState(false);
                const dropdownRef = useRef<HTMLDivElement>(null);
                const mapButtonRef = useRef<HTMLButtonElement>(null);
                const mapListRef = useRef<HTMLDivElement>(null);
                const [mapDropdownPos, setMapDropdownPos] = useState({ top: 0, left: 0, width: 0 });

                // Close dropdown on click outside — must check both the button wrapper and the fixed list panel
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

                // Find currently selected map metadata
                const selectedMapMeta = MAP_METADATA[value];
                const selectedOption = field.options?.find(o => o.value === dropdownValue);

                // Group options by their group property for premium organization
                // Groups: released, premium, modded, upcoming, custom
                const groupedOptions = useMemo(() => {
                    const groups: Record<string, typeof field.options> = {
                        released: [],
                        premium: [],
                        modded: [],
                        upcoming: [],
                        custom: []
                    };
                    field.options?.forEach(opt => {
                        const g = opt.group || 'released';
                        if (groups[g]) {
                            groups[g].push(opt);
                        } else {
                            groups[g] = [opt];
                        }
                    });
                    return groups;
                }, [field.options]);

                return (
                    <div
                        className={cn(
                            containerClassName.replace('overflow-hidden', 'overflow-visible'),
                            isOpen ? "z-30" : "z-10"
                        )}
                    >
                        {labelContent}

                        {/* Custom Select Button */}
                        <div ref={dropdownRef} className="relative z-20">
                            <button
                                ref={mapButtonRef}
                                type="button"
                                onClick={() => {
                                    if (!isOpen && mapButtonRef.current) {
                                        const rect = mapButtonRef.current.getBoundingClientRect();
                                        setMapDropdownPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
                                    }
                                    setIsOpen(!isOpen);
                                }}
                                className="w-full flex items-center justify-between bg-[#1a1a2e] border-2 border-[#2d2d44] hover:border-violet-500/50 rounded-xl px-4 py-3 text-white transition-all focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] text-left cursor-pointer"
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="text-xl">
                                        {selectedMapMeta ? selectedMapMeta.icon : (dropdownValue === '__CUSTOM__' ? '✏️' : '🗺️')}
                                    </span>
                                    <div>
                                        <div className="font-semibold text-slate-100 leading-tight">
                                            {selectedMapMeta ? selectedMapMeta.name : (selectedOption ? selectedOption.label.replace(/^[^\s]+\s+/, '') : value || 'Custom Map')}
                                        </div>
                                        <div className="text-[10px] text-violet-400 font-medium tracking-wider uppercase mt-0.5">
                                            {selectedMapMeta ? (selectedMapMeta.author ? `${selectedMapMeta.dlcType} • By ${selectedMapMeta.author}` : selectedMapMeta.dlcType) : (dropdownValue === '__CUSTOM__' ? 'Custom ID' : 'Custom Mod Map')}
                                        </div>
                                    </div>
                                </div>
                                {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </button>

                            {/* Grouped Dropdown Options List — fixed so it escapes overflow:hidden/scroll ancestors */}
                            {isOpen && (
                                <div
                                    ref={mapListRef}
                                    className="fixed bg-[#121225]/95 border-2 border-[#2d2d44] rounded-xl shadow-2xl overflow-hidden max-h-[380px] overflow-y-auto backdrop-blur-md transition-all duration-200 z-[150]"
                                    style={{ top: mapDropdownPos.top, left: mapDropdownPos.left, width: mapDropdownPos.width }}
                                >

                                    {/* Released/Official Maps */}
                                    {groupedOptions.released && groupedOptions.released.length > 0 && (
                                        <div>
                                            <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/40 border-b border-[#2d2d44]/50 flex items-center gap-1.5">
                                                <Globe className="w-3 h-3 text-emerald-400" /> Official Release Maps
                                            </div>
                                            <div className="p-1.5 space-y-0.5">
                                                {groupedOptions.released.map(opt => {
                                                    const isSelected = dropdownValue === opt.value;
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
                                                                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                                                                isSelected
                                                                    ? "bg-violet-600/30 border border-violet-500/50 text-white font-medium shadow-[0_0_10px_rgba(139,92,246,0.1)]"
                                                                    : "text-slate-300 hover:bg-[#1c1c38] border border-transparent hover:text-white"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base">{meta?.icon || '🏝️'}</span>
                                                                <span>{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                            </div>
                                                            {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Premium Mod Maps */}
                                    {groupedOptions.premium && groupedOptions.premium.length > 0 && (
                                        <div className="border-t border-[#2d2d44]/50">
                                            <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/40 border-b border-[#2d2d44]/50 flex items-center gap-1.5">
                                                <Sparkles className="w-3 h-3 text-pink-400" /> Premium Mod Maps
                                            </div>
                                            <div className="p-1.5 space-y-0.5">
                                                {groupedOptions.premium.map(opt => {
                                                    const isSelected = dropdownValue === opt.value;
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
                                                                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                                                                isSelected
                                                                    ? "bg-violet-600/30 border border-violet-500/50 text-white font-medium shadow-[0_0_10px_rgba(139,92,246,0.1)]"
                                                                    : "text-slate-300 hover:bg-[#1c1c38] border border-transparent hover:text-white"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base">{meta?.icon || '✨'}</span>
                                                                <span>{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                            </div>
                                                            {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Modded Expansion Maps */}
                                    {groupedOptions.modded && groupedOptions.modded.length > 0 && (
                                        <div className="border-t border-[#2d2d44]/50">
                                            <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/40 border-b border-[#2d2d44]/50 flex items-center gap-1.5">
                                                <Compass className="w-3 h-3 text-orange-400" /> Modded Expansion Maps
                                            </div>
                                            <div className="p-1.5 space-y-0.5">
                                                {groupedOptions.modded.map(opt => {
                                                    const isSelected = dropdownValue === opt.value;
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
                                                                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                                                                isSelected
                                                                    ? "bg-violet-600/30 border border-violet-500/50 text-white font-medium shadow-[0_0_10px_rgba(139,92,246,0.1)]"
                                                                    : "text-slate-300 hover:bg-[#1c1c38] border border-transparent hover:text-white"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base">{meta?.icon || '🔥'}</span>
                                                                <span>{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                            </div>
                                                            {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Upcoming Maps */}
                                    {groupedOptions.upcoming && groupedOptions.upcoming.length > 0 && (
                                        <div className="border-t border-[#2d2d44]/50">
                                            <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-900/40 border-b border-[#2d2d44]/50 flex items-center gap-1.5">
                                                <Clock className="w-3 h-3 text-amber-400 animate-pulse" /> Upcoming Maps (Soon)
                                            </div>
                                            <div className="p-1.5 space-y-0.5">
                                                {groupedOptions.upcoming.map(opt => {
                                                    const isSelected = dropdownValue === opt.value;
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
                                                                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                                                                isSelected
                                                                    ? "bg-violet-600/30 border border-violet-500/50 text-white font-medium shadow-[0_0_10px_rgba(139,92,246,0.1)]"
                                                                    : "text-slate-300 hover:bg-[#1c1c38] border border-transparent hover:text-white"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base">{meta?.icon || '🧬'}</span>
                                                                <span>{meta?.name || opt.label.replace(/^[^\s]+\s+/, '')}</span>
                                                            </div>
                                                            {isSelected && <Check className="w-4 h-4 text-violet-400" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Custom option */}
                                    {groupedOptions.custom && groupedOptions.custom.length > 0 && (
                                        <div className="border-t border-[#2d2d44]/50">
                                            <div className="p-1.5">
                                                {groupedOptions.custom.map(opt => {
                                                    const isSelected = dropdownValue === opt.value;
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => {
                                                                handleChange(isCustomValue ? value : '');
                                                                setIsOpen(false);
                                                            }}
                                                            className={cn(
                                                                "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                                                                isSelected
                                                                    ? "bg-amber-600/30 border border-amber-500/50 text-white font-medium"
                                                                    : "text-slate-300 hover:bg-[#1c1c38] border border-transparent hover:text-white"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-base">✏️</span>
                                                                <span>{opt.label}</span>
                                                            </div>
                                                            {isSelected && <Check className="w-4 h-4 text-amber-500" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Custom Map Text Input when custom selection or non-predefined map name */}
                        {(dropdownValue === '__CUSTOM__') && (
                            <div className="mt-3.5 space-y-2 relative z-10 animate-fadeIn">
                                <label className="text-xs font-semibold text-amber-400/90 uppercase tracking-wider">Custom Map Name / Server Argument</label>
                                <input
                                    type="text"
                                    value={value}
                                    onChange={(e) => handleChange(e.target.value)}
                                    placeholder="e.g. ScorchedEarthRM_WP"
                                    className="w-full bg-[#1a1a2e] border-2 border-amber-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:shadow-[0_0_15px_rgba(245,158,11,0.2)] font-mono text-sm transition-all placeholder-slate-500"
                                />
                                <p className="text-[11px] text-slate-500">Enter the exact map identifier from the mod (e.g. <code className="text-amber-400/80">ScorchedEarthRM_WP</code>)</p>
                            </div>
                        )}

                        {/* Real-time Premium Map Preview Card */}
                        <div className="mt-4 relative rounded-xl overflow-hidden border-2 border-[#2d2d44] bg-slate-900 group/card min-h-[190px] flex flex-col justify-end transition-all duration-300 hover:border-violet-500/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] select-none">
                            {selectedMapMeta ? (
                                <>
                                    {/* Image background with zoom and transition */}
                                    <img
                                        src={selectedMapMeta.image}
                                        alt={selectedMapMeta.name}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-105"
                                    />
                                    {/* Glassmorphic/gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/10" />

                                    {/* Header badges */}
                                    <div className="absolute top-3 right-3 flex gap-1.5 items-center z-10">
                                        <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-black/60 border border-white/10 text-slate-300 backdrop-blur-md">
                                            {selectedMapMeta.size}
                                        </span>
                                        <span
                                            className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-white backdrop-blur-md"
                                            style={{ backgroundColor: `${selectedMapMeta.color}70`, border: `1px solid ${selectedMapMeta.color}` }}
                                        >
                                            {selectedMapMeta.dlcType}
                                        </span>
                                    </div>

                                    {/* Details content */}
                                    <div className="relative p-4 z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">{selectedMapMeta.icon}</span>
                                            <h4 className="font-bold text-white text-base leading-tight drop-shadow-md">{selectedMapMeta.name}</h4>
                                        </div>
                                        {selectedMapMeta.author && (
                                            <div className="text-[10px] text-amber-400 font-semibold mb-1">
                                                By {selectedMapMeta.author}
                                            </div>
                                        )}
                                        <p className="text-xs text-slate-300/90 leading-normal drop-shadow-sm line-clamp-2 mb-2">{selectedMapMeta.description}</p>

                                        {/* Auto-injected indicator */}
                                        {dropdownValue && getModdedMapByMapArg(dropdownValue, 'ASA') && (
                                            <div className="mt-2 text-[10px] px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium rounded-lg flex items-center gap-1.5 backdrop-blur-md">
                                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                                                <span>✓ Launch configuration will be set automatically</span>
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
                                            Custom Map
                                        </span>
                                    </div>

                                    {/* Details content */}
                                    <div className="relative p-4 z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">✏️</span>
                                            <h4 className="font-bold text-white text-base leading-tight font-mono">{value || 'Custom Map'}</h4>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-normal">
                                            {value ? 'Custom mod or unofficial map loaded via launch argument.' : 'Please select a map or specify a custom map identifier.'}
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
                        onChange={(e) => {
                            const selected = e.target.value;
                            if (selected === '__CUSTOM__') {
                                handleChange(isCustomValue ? value : '');
                            } else {
                                handleChange(selected);
                            }
                        }}
                        className="w-full bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.2)] cursor-pointer transition-all hover:border-[#3d3d5c]"
                    >
                        {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    {(dropdownValue === '__CUSTOM__') && (
                        <div className="mt-3 space-y-2">
                            <label className="text-xs font-semibold text-amber-400/90 uppercase tracking-wider">Custom Value</label>
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => handleChange(e.target.value)}
                                className="w-full bg-[#1a1a2e] border-2 border-amber-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:shadow-[0_0_15px_rgba(245,158,11,0.2)] font-mono text-sm transition-all placeholder-slate-500"
                            />
                        </div>
                    )}
                    {fieldDescription && <div className="mt-2 text-sm text-slate-400">{fieldDescription}</div>}
                </div>
            );
        }
        case 'array':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <ArrayEditor
                        label={fieldLabel}
                        value={value}
                        onChange={handleChange}
                        template={field.template || {}}
                    />
                    {fieldDescription && (
                        <div className="mt-2 text-xs text-slate-500 px-1 italic">
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
                        <div className="mt-2 text-xs text-slate-500 px-1 italic">
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
                        <div className="mt-2 text-xs text-slate-500 px-1 italic">
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
                    <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                        className="w-full bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:shadow-[0_0_15px_rgba(249,115,22,0.2)] font-mono transition-all placeholder-slate-500"
                    />
                    {fieldDescription && <div className="mt-2 text-sm text-slate-400">{fieldDescription}</div>}
                </div>
            );
    }
});

const groupTitleKey = (title: string) =>
    title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/)
        .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join('');

export default function ConfigEditor() {
    const { t } = useTranslation();
    const location = useLocation();
    const { servers } = useServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>('server');
    const [activeFileFilter, setActiveFileFilter] = useState<'GameUserSettings' | 'Game'>('GameUserSettings');
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
        if (selectedServerId === null) {
            if (location.state?.serverId) setSelectedServerId(location.state.serverId);
            else if (servers.length > 0) setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId, location.state]);

    // Load configs
    useEffect(() => {
        if (!selectedServerId) return;
        const load = async () => {
            setIsLoading(true);
            setConfigs({
                GameUserSettings: new Map(),
                Game: new Map()
            });
            try {
                const [gusContent, gameContent] = await Promise.all([
                    readConfig(selectedServerId, 'GameUserSettings'),
                    readConfig(selectedServerId, 'Game')
                ]);

                const parsedGus = parseIniContent(gusContent);
                const parsedGame = parseIniContent(gameContent);

                // Migrate legacy ServerName to SessionName if present
                const serverSettings = parsedGus.get('ServerSettings');
                if (serverSettings && serverSettings.has('ServerName') && !serverSettings.has('SessionName')) {
                    serverSettings.set('SessionName', serverSettings.get('ServerName')!);
                }

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
            if (mapName) {
                updateParams.mapName = mapName;

                // If it is a modded map, auto-inject launch arguments
                const moddedPreset = getModdedMapByMapArg(mapName, 'ASA');
                if (moddedPreset) {
                    const server = useServerStore.getState().servers.find(s => s.id === selectedServerId);
                    const currentCustomArgs = server?.config?.custom_args || '';
                    const newCustomArgs = buildLaunchArgs(moddedPreset, currentCustomArgs);
                    if (newCustomArgs !== currentCustomArgs) {
                        updateParams.customArgs = newCustomArgs;
                    }
                }
            }

            // Clean up legacy/incorrect ServerName key in GameUserSettings.ini to avoid conflicts
            if (serverSettings) {
                serverSettings.delete('ServerName');
            }

            // Session name
            const sessionName = serverSettings?.get('SessionName');
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
        return configs[source]?.get(section)?.get(key) ?? defaultValue ?? '';
    };

    const categories = useMemo(() => getAllCategories(), []);

    const filteredGroups = useMemo(() => {
        let groups = categories.find(c => c.category === activeCategory)?.groups || [];
        // Filter groups by activeFileFilter
        groups = groups.filter(g => g.source === activeFileFilter);

        if (searchQuery) {
            const allGroups = categories.flatMap(c => c.groups).filter(g => g.source === activeFileFilter);
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
    }, [activeCategory, activeFileFilter, searchQuery, categories]);

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

                        <ServerSelect
                            value={selectedServerId}
                            onChange={setSelectedServerId}
                            accentColor="purple"
                        />

                        <div className="h-8 w-px bg-[#2d2d44] mx-2" />

                        <PresetSelector
                            onApplyPreset={handleApplyPreset}
                            currentPreset={currentPreset}
                            onSaveCurrentAsPreset={handleSaveCurrentAsPreset}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <a
                            href="https://ark.wiki.gg/wiki/Server_configuration"
                            target="_blank"
                            rel="noreferrer"
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
                <div className="flex items-center gap-2 bg-[#0d0d1a] p-2 rounded-2xl self-start border border-[#1e1e3a] max-w-full overflow-x-auto scrollbar-thin">
                    <button
                        onClick={handleSwitchToVisual}
                        className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
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
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
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
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
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
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
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
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
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
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
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
                            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
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
                                    <div className="p-3 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                                        {/* GameUserSettings.ini Section */}
                                        <div className="flex flex-col gap-1.5 text-left">
                                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 mb-1">GameUserSettings.ini (GUS)</h3>
                                            {categories
                                                .filter(c => c.groups.some(g => g.source === 'GameUserSettings'))
                                                .map(({ category, info }) => {
                                                    const isActive = activeCategory === category && activeFileFilter === 'GameUserSettings' && !searchQuery;
                                                    return (
                                                        <button
                                                            key={`${category}-GUS`}
                                                            onClick={() => {
                                                                setActiveCategory(category);
                                                                setActiveFileFilter('GameUserSettings');
                                                                setSearchQuery('');
                                                            }}
                                                            className={cn(
                                                                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 border text-left group",
                                                                isActive
                                                                    ? "bg-violet-500/10 border-violet-500/30 text-violet-400 shadow-[inset_3px_0_0_0_#8b5cf6]"
                                                                    : "bg-transparent border-transparent text-slate-400 hover:bg-[#1a1a2e] hover:text-white"
                                                            )}
                                                        >
                                                            <span className="text-base group-hover:scale-110 transition-transform duration-300">{info.icon}</span>
                                                            <span>{t(`configEditor.categories.${category}`, { defaultValue: info.label })}</span>
                                                        </button>
                                                    );
                                                })
                                            }
                                        </div>

                                        {/* Game.ini Section */}
                                        <div className="flex flex-col gap-1.5 text-left">
                                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 mb-1">Game.ini Settings</h3>
                                            {categories
                                                .filter(c => c.groups.some(g => g.source === 'Game'))
                                                .map(({ category, info }) => {
                                                    const isActive = activeCategory === category && activeFileFilter === 'Game' && !searchQuery;
                                                    return (
                                                        <button
                                                            key={`${category}-Game`}
                                                            onClick={() => {
                                                                setActiveCategory(category);
                                                                setActiveFileFilter('Game');
                                                                setSearchQuery('');
                                                            }}
                                                            className={cn(
                                                                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 border text-left group",
                                                                isActive
                                                                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[inset_3px_0_0_0_#6366f1]"
                                                                    : "bg-transparent border-transparent text-slate-400 hover:bg-[#1a1a2e] hover:text-white"
                                                            )}
                                                        >
                                                            <span className="text-base group-hover:scale-110 transition-transform duration-300">{info.icon}</span>
                                                            <span>{t(`configEditor.categories.${category}`, { defaultValue: info.label })}</span>
                                                        </button>
                                                    );
                                                })
                                            }
                                        </div>
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
                                                <h3 className="text-lg font-bold text-white tracking-tight">{t(`configEditor.groups.${groupTitleKey(group.title)}.title`, { defaultValue: group.title })}</h3>
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
