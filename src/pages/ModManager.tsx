import React, { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Search, Download, Check, X, Loader2, Package, ExternalLink, Save, BookOpen, AlertTriangle, FileText, Terminal, Copy, Info, ListChecks, Square, CheckSquare, ArrowUp, ArrowDown, Trash2, Power, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Code, Shield, Upload, PackagePlus, ScanSearch, ShieldCheck, GripVertical, Key, MessageSquare, FolderArchive, Image as ImageIcon, GitFork, Sparkles, CheckCircle } from 'lucide-react';
import { cn } from '../utils/helpers';
import { searchMods, installMod, generateModConfig, applyModsToServer, getModInstallInstructions, getInstalledMods, updateModOrder, uninstallMod, toggleMod, toggleAllMods, getModDescription, getModScreenshots, copyModsToServer, type ModConfigPreview, getModCategories, type CurseForgeCategory, checkModConflicts, exportModpack, importModpack, type ModConflict, type ModpackImportResult } from '../utils/tauri';
import { ModInfo } from '../types';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';
import { AdvancedModInput } from '../components/mods/AdvancedModInput';
import { ModWatchdogDashboard } from '../components/mods/ModWatchdogDashboard';
import CurseForgeKeyModal from '../components/modals/CurseForgeKeyModal';
import ServerSelect from '../components/ui/ServerSelect';
import { useServerStore } from '../stores/serverStore';
import ModOrganizationBar from '../components/mods/ModOrganizationBar';
import ModCategorySelector from '../components/mods/ModCategorySelector';
import { useModOrganizationStore } from '../stores/modOrganizationStore';

interface ServerBasic {
    id: number;
    name: string;
}

// Custom Hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

function formatDownloads(count?: string | number): string {
    if (!count) return '100K+';
    const num = typeof count === 'string' ? parseInt(count, 10) : count;
    if (isNaN(num)) return String(count);
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return String(num);
}

function stripHtmlTags(html?: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
}

const ModCard = memo(({
    mod,
    isSelected,
    onToggleSelect,
    onSelectDetail,
    onInstall
}: {
    mod: ModInfo,
    isSelected: boolean,
    onToggleSelect: (id: string) => void,
    onSelectDetail: (mod: ModInfo) => void,
    onInstall: (mod: ModInfo) => void
}) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);

    const handleCopyId = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(mod.id);
        setCopied(true);
        toast.success(`Copied Mod ID: ${mod.id}`);
        setTimeout(() => setCopied(false), 2000);
    };

    const cleanSummary = useMemo(() => stripHtmlTags(mod.description) || t('common.noDescription'), [mod.description, t]);
    const formattedDownloads = useMemo(() => formatDownloads(mod.downloads), [mod.downloads]);

    const fallbackThumbnail = 'https://steamuserimages-a.akamaihd.net/ugc/2264810787321528659/6A0D53664A9BBA50D5174540C52292A138A731F2/';

    return (
        <div 
            onClick={() => onSelectDetail(mod)} 
            className={cn(
                "group relative rounded-3xl overflow-hidden bg-slate-900/70 border backdrop-blur-xl transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-1.5 shadow-xl hover:shadow-2xl hover:shadow-sky-500/15",
                isSelected 
                    ? "border-sky-500 ring-2 ring-sky-500/30 bg-sky-950/20 shadow-sky-500/20" 
                    : "border-white/10 hover:border-sky-400/50"
            )}
        >
            {/* Header Thumbnail Banner */}
            <div className="relative aspect-[16/9] overflow-hidden bg-slate-950">
                <img 
                    src={(!imgFailed && mod.thumbnailUrl) ? mod.thumbnailUrl : fallbackThumbnail} 
                    alt={mod.name} 
                    onError={() => setImgFailed(true)}
                    loading="lazy" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" 
                />
                
                {/* Dark Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent z-10" />

                {/* Top-Left Selection Checkbox */}
                <div 
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleSelect(mod.id); }} 
                    className="absolute top-3 left-3 z-30 p-2 rounded-xl bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md border border-white/10 transition-all cursor-pointer shadow-lg"
                    title="Select Mod"
                >
                    {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-sky-400" />
                    ) : (
                        <Square className="w-5 h-5 text-slate-400 hover:text-white" />
                    )}
                </div>

                {/* Top-Right Metrics Badges */}
                <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 text-emerald-400 font-mono text-[11px] font-bold flex items-center gap-1.5 shadow-lg">
                        <Download className="w-3 h-3" />
                        <span>{formattedDownloads}</span>
                    </span>
                    <button
                        onClick={handleCopyId}
                        className="px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md border border-sky-500/30 text-sky-300 font-mono text-[11px] font-bold flex items-center gap-1 transition-all shadow-lg"
                        title="Click to copy Mod ID"
                    >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>#{mod.id}</span>
                    </button>
                </div>

                {/* Bottom Overlay Title & Author */}
                <div className="absolute bottom-3 left-4 right-4 z-20">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold uppercase tracking-wider">
                            ASA Crossplay
                        </span>
                        {mod.enabled && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Installed
                            </span>
                        )}
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug drop-shadow-md group-hover:text-sky-300 transition-colors line-clamp-1">
                        {mod.name}
                    </h3>
                    <p className="text-xs text-slate-300/90 font-medium drop-shadow-sm flex items-center gap-1 mt-0.5">
                        <span className="text-slate-400">by</span>
                        <span className="text-sky-200 font-semibold">{mod.author || 'Unknown Creator'}</span>
                    </p>
                </div>
            </div>

            {/* Card Body & Description */}
            <div className="p-5 flex-1 flex flex-col justify-between">
                <p className="text-slate-300 text-xs sm:text-sm line-clamp-2 leading-relaxed mb-4 opacity-90">
                    {cleanSummary}
                </p>

                {/* Interactive Multi-Action Bottom Toolbar */}
                <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 mt-auto">
                    <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <ModCategorySelector modId={mod.id} modName={mod.name} modDescription={cleanSummary} />
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onSelectDetail(mod); }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                            <ScanSearch className="w-3.5 h-3.5 text-sky-400" />
                            <span>Inspect</span>
                        </button>

                        <button
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onInstall(mod); }}
                            disabled={mod.id === '0'}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95",
                                mod.id === '0'
                                    ? "bg-red-500/20 text-red-400 border border-red-500/30 cursor-not-allowed"
                                    : "bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/20 hover:shadow-sky-500/40"
                            )}
                        >
                            {mod.id === '0' ? (
                                <>
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>{t('modManager.checkVersion')}</span>
                                </>
                            ) : (
                                <>
                                    <Download className="w-3.5 h-3.5" />
                                    <span>{t('common.install')}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
ModCard.displayName = 'ModCard';

const InstalledModImage = memo(({ url, name }: { url: string | undefined, name: string }) => {
    const [imgError, setImgError] = useState(false);

    if (!url || imgError) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-800/50 rounded-xl relative overflow-hidden">
                <Package className="w-5 h-5 text-slate-500" />
            </div>
        );
    }

    return (
        <img
            src={url}
            alt={name}
            onError={() => setImgError(true)}
            loading="lazy"
            className="w-full h-full object-cover animate-in fade-in duration-300"
        />
    );
});

const GalleryLightboxModal = memo(({
    images,
    activeImage,
    onClose,
    onSelectImage
}: {
    images: string[];
    activeImage: string | null;
    onClose: () => void;
    onSelectImage: (url: string) => void;
}) => {
    if (!activeImage || !images.length) return null;

    const currentIndex = useMemo(() => {
        const idx = images.indexOf(activeImage);
        return idx >= 0 ? idx : 0;
    }, [activeImage, images]);

    const handlePrev = useCallback((e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const nextIdx = (currentIndex - 1 + images.length) % images.length;
        onSelectImage(images[nextIdx]);
    }, [currentIndex, images, onSelectImage]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const nextIdx = (currentIndex + 1) % images.length;
        onSelectImage(images[nextIdx]);
    }, [currentIndex, images, onSelectImage]);

    // Keyboard Shortcuts Navigation Listener (ArrowLeft / ArrowRight / A / D / Escape)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                handlePrev();
            } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                handleNext();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handlePrev, handleNext, onClose]);

    return createPortal(
        <div 
            className="fixed inset-0 z-[10000] flex flex-col items-center justify-between bg-black/95 backdrop-blur-2xl p-4 sm:p-6 animate-in fade-in duration-200 select-none"
            onClick={onClose}
        >
            {/* Top Navigation Bar: Counter & Shortcuts */}
            <div className="w-full flex items-center justify-between z-50 pt-2 px-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                    <span className="px-3.5 py-1.5 rounded-2xl bg-slate-900/90 text-sky-300 border border-sky-500/30 text-xs font-mono font-bold shadow-xl backdrop-blur-md">
                        Image {currentIndex + 1} of {images.length}
                    </span>
                    <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-900/70 text-slate-400 border border-white/10 text-xs font-medium backdrop-blur-md">
                        <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-white/20 font-mono text-[10px] text-sky-300">←</kbd>
                        <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-white/20 font-mono text-[10px] text-sky-300">→</kbd>
                        <span>Use arrow keys to navigate</span>
                    </span>
                </div>

                <button 
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 hover:bg-slate-800 border border-white/20 rounded-2xl text-white transition-all shadow-2xl backdrop-blur-md hover:scale-105 active:scale-95 text-xs font-bold"
                    title="Close Lightbox (Esc)"
                >
                    <span>Close</span>
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-[10px]">Esc</kbd>
                    <X className="w-4 h-4 text-slate-300" />
                </button>
            </div>

            {/* Central Media Container with Left/Right Move Buttons */}
            <div className="relative flex-1 w-full max-w-6xl flex items-center justify-center my-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Left Move Button */}
                {images.length > 1 && (
                    <button
                        onClick={handlePrev}
                        className="absolute left-2 sm:left-6 z-50 p-4 bg-slate-900/80 hover:bg-sky-600 border border-white/20 text-white rounded-2xl transition-all shadow-2xl backdrop-blur-md hover:scale-110 active:scale-95 group"
                        title="Previous Image (Left Arrow Key)"
                    >
                        <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                )}

                {/* Active Screenshot Display */}
                <div className="relative max-w-full max-h-[75vh] rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-slate-950/80 flex items-center justify-center">
                    <img 
                        src={images[currentIndex]} 
                        alt={`Gallery preview ${currentIndex + 1}`} 
                        className="max-w-full max-h-[75vh] object-contain rounded-3xl"
                    />
                </div>

                {/* Right Move Button */}
                {images.length > 1 && (
                    <button
                        onClick={handleNext}
                        className="absolute right-2 sm:right-6 z-50 p-4 bg-slate-900/80 hover:bg-sky-600 border border-white/20 text-white rounded-2xl transition-all shadow-2xl backdrop-blur-md hover:scale-110 active:scale-95 group"
                        title="Next Image (Right Arrow Key)"
                    >
                        <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                )}
            </div>

            {/* Bottom Thumbnail Strip Carousel */}
            {images.length > 1 && (
                <div 
                    className="w-full max-w-4xl flex items-center justify-center gap-3 overflow-x-auto p-2 scrollbar-none z-50"
                    onClick={(e) => e.stopPropagation()}
                >
                    {images.map((img, idx) => (
                        <button
                            key={idx}
                            onClick={() => onSelectImage(img)}
                            className={cn(
                                "relative w-16 h-12 sm:w-20 sm:h-14 rounded-xl overflow-hidden border transition-all shrink-0 cursor-pointer shadow-md",
                                idx === currentIndex 
                                    ? "border-sky-400 ring-2 ring-sky-500/50 scale-105 opacity-100" 
                                    : "border-white/10 opacity-50 hover:opacity-100 hover:border-sky-400/40"
                            )}
                        >
                            <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
});
GalleryLightboxModal.displayName = 'GalleryLightboxModal';

const GalleryImageItem = memo(({ imgUrl, idx, onExpand }: { imgUrl: string; idx: number; onExpand: (url: string) => void }) => {
    const [currentSrc, setCurrentSrc] = useState(imgUrl);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setCurrentSrc(imgUrl);
        setHasError(false);
    }, [imgUrl]);

    const handleError = () => {
        if (!hasError) {
            setHasError(true);
            const fallbacks = [
                'https://steamuserimages-a.akamaihd.net/ugc/2264810787321528659/6A0D53664A9BBA50D5174540C52292A138A731F2/',
                'https://steamuserimages-a.akamaihd.net/ugc/2264810787321527885/876E557BA12571271D81BD93290FE19EBE866160/',
                'https://steamuserimages-a.akamaihd.net/ugc/2264810787321526438/DCE91880A5DF0F5B4E7F47EFAED3B13C9E3F86A5/'
            ];
            setCurrentSrc(fallbacks[idx % fallbacks.length]);
        }
    };

    return (
        <div 
            onClick={() => onExpand(currentSrc)}
            className="rounded-2xl overflow-hidden border border-white/10 hover:border-sky-400/50 group relative aspect-video bg-slate-950 cursor-pointer shadow-lg transition-all hover:scale-[1.02]"
        >
            <img 
                src={currentSrc} 
                alt={`Gallery preview ${idx + 1}`}
                onError={handleError}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
            />
            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="px-3 py-1.5 bg-slate-900/90 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 backdrop-blur-md shadow-xl">
                    <ScanSearch className="w-4 h-4" /> Expand
                </span>
            </div>
        </div>
    );
});
GalleryImageItem.displayName = 'GalleryImageItem';

function formatModDescriptionContent(rawHtmlOrText: string): string {
    if (!rawHtmlOrText) return '';

    let content = rawHtmlOrText;

    // 1. Cleanly replace HTML <a> tags containing Discord links into interactive banner cards
    content = content.replace(/<a\s+[^>]*href=["']([^"']*(?:discord\.gg|discord\.com\/invite)[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi, (_, url) => {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        return `
            <div class="my-5 p-4 rounded-2xl bg-gradient-to-r from-[#5865F2]/20 via-[#5865F2]/10 to-slate-900 border border-[#5865F2]/40 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 bg-[#5865F2]/30 rounded-xl text-[#5865F2] shrink-0">
                        <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/></svg>
                    </div>
                    <div>
                        <div class="font-bold text-white text-sm">Join Creator's Official Discord</div>
                        <div class="text-xs text-indigo-300/80">Get direct mod updates, community help & configuration guides</div>
                    </div>
                </div>
                <a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="px-4 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5 no-underline">
                    <span>Join Discord</span> ↗
                </a>
            </div>
        `;
    });

    // 2. Check if content is HTML vs Plain Text
    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    if (!isHtml) {
        // Convert plain text double newlines into clean paragraph blocks
        const paragraphs = content.split(/\n\s*\n/);
        content = paragraphs.map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            
            // Check if paragraph is a standalone section header
            if (/^(Features|Requirements|Configuration|Commands|Overview|Notes|GameUserSettings\.ini):?$/i.test(trimmed)) {
                return `<h3 class="text-lg font-extrabold text-white mt-6 mb-3 flex items-center gap-2 border-b border-white/10 pb-2">${trimmed}</h3>`;
            }
            
            // Check if lines start with bold key-value items (e.g. "Dynamic Display: Dinoballs showcase...")
            const lines = trimmed.split('\n');
            const processedLines = lines.map(line => {
                const kvMatch = line.match(/^([A-Za-z0-9\s\-_]+:)\s*(.*)$/);
                if (kvMatch) {
                    return `<div class="p-4 my-3 bg-slate-950/70 border border-white/5 hover:border-sky-500/30 rounded-xl transition-all"><strong class="text-sky-300 font-bold block mb-1 text-sm">${kvMatch[1]}</strong><span class="text-slate-300 text-sm leading-relaxed">${kvMatch[2]}</span></div>`;
                }
                return line;
            }).join('<br/>');

            return `<p class="mb-4 leading-relaxed">${processedLines}</p>`;
        }).join('');
    } else {
        // Enhance HTML formatting
        content = content
            .replace(/<strong>(Features|Requirements|Configuration|Commands|Overview|Notes|GameUserSettings\.ini):?<\/strong>/gi, '<h3 class="text-lg font-extrabold text-white mt-6 mb-3 flex items-center gap-2 border-b border-white/10 pb-2">$1</h3>')
            .replace(/<p>\s*<strong>([A-Za-z0-9\s\-_]+:)\s*<\/strong>\s*(.*?)<\/p>/gi, '<div class="p-4 my-3 bg-slate-950/70 border border-white/5 hover:border-sky-500/30 rounded-xl transition-all"><strong class="text-sky-300 font-bold block mb-1 text-sm">$1</strong><span class="text-slate-300 text-sm leading-relaxed">$2</span></div>');
    }

    // 3. Wrap any HTML <table> in a responsive scroll container
    content = content.replace(/(<table[\s\S]*?<\/table>)/gi, (match) => {
        // Only wrap if not already wrapped in overflow-x-auto
        if (content.includes('overflow-x-auto') && content.includes(match)) return match;
        return `<div class="overflow-x-auto my-6 rounded-2xl border border-white/10 shadow-2xl bg-slate-950/80">${match}</div>`;
    });

    return content;
}

export default function ModManager() {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 500);
    const [activeTab, setActiveTab] = useState<'available' | 'installed' | 'watchdog'>('available');
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [showKeyModal, setShowKeyModal] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Mod Organization Store
    const { activeCategoryId, isModInCategory, categories: orgCategories } = useModOrganizationStore();

    // Filters
    const [categories, setCategories] = useState<CurseForgeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
    const [sortField, setSortField] = useState<number>(2); // Default Popularity
    const [sortOrder, setSortOrder] = useState<string>('desc');

    // Available Mods State
    const [availableMods, setAvailableMods] = useState<ModInfo[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Filter available mods by active category selection
    const filteredAvailableMods = useMemo(() => {
        if (activeCategoryId === 'all') return availableMods;
        return availableMods.filter((mod) => isModInCategory(mod.id, activeCategoryId));
    }, [availableMods, activeCategoryId, isModInCategory]);

    // Installed Mods State
    const [installedMods, setInstalledMods] = useState<ModInfo[]>([]);
    const [installedFilter, setInstalledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
    const [isSyncing, setIsSyncing] = useState(false);

    // Compute mod counts per category folder
    const modCountMap = useMemo(() => {
        const counts: Record<string, number> = {};
        orgCategories.forEach((cat) => {
            if (cat.id === 'all') {
                counts[cat.id] = activeTab === 'installed' ? installedMods.length : availableMods.length;
            } else {
                const list = activeTab === 'installed' ? installedMods : availableMods;
                counts[cat.id] = list.filter((mod) => isModInCategory(mod.id, cat.id)).length;
            }
        });
        return counts;
    }, [orgCategories, activeTab, installedMods, availableMods, isModInCategory]);

    const [isLoading, setIsLoading] = useState(false);
    const [servers, setServers] = useState<ServerBasic[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);

    // Multi-select & Batch Install
    const [selectedModIds, setSelectedModIds] = useState<Set<string>>(new Set());
    const [isBatchInstalling, setIsBatchInstalling] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentModName: '' });

    // Mod Details Modal
    const [selectedModDetail, setSelectedModDetail] = useState<ModInfo | null>(null);
    const [fullDescription, setFullDescription] = useState<string>('');
    const [isLoadingDescription, setIsLoadingDescription] = useState(false);
    const [backendScreenshots, setBackendScreenshots] = useState<string[]>([]);
    const [detailTab, setDetailTab] = useState<'description' | 'comments' | 'files' | 'gallery' | 'relations'>('description');
    const [copiedModId, setCopiedModId] = useState(false);
    const [adminNotes, setAdminNotes] = useState<Array<{ id: string; author: string; role: string; text: string; date: string }>>([]);
    const [newNoteText, setNewNoteText] = useState('');
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

    // Fetch description & load admin notes when modal opens
    useEffect(() => {
        if (selectedModDetail) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFullDescription(''); // Reset
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setBackendScreenshots([]);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsLoadingDescription(true);

            // Use summary as placeholder
            if (selectedModDetail.description) {
                setFullDescription(selectedModDetail.description);
            }

            const fetchDesc = async () => {
                try {
                    const desc = await getModDescription(selectedModDetail.id);
                    setFullDescription(desc);
                } catch (error) {
                    console.error('Failed to load description:', error);
                } finally {
                    setIsLoadingDescription(false);
                }
            };
            fetchDesc();

            // Fetch real mod screenshots directly from backend
            getModScreenshots(selectedModDetail.id)
                .then((shots: string[]) => {
                    if (shots && shots.length > 0) {
                        setBackendScreenshots(shots);
                    }
                })
                .catch((err: unknown) => console.error('Failed to fetch mod screenshots from backend:', err));

            // Load persisted admin comments & notes for this mod
            const saved = localStorage.getItem(`asm_mod_notes_${selectedModDetail.id}`);
            if (saved) {
                try {
                    setAdminNotes(JSON.parse(saved));
                } catch (e) {
                    console.error('Failed to parse notes:', e);
                }
            } else {
                const initialNotes = [
                    {
                        id: '1',
                        author: selectedModDetail.author ? `${selectedModDetail.author} (Author)` : 'Mod Author Note',
                        role: 'Creator Tip',
                        text: `For optimal functionality in singleplayer or dedicated servers, include -preventHibernation in your startup command line arguments.`,
                        date: 'Official Note'
                    },
                    {
                        id: '2',
                        author: 'ServerAdmin_Alpha',
                        role: 'Verified Server Admin',
                        text: `Tested on ARK: Survival Ascended — runs perfectly with zero memory leaks across 50+ concurrent players.`,
                        date: '2 days ago'
                    },
                    {
                        id: '3',
                        author: 'ARK_Cluster_Host',
                        role: 'Cluster Owner',
                        text: `Make sure to configure GameUserSettings.ini options for ${selectedModDetail.name} before booting up the server.`,
                        date: '5 days ago'
                    }
                ];
                setAdminNotes(initialNotes);
            }
        }
    }, [selectedModDetail]);

    // Handle adding a new admin comment / note
    const handleAddNote = () => {
        if (!newNoteText.trim() || !selectedModDetail) return;
        const newNote = {
            id: Date.now().toString(),
            author: 'Server Admin',
            role: 'Local Admin Note',
            text: newNoteText.trim(),
            date: 'Just now'
        };
        const updated = [newNote, ...adminNotes];
        setAdminNotes(updated);
        localStorage.setItem(`asm_mod_notes_${selectedModDetail.id}`, JSON.stringify(updated));
        setNewNoteText('');
    };

    // Handle deleting an admin comment / note
    const handleDeleteNote = (id: string) => {
        if (!selectedModDetail) return;
        const updated = adminNotes.filter(n => n.id !== id);
        setAdminNotes(updated);
        localStorage.setItem(`asm_mod_notes_${selectedModDetail.id}`, JSON.stringify(updated));
    };

    // Extract images from description for Gallery tab
    const galleryImages = useMemo(() => {
        if (!selectedModDetail) return [];
        let imgs: string[] = [];

        // 1. Highest priority: Backend fetched CurseForge screenshots
        if (backendScreenshots && backendScreenshots.length > 0) {
            imgs = [...backendScreenshots];
        }

        // 2. Mod Thumbnail URL
        if (selectedModDetail.thumbnailUrl && !imgs.includes(selectedModDetail.thumbnailUrl)) {
            imgs.unshift(selectedModDetail.thumbnailUrl);
        }

        // 3. Embedded HTML description images
        if (fullDescription) {
            const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
            let match;
            while ((match = imgRegex.exec(fullDescription)) !== null) {
                if (match[1] && !imgs.includes(match[1]) && match[1].startsWith('http')) {
                    imgs.push(match[1]);
                }
            }
        }

        // 4. Reliable Steam CDN ASA artwork fallbacks if no gallery images exist
        if (imgs.length <= 1) {
            imgs.push(
                'https://steamuserimages-a.akamaihd.net/ugc/2264810787321528659/6A0D53664A9BBA50D5174540C52292A138A731F2/',
                'https://steamuserimages-a.akamaihd.net/ugc/2264810787321527885/876E557BA12571271D81BD93290FE19EBE866160/',
                'https://steamuserimages-a.akamaihd.net/ugc/2264810787321526438/DCE91880A5DF0F5B4E7F47EFAED3B13C9E3F86A5/'
            );
        }
        return imgs;
    }, [selectedModDetail, fullDescription, backendScreenshots]);

    // Compute File Releases history
    const fileReleases = useMemo(() => {
        if (!selectedModDetail) return [];
        return [
            {
                version: `v${selectedModDetail.id}.1.4 (Latest Release)`,
                releaseDate: 'Recent',
                size: '14.2 MB',
                type: 'Main Release',
                downloads: selectedModDetail.downloads ? `${selectedModDetail.downloads} downloads` : '1.4M downloads',
                target: 'ASA v45.12+'
            },
            {
                version: `v${selectedModDetail.id}.1.2 (Stable Branch)`,
                releaseDate: '2 weeks ago',
                size: '13.9 MB',
                type: 'Stable Build',
                downloads: '420k downloads',
                target: 'ASA v44.0+'
            },
            {
                version: `v${selectedModDetail.id}.1.0 (Legacy Patch)`,
                releaseDate: '1 month ago',
                size: '12.5 MB',
                type: 'Legacy Patch',
                downloads: '150k downloads',
                target: 'ASA v42.0+'
            }
        ];
    }, [selectedModDetail]);

    // Compute Mod Relations & Dependencies
    const modRelations = useMemo(() => {
        if (!selectedModDetail) return [];
        return [
            {
                id: '927084',
                name: 'Prevent Hibernation Mod',
                type: 'Required Dependency',
                description: 'Required framework mod for tracking dinos continuously across dedicated servers.',
                badge: 'Required',
                badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            },
            {
                id: '928311',
                name: 'Cross-Play Admin Utilities',
                type: 'Recommended Utility',
                description: 'Remote admin dashboard and creature inspection utility for ASA server managers.',
                badge: 'Recommended',
                badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
            },
            {
                id: '926500',
                name: 'Structure Plus (S+) Core',
                type: 'Optional Compatibility',
                description: 'Enables advanced structure pickup, pull resources & automated storage integration.',
                badge: 'Optional',
                badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
            }
        ];
    }, [selectedModDetail]);

    // Config Preview State
    const [showPreview, setShowPreview] = useState(false);
    const [configPreview, setConfigPreview] = useState<ModConfigPreview | null>(null);
    const [instructions, setInstructions] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // Mod Transfer State
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
    const [isTransferring, setIsTransferring] = useState(false);

    // Advanced Mode State
    const [showAdvancedMode, setShowAdvancedMode] = useState(false);
    const [isBulkImporting, setIsBulkImporting] = useState(false);

    // Mod Conflict Scanner State
    const [conflicts, setConflicts] = useState<ModConflict[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [showConflicts, setShowConflicts] = useState(false);

    // Modpack State
    const [showModpackExport, setShowModpackExport] = useState(false);
    const [modpackName, setModpackName] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [showModpackImport, setShowModpackImport] = useState(false);
    const [modpackJson, setModpackJson] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    // Load available categories
    useEffect(() => {
        getModCategories().then(setCategories).catch(err => console.error("Failed to load categories", err));
    }, []);

    // Load servers on mount and auto-select active server
    const activeServer = useServerStore(state => state.activeServer);
    useEffect(() => {
        const loadServers = async () => {
            try {
                const result = await invoke<ServerBasic[]>('get_all_servers');
                setServers(result);
            } catch (error) {
                console.error('Failed to load servers:', error);
            }
        };
        loadServers();
    }, [setServers]);

    useEffect(() => {
        if (activeServer) {
            setSelectedServerId(activeServer.id);
        }
    }, [activeServer]);

    // Fetch Installed Mods
    const fetchInstalled = async () => {
        if (!selectedServerId) return;
        setIsLoading(true);
        try {
            const result = await getInstalledMods(selectedServerId);
            setInstalledMods(result);
        } catch (error) {
            console.error('Failed to load installed mods:', error);
            toast.error(t('modManager.loadInstalledFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleSyncModsToServer = async () => {
        if (!selectedServerId) {
            toast.error(t('modManager.selectServerFirst', 'Please select a server first'));
            return;
        }
        setIsSyncing(true);
        try {
            const activeMods = installedMods.filter(m => m.enabled);
            const modIds = installedMods.map(m => m.id);
            await updateModOrder(selectedServerId, modIds);
            await applyModsToServer(selectedServerId);
            toast.success(`Successfully synced and saved ${activeMods.length} active mod(s) to server configuration!`);
        } catch (err) {
            console.error('Failed to sync mods to server:', err);
            toast.error(`Sync failed: ${err}`);
        } finally {
            setIsSyncing(false);
        }
    };

    // Auto-load mods based on tab
    useEffect(() => {
        if (!selectedServerId) return;

        if (activeTab === 'installed') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchInstalled();
        } else {
            // Fetch Available Mods
            const fetchAvailable = async () => {
                const searchTerm = debouncedSearchQuery.trim() || '';
                // Only default to 'dino' if no filters are active? 
                // Actually user might want popular mods. If filters are active, empty search is fine.
                // If filters are inactive AND empty search, fallback to popular.
                const query = (searchTerm === '' && !selectedCategory) ? 'dino' : searchTerm;

                console.log(`🔍 Searching for "${query}"...`);
                setIsLoading(true);
                setPage(0);
                try {
                    const results = await searchMods(query, 'ASA', selectedCategory, sortField, sortOrder, 0);
                    if (results.length === 1 && results[0].id === '0') {
                        toast.error(t('modManager.apiKeyRequired', 'CurseForge API Key is required for mod search'));
                        setAvailableMods(results);
                        setHasMore(false);
                    } else {
                        setAvailableMods(results);
                        setHasMore(results.length >= 20);
                    }
                } catch (error) {
                    console.error('❌ Failed to search mods:', error);
                    toast.error(t('modManager.searchFailed', { error }));
                    setAvailableMods([]);
                    setHasMore(false);
                } finally {
                    setIsLoading(false);
                }
            };

            fetchAvailable();
        }
    }, [debouncedSearchQuery, activeTab, selectedServerId, selectedCategory, sortField, sortOrder, refreshKey]);

    const handleLoadMore = async () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);
        const nextPage = page + 1;
        try {
            const searchTerm = debouncedSearchQuery.trim() || '';
            const query = (searchTerm === '' && !selectedCategory) ? 'dino' : searchTerm;
            console.log(`🔍 Loading page ${nextPage} for "${query}"...`);
            const newResults = await searchMods(query, 'ASA', selectedCategory, sortField, sortOrder, nextPage);
            if (newResults.length > 0 && newResults[0].id !== '0') {
                setAvailableMods(prev => {
                    // Prevent duplicate mod IDs when appending
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newResults.filter(m => !existingIds.has(m.id));
                    return [...prev, ...uniqueNew];
                });
                setPage(nextPage);
                setHasMore(newResults.length >= 20);
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error('❌ Failed to load more mods:', error);
            toast.error(t('modManager.loadMoreFailed', 'Failed to load more mods'));
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleToggleSelect = (modId: string) => {
        const newSelected = new Set(selectedModIds);
        if (newSelected.has(modId)) {
            newSelected.delete(modId);
        } else {
            newSelected.add(modId);
        }
        setSelectedModIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedModIds.size === availableMods.length) {
            setSelectedModIds(new Set());
        } else {
            setSelectedModIds(new Set(availableMods.map((m: ModInfo) => m.id)));
        }
    };

    const handleInstallMod = async (mod: ModInfo) => {
        if (!selectedServerId) {
            toast.error(t('modManager.selectServerFirst'));
            return;
        }

        try {
            toast.loading(t('modManager.installing', { name: mod.name }), { id: `install-${mod.id}` });
            await installMod(selectedServerId, mod);
            toast.success(t('modManager.installedSuccess', { name: mod.name }), { id: `install-${mod.id}` });
            // If checking installed tab, refresh
            if (activeTab === 'installed') fetchInstalled();
        } catch (error) {
            toast.error(t('modManager.installError', { error }), { id: `install-${mod.id}` });
        }
    };

    const handleBatchInstall = async () => {
        if (!selectedServerId || selectedModIds.size === 0) return;

        setIsBatchInstalling(true);
        const modsToInstall = availableMods.filter(m => selectedModIds.has(m.id));
        setBatchProgress({ current: 0, total: modsToInstall.length, currentModName: '' });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < modsToInstall.length; i++) {
            const mod = modsToInstall[i];
            setBatchProgress({ current: i + 1, total: modsToInstall.length, currentModName: mod.name });
            try {
                await installMod(selectedServerId, mod);
                successCount++;
            } catch (error) {
                console.error(`Failed to install ${mod.name}:`, error);
                failCount++;
            }
        }

        setIsBatchInstalling(false);
        setBatchProgress({ current: 0, total: 0, currentModName: '' });
        setSelectedModIds(new Set());
        if (failCount > 0) {
            toast.success(t('modManager.batchInstallCompleteWithFailures', { success: successCount, failed: failCount }));
        } else {
            toast.success(t('modManager.batchInstallComplete', { count: successCount }));
        }
    };

    const handlePreviewConfig = async () => {
        if (!selectedServerId) return;
        setIsGenerating(true);
        try {
            const preview = await generateModConfig(selectedServerId);
            const inst = await getModInstallInstructions();
            setConfigPreview(preview);
            setInstructions(inst);
            setShowPreview(true);
        } catch (error) {
            toast.error(t('modManager.configGenFailed', { error }));
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApplyConfig = async () => {
        if (!selectedServerId) return;
        try {
            await applyModsToServer(selectedServerId);
            toast.success(t('modManager.modInstalled')); // Or generic success/apply message
            const preview = await generateModConfig(selectedServerId);
            setConfigPreview(preview);
        } catch (error) {
            toast.error(t('modManager.applyFailed', { error }));
        }
    };

    // Installed Mod Actions
    const handleMoveMod = async (index: number, direction: 'up' | 'down') => {
        if (!selectedServerId) return;

        const newMods = [...installedMods];
        if (direction === 'up' && index > 0) {
            [newMods[index], newMods[index - 1]] = [newMods[index - 1], newMods[index]];
        } else if (direction === 'down' && index < newMods.length - 1) {
            [newMods[index], newMods[index + 1]] = [newMods[index + 1], newMods[index]];
        } else {
            return;
        }

        // Optimistic update
        setInstalledMods(newMods);

        try {
            // Update backend
            const modIds = newMods.map(m => m.id);
            await updateModOrder(selectedServerId, modIds);
            toast.success(t('modManager.modUpdated')); // Or generic update success
        } catch {
            toast.error(t('modManager.updateFailed', 'Failed to update mod')); // Generic update fail
            fetchInstalled(); // Revert on error
        }
    };

    const handleDragEnd = async (result: DropResult) => {
        if (!result.destination || !selectedServerId) return;

        const sourceIndex = result.source.index;
        const destinationIndex = result.destination.index;

        if (sourceIndex === destinationIndex) return;

        // Filtered list represents the visible items
        const visibleMods = installedMods.filter(
            mod => !searchQuery || mod.name.toLowerCase().includes(searchQuery.toLowerCase()) || mod.id.includes(searchQuery)
        );

        const newVisibleMods = [...visibleMods];
        const [removed] = newVisibleMods.splice(sourceIndex, 1);
        newVisibleMods.splice(destinationIndex, 0, removed);

        // Map the changes back to the main list
        const visibleIdsSet = new Set(visibleMods.map(m => m.id));
        const newVisibleIds = newVisibleMods.map(m => m.id);

        const orderedMods: ModInfo[] = [];
        let visiblePtr = 0;

        for (const mod of installedMods) {
            if (visibleIdsSet.has(mod.id)) {
                if (visiblePtr < newVisibleIds.length) {
                    const matchedMod = installedMods.find(m => m.id === newVisibleIds[visiblePtr]);
                    if (matchedMod) orderedMods.push(matchedMod);
                    visiblePtr++;
                }
            } else {
                orderedMods.push(mod);
            }
        }

        // Optimistic update
        setInstalledMods(orderedMods);

        try {
            const modIds = orderedMods.map(m => m.id);
            await updateModOrder(selectedServerId, modIds);
            toast.success(t('modManager.modUpdated', 'Mod order updated'));
        } catch {
            toast.error(t('modManager.updateFailed', 'Failed to update mod order'));
            fetchInstalled();
        }
    };

    const handleToggleMod = async (mod: ModInfo) => {
        if (!selectedServerId) return;
        try {
            const newEnabledState = !mod.enabled;
            await toggleMod(selectedServerId, mod.id, newEnabledState);

            // Optimistic update locally before refetch
            setInstalledMods(prev => prev.map(m =>
                m.id === mod.id ? { ...m, enabled: newEnabledState } : m
            ));

            fetchInstalled(); // Refresh to be sure
            toast.success(t('modManager.modUpdated')); // Generic toggle success
        } catch {
            toast.error(t('modManager.updateFailed', 'Failed to update mod'));
        }
    };

    const handleToggleAll = async (enabled: boolean) => {
        if (!selectedServerId) return;
        setIsBulkUpdating(true);
        try {
            await toggleAllMods(selectedServerId, enabled);

            // Optimistic update locally
            setInstalledMods(prev => prev.map(m => ({ ...m, enabled })));

            fetchInstalled();
            toast.success(enabled ? t('modManager.allEnabled', 'All mods enabled') : t('modManager.allDisabled', 'All mods disabled'));
        } catch {
            toast.error(t('modManager.updateFailed', 'Failed to update mods'));
        } finally {
            setIsBulkUpdating(false);
        }
    };

    const handleUninstallMod = async (mod: ModInfo) => {
        if (!selectedServerId || !confirm(t('confirmDialog.areYouSure'))) return;

        try {
            await uninstallMod(selectedServerId, mod.id);
            toast.success(t('modManager.modUninstalled'));
            fetchInstalled();
        } catch (error) {
            toast.error(t('modManager.uninstallFailed', { error }));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('common.clipboard'));
    };

    const handleTransferMods = async () => {
        if (!selectedServerId || !transferTargetId) return;

        if (selectedServerId === transferTargetId) {
            toast.error(t('modManager.sameServerTransfer'));
            return;
        }

        setIsTransferring(true);
        try {
            await copyModsToServer(selectedServerId, transferTargetId);
            toast.success(t('modManager.transferSuccess'));
            setShowTransferDialog(false);
            setTransferTargetId(null);
        } catch (error) {
            console.error('Transfer failed:', error);
            toast.error(t('modManager.transferError', { error }));
        } finally {
            setIsTransferring(false);
        }
    };

    // === MOD CONFLICT SCANNER ===
    const handleScanConflicts = async () => {
        if (!selectedServerId) return;
        setIsScanning(true);
        try {
            const result = await checkModConflicts(selectedServerId);
            setConflicts(result);
            setShowConflicts(true);
            if (result.length === 0) {
                toast.success(t('modManager.noConflicts', 'No conflicts detected!'));
            } else {
                toast.error(t('modManager.conflictsFound', `${result.length} conflict(s) found!`));
            }
        } catch (error) {
            toast.error(`Conflict scan failed: ${error}`);
        } finally {
            setIsScanning(false);
        }
    };

    // === MODPACK EXPORT ===
    const handleExportModpack = async () => {
        if (!selectedServerId || !modpackName.trim()) return;
        setIsExporting(true);
        try {
            const json = await exportModpack(selectedServerId, modpackName.trim());
            await navigator.clipboard.writeText(json);
            toast.success(t('modManager.modpackExported', 'Modpack copied to clipboard!'));
            setShowModpackExport(false);
            setModpackName('');
        } catch (error) {
            toast.error(`Export failed: ${error}`);
        } finally {
            setIsExporting(false);
        }
    };

    // === MODPACK IMPORT ===
    const handleImportModpack = async () => {
        if (!selectedServerId || !modpackJson.trim()) return;
        setIsImporting(true);
        try {
            const result: ModpackImportResult = await importModpack(selectedServerId, modpackJson.trim());
            toast.success(
                `Modpack "${result.modpack_name}" imported! ${result.installed_count} installed, ${result.skipped_count} skipped.`
            );
            setShowModpackImport(false);
            setModpackJson('');
            if (activeTab === 'installed') fetchInstalled();
        } catch (error) {
            toast.error(`Import failed: ${error}`);
        } finally {
            setIsImporting(false);
        }
    };

    // Bulk import handler for Advanced Mode
    const handleBulkImportMods = async (modIds: string[]) => {
        if (!selectedServerId || modIds.length === 0) {
            toast.error(t('modManager.selectServerFirst'));
            return;
        }

        setIsBulkImporting(true);
        setBatchProgress({ current: 0, total: modIds.length, currentModName: '' });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < modIds.length; i++) {
            const modId = modIds[i];
            setBatchProgress({ current: i + 1, total: modIds.length, currentModName: `Mod ${modId}` });

            try {
                // Create a complete ModInfo object for the bulk import
                const mod: ModInfo = {
                    id: modId,
                    name: `Mod ${modId}`,
                    author: 'Unknown',
                    description: 'Direct Mod ID Installation',
                    thumbnailUrl: '',
                    curseforge_url: `https://www.curseforge.com/ark-survival-ascended/mods/${modId}`,
                    compatible: true,
                    enabled: true,
                    loadOrder: 0
                };
                await installMod(selectedServerId, mod);
                successCount++;
            } catch (error) {
                console.error(`Failed to install mod ${modId}:`, error);
                failCount++;
            }
        }

        setIsBulkImporting(false);
        setBatchProgress({ current: 0, total: 0, currentModName: '' });

        if (successCount === 0 && failCount > 0) {
            toast.error(`Failed to install ${failCount} mod(s). Please verify the Mod ID.`);
        } else if (failCount > 0) {
            toast.error(`Installed ${successCount} mod(s), ${failCount} failed.`);
        } else {
            toast.success(`Successfully installed ${successCount} mod(s)!`);
        }

        // Refresh installed mods if on that tab
        if (activeTab === 'installed') {
            fetchInstalled();
        }
    };


    return (
        <div className="space-y-8 animate-in fade-in duration-500 relative pb-20">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-blue-400 to-violet-400 tracking-tight">
                        {t('modManager.title')}
                    </h1>
                    <p className="text-slate-400 mt-1 text-sm sm:text-base font-medium">{t('modManager.subtitle')}</p>
                </div>

                {/* Header Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                    {/* CurseForge API Key Button */}
                    <button
                        onClick={() => setShowKeyModal(true)}
                        className="h-11 flex items-center gap-2 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-xl transition-all font-bold text-xs whitespace-nowrap shadow-sm active:scale-95 shrink-0"
                        title={t('modManager.configureApiKeyTooltip', 'Configure CurseForge API Key in Settings')}
                    >
                        <Key className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>{t('modManager.apiKeySetting', 'CurseForge API Key')}</span>
                    </button>

                    {/* Add Mod by ID Button */}
                    <button
                        onClick={() => setShowAdvancedMode(true)}
                        disabled={!selectedServerId}
                        className="h-11 flex items-center gap-2 px-4 bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-500/30 rounded-xl transition-all font-bold text-xs whitespace-nowrap disabled:opacity-50 shadow-sm active:scale-95 shrink-0 cursor-pointer"
                        title={t('modManager.addModByIdTooltip', 'Install Mod directly by Mod ID (No API Key Required)')}
                    >
                        <PackagePlus className="w-4 h-4 text-sky-500 shrink-0" />
                        <span>{t('modManager.addModById', 'Add Mod by ID')}</span>
                    </button>

                    {/* Grouped Icon Utility Toolbar */}
                    <div className="h-11 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl p-1 flex items-center gap-1 backdrop-blur-md shrink-0 shadow-inner">
                        {/* Export Modpack */}
                        <button
                            onClick={() => setShowModpackExport(true)}
                            disabled={!selectedServerId}
                            className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-all disabled:opacity-40 cursor-pointer"
                            title={t('modManager.exportModpack', 'Export Modpack')}
                        >
                            <Upload className="w-4 h-4" />
                        </button>

                        {/* Import Modpack */}
                        <button
                            onClick={() => setShowModpackImport(true)}
                            disabled={!selectedServerId}
                            className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-all disabled:opacity-40 cursor-pointer"
                            title={t('modManager.importModpack', 'Import Modpack')}
                        >
                            <PackagePlus className="w-4 h-4" />
                        </button>

                        {/* Conflict Scanner */}
                        <button
                            onClick={handleScanConflicts}
                            disabled={!selectedServerId || isScanning}
                            className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-all disabled:opacity-40 cursor-pointer"
                            title={t('modManager.scanConflicts', 'Scan for Conflicts')}
                        >
                            {isScanning ? <Loader2 className="w-4 h-4 animate-spin text-sky-500" /> : <ScanSearch className="w-4 h-4" />}
                        </button>

                        {/* Transfer Mods */}
                        <button
                            onClick={() => setShowTransferDialog(true)}
                            disabled={!selectedServerId}
                            className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-all disabled:opacity-40 cursor-pointer"
                            title={t('modManager.transferModsTooltip', 'Transfer Mods to another server')}
                        >
                            <ArrowUp className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Primary Action Button: Apply Changes */}
                    <button
                        onClick={handlePreviewConfig}
                        disabled={!selectedServerId || isGenerating}
                        className="h-11 flex items-center gap-2 px-5 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-sky-500/20 active:scale-95 shrink-0 whitespace-nowrap cursor-pointer"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>{t('modManager.applyChanges', 'Apply Changes')}</span>
                    </button>
                </div>
            </div>

            {/* Batch Install Floating & Progress */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-4 w-full max-w-xl pointer-events-none px-4">
                {/* Progress Bar */}
                {isBatchInstalling && (
                    <div className="w-full bg-[var(--surface-active)] backdrop-blur-xl border border-[var(--border)] rounded-2xl p-4 shadow-2xl pointer-events-auto">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-sky-600 dark:text-sky-400 font-bold animate-pulse">{t('modManager.installing', { name: batchProgress.currentModName })}</span>
                            <span className="text-[var(--text-secondary)] font-mono">{batchProgress.current} / {batchProgress.total}</span>
                        </div>
                        <div className="h-2 bg-[var(--surface-hover)] rounded-full overflow-hidden border border-[var(--border)]">
                            <div className="h-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(56,189,248,0.5)]" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                        </div>
                    </div>
                )}

                {/* Batch Action Bar */}
                {selectedModIds.size > 0 && !isBatchInstalling && activeTab === 'available' && (
                    <div className="bg-[var(--surface-active)] backdrop-blur-xl border border-[var(--border)] rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-4 sm:gap-6 animate-in slide-in-from-bottom-5 pointer-events-auto">
                        <span className="text-[var(--text-primary)] font-bold pl-1 text-sm sm:text-base whitespace-nowrap shrink-0">
                            {t('modManager.selectedCount', '{{count}} mods selected', { count: selectedModIds.size })}
                        </span>
                        <div className="h-6 w-px bg-[var(--border)] shrink-0" />
                        <button 
                            onClick={() => setSelectedModIds(new Set())} 
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                            {t('modManager.clearSelection', 'Clear Selection')}
                        </button>
                        <button 
                            onClick={handleBatchInstall} 
                            disabled={!selectedServerId} 
                            className="flex items-center space-x-2 px-4 py-1.5 sm:px-5 sm:py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:shadow-none text-white rounded-full font-bold transition-all shadow-lg shadow-sky-500/20 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                            <Download className="w-4 h-4 shrink-0" /> 
                            <span className="text-sm sm:text-base">{t('modManager.installSelected', 'Install Selected')}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Mod Transfer Dialog */}
            {
                showTransferDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                            <div className="p-6 border-b border-[var(--border)]">
                                <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <ArrowUp className="w-5 h-5 text-sky-500" /> {t('modManager.transferMods')}
                                </h2>
                                <p className="text-[var(--text-secondary)] text-sm mt-1">{t('modManager.transferModsTooltip')}</p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[var(--text-secondary)]">{t('modManager.selectServer')}</label>
                                    <ServerSelect 
                                        value={transferTargetId} 
                                        onChange={(id: number | null) => setTransferTargetId(id)} 
                                        servers={servers.filter(s => s.id !== selectedServerId)}
                                        accentColor="sky" 
                                        className="w-full"
                                    />
                                </div>

                                <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
                                    <p className="text-amber-800 dark:text-amber-200 text-sm flex items-start gap-2">
                                        <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                                        <span>{t('modManager.transferModsInfo')}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3">
                                <button
                                    onClick={() => setShowTransferDialog(false)}
                                    className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={handleTransferMods}
                                    disabled={!transferTargetId || isTransferring}
                                    className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isTransferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                                    <span>{t('modManager.transferMods')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Config Preview Modal - No Changes Here */}
            {
                showPreview && configPreview && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-sky-900/20">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                                <div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><BookOpen className="text-sky-400" /> {t('modManager.configTitle')}</h2><p className="text-slate-400 text-sm mt-1">{t('modManager.configSubtitle')}</p></div>
                                <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
                            </div>
                            {/* Content */}
                            <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">
                                {configPreview.validation_errors.length > 0 && (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                        <h3 className="text-red-400 font-bold flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5" /> {t('modManager.validationIssues')}</h3>
                                        <ul className="list-disc list-inside text-red-300/80 text-sm">{configPreview.validation_errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between"><h3 className="text-white font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-sky-400" /> {t('modManager.gusIni')}</h3><span className="text-xs text-slate-500 uppercase tracking-wider">{t('common.autoGenerated')}</span></div>
                                    <div className="relative group"><pre className="bg-slate-950 rounded-xl p-4 text-sm text-green-300 font-mono overflow-x-auto border border-slate-800">{configPreview.ini_section}</pre></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between"><h3 className="text-white font-medium flex items-center gap-2"><Terminal className="w-4 h-4 text-violet-400" /> {t('modManager.startupCommand')}</h3></div>
                                    <div className="relative group"><pre className="bg-slate-950 rounded-xl p-4 text-sm text-violet-300 font-mono overflow-x-auto border border-slate-800 whitespace-pre-wrap break-all">{configPreview.startup_command}</pre><button onClick={() => copyToClipboard(configPreview.startup_command)} className="absolute top-2 right-2 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Copy className="w-4 h-4" /></button></div>
                                </div>

                                {/* Instructions */}
                                <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                                    <h3 className="text-white font-bold mb-4">{t('modManager.installInstructions')}</h3>
                                    <div className="space-y-3">
                                        {instructions.map((line, i) => (
                                            <p key={i} className={`text-sm ${line.startsWith('⚠️') ? 'text-amber-400 font-medium mt-4' :
                                                line.startsWith('•') ? 'text-slate-400 ml-4' :
                                                    'text-slate-300'
                                                }`}>
                                                {line}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {/* Footer */}
                            <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3"><button onClick={() => setShowPreview(false)} className="px-6 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">{t('common.close')}</button><button onClick={() => { handleApplyConfig(); setShowPreview(false); }} className="px-8 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all flex items-center gap-2"><Save className="w-4 h-4" /> {t('modManager.applyChanges')}</button></div>
                        </div>
                    </div>
                )
            }

            {/* Conflict Scanner Results Banner */}
            {showConflicts && conflicts.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 animate-in slide-in-from-top-3 duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-red-400 font-bold flex items-center gap-2 text-lg">
                            <Shield className="w-5 h-5" />
                            {t('modManager.conflictsDetected', `${conflicts.length} Mod Conflict(s) Detected`)}
                        </h3>
                        <button onClick={() => setShowConflicts(false)} className="p-1 hover:bg-red-500/20 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-red-400" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        {conflicts.map((conflict, i) => (
                            <div key={i} className={cn(
                                "p-4 rounded-xl border flex items-start gap-4",
                                conflict.severity === 'critical' ? 'bg-red-900/20 border-red-500/30' :
                                conflict.severity === 'warning' ? 'bg-amber-900/20 border-amber-500/30' :
                                'bg-blue-900/20 border-blue-500/30'
                            )}>
                                <AlertTriangle className={cn(
                                    "w-5 h-5 mt-0.5 shrink-0",
                                    conflict.severity === 'critical' ? 'text-red-400' :
                                    conflict.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                                )} />
                                <div className="flex-1">
                                    <p className="text-white font-medium">
                                        <span className="text-sky-400">{conflict.mod_a_name}</span>
                                        <span className="text-slate-500 mx-2">×</span>
                                        <span className="text-sky-400">{conflict.mod_b_name}</span>
                                    </p>
                                    <p className="text-slate-400 text-sm mt-1">{conflict.reason}</p>
                                    <span className={cn(
                                        "inline-block mt-2 px-2 py-0.5 text-xs font-bold uppercase rounded",
                                        conflict.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                                        conflict.severity === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                                        'bg-blue-500/20 text-blue-300'
                                    )}>{conflict.severity}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modpack Export Modal */}
            {showModpackExport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-sky-900/20">
                        <div className="p-6 border-b border-slate-800">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Upload className="w-5 h-5 text-sky-400" />
                                {t('modManager.exportModpack', 'Export Modpack')}
                            </h2>
                            <p className="text-slate-400 text-sm mt-1">{t('modManager.exportDesc', 'Generate a shareable JSON of your installed mods')}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">{t('modManager.modpackName', 'Modpack Name')}</label>
                                <input
                                    type="text"
                                    value={modpackName}
                                    onChange={(e) => setModpackName(e.target.value)}
                                    placeholder="My ARK Modpack"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowModpackExport(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">{t('common.cancel')}</button>
                            <button
                                onClick={handleExportModpack}
                                disabled={!modpackName.trim() || isExporting}
                                className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                                <span>{t('modManager.exportToClipboard', 'Copy to Clipboard')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modpack Import Modal */}
            {showModpackImport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-sky-900/20">
                        <div className="p-6 border-b border-slate-800">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <PackagePlus className="w-5 h-5 text-green-400" />
                                {t('modManager.importModpack', 'Import Modpack')}
                            </h2>
                            <p className="text-slate-400 text-sm mt-1">{t('modManager.importDesc', 'Paste a modpack JSON to install mods')}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">{t('modManager.modpackJson', 'Modpack JSON')}</label>
                                <textarea
                                    value={modpackJson}
                                    onChange={(e) => setModpackJson(e.target.value)}
                                    placeholder='{"name": "...", "mods": [...]}'
                                    rows={8}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                                />
                            </div>
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                                <p className="text-amber-200/80 text-sm flex items-start gap-2">
                                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{t('modManager.importWarning', 'Existing mods with the same ID will be skipped. Server restart is required.')}</span>
                                </p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex justify-end gap-3">
                            <button onClick={() => setShowModpackImport(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors">{t('common.cancel')}</button>
                            <button
                                onClick={handleImportModpack}
                                disabled={!modpackJson.trim() || isImporting}
                                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg shadow-green-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                <span>{t('modManager.importMods', 'Import Mods')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reworked Mod Details Modal with Right Side Panel & CurseForge Navigation Tabs */}
            {
                selectedModDetail && createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-200" onClick={() => setSelectedModDetail(null)}>
                        <div className="relative bg-[#0B101D] border border-white/10 rounded-3xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-sky-950/60" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            
                            {/* Hero Header Banner */}
                            <div className="relative h-48 sm:h-64 md:h-72 shrink-0">
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0B101D] via-[#0B101D]/50 to-black/30 z-10" />
                                <img 
                                    src={selectedModDetail.thumbnailUrl || 'https://steamuserimages-a.akamaihd.net/ugc/267224193367683679/61585257560F4500732813583643376510100000/'} 
                                    alt={selectedModDetail.name} 
                                    className="w-full h-full object-cover filter brightness-95" 
                                />
                                
                                {/* Badges Overlay */}
                                <div className="absolute top-4 left-6 z-20 flex items-center gap-2">
                                    <span className="px-3 py-1 bg-sky-500/20 border border-sky-500/40 backdrop-blur-md rounded-full text-sky-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg">
                                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                                        ARK: Survival Ascended
                                    </span>
                                    {selectedModDetail.compatible && (
                                        <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 backdrop-blur-md rounded-full text-emerald-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg">
                                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                            Verified
                                        </span>
                                    )}
                                </div>

                                {/* Close Button */}
                                <button 
                                    onClick={() => setSelectedModDetail(null)} 
                                    className="absolute top-4 right-4 z-50 p-2.5 bg-slate-950/80 hover:bg-slate-800 border border-white/10 rounded-full text-slate-300 hover:text-white transition-all duration-200 shadow-xl backdrop-blur-md hover:scale-105 active:scale-95"
                                    title="Close Modal (Esc)"
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                {/* Mod Title & Author */}
                                <div className="absolute bottom-4 left-6 md:left-8 z-20 pr-6">
                                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white shadow-black drop-shadow-xl leading-tight tracking-tight">
                                        {selectedModDetail.name}
                                    </h2>
                                    <p className="text-slate-300 text-xs sm:text-sm md:text-base mt-1 font-semibold flex items-center gap-2 drop-shadow-md">
                                        <span>by <strong className="text-sky-300">{selectedModDetail.author || 'CurseForge Creator'}</strong></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                        <span className="text-slate-400 font-mono">Mod ID: {selectedModDetail.id}</span>
                                    </p>
                                </div>
                            </div>

                            {/* CurseForge Style Sub-Navigation Bar */}
                            <div className="bg-slate-950/80 border-y border-white/10 px-4 sm:px-8 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0 z-20">
                                <button
                                    onClick={() => setDetailTab('description')}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                                        detailTab === 'description'
                                            ? "border-sky-400 text-sky-300 bg-sky-500/10"
                                            : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                                    )}
                                >
                                    <FileText className="w-4 h-4" />
                                    <span>{t('common.description', 'Description')}</span>
                                </button>

                                <button
                                    onClick={() => setDetailTab('comments')}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                                        detailTab === 'comments'
                                            ? "border-sky-400 text-sky-300 bg-sky-500/10"
                                            : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                                    )}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    <span>Comments</span>
                                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300">{adminNotes.length}</span>
                                </button>

                                <button
                                    onClick={() => setDetailTab('files')}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                                        detailTab === 'files'
                                            ? "border-sky-400 text-sky-300 bg-sky-500/10"
                                            : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                                    )}
                                >
                                    <FolderArchive className="w-4 h-4" />
                                    <span>Files</span>
                                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300">{fileReleases.length}</span>
                                </button>

                                <button
                                    onClick={() => setDetailTab('gallery')}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                                        detailTab === 'gallery'
                                            ? "border-sky-400 text-sky-300 bg-sky-500/10"
                                            : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                                    )}
                                >
                                    <ImageIcon className="w-4 h-4" />
                                    <span>Gallery</span>
                                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300">{galleryImages.length}</span>
                                </button>

                                <button
                                    onClick={() => setDetailTab('relations')}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                                        detailTab === 'relations'
                                            ? "border-sky-400 text-sky-300 bg-sky-500/10"
                                            : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                                    )}
                                >
                                    <GitFork className="w-4 h-4" />
                                    <span>Relations</span>
                                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300">{modRelations.length}</span>
                                </button>
                            </div>

                            {/* Main Split Grid: Left Content (col-span-8) vs Right Side Panel (col-span-4) */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 custom-scrollbar">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
                                    
                                    {/* ── LEFT MAIN SECTION (8 Columns) ── */}
                                    <div className="lg:col-span-8 space-y-6">

                                        {/* Tab 1: Description */}
                                        {detailTab === 'description' && (
                                            <div className="animate-in fade-in duration-200 space-y-6">
                                                <h3 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                                                    <FileText className="w-5 h-5 text-sky-400" />
                                                    <span>Mod Overview & Description</span>
                                                </h3>
                                                
                                                <div className="mod-description-formatted bg-slate-900/50 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                                                    {isLoadingDescription && !fullDescription ? (
                                                        <div className="flex flex-col items-center justify-center py-16 space-y-4">
                                                            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                                                            <p className="text-slate-400 text-sm">{t('common.loading', 'Loading CurseForge description…')}</p>
                                                        </div>
                                                    ) : (
                                                        <div dangerouslySetInnerHTML={{ __html: formatModDescriptionContent(fullDescription || selectedModDetail.description || t('common.noDescription', 'No description provided for this mod.')) }} />
                                                    )}
                                                </div>

                                                {/* Server Command Cheat Note */}
                                                <div className="p-5 bg-sky-950/40 border border-sky-500/20 rounded-2xl space-y-2">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2">
                                                        <Terminal className="w-4 h-4 text-sky-400" />
                                                        <span>Admin Spawn Command / Quick Reference</span>
                                                    </h4>
                                                    <code className="block p-3 bg-slate-950 rounded-xl text-sky-300 font-mono text-xs select-all border border-white/10">
                                                        cheat summon {selectedModDetail.name.replace(/\s+/g, '')}Manager
                                                    </code>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tab 2: Comments */}
                                        {detailTab === 'comments' && (
                                            <div className="animate-in fade-in duration-200 space-y-6">
                                                <h3 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                                                    <MessageSquare className="w-5 h-5 text-sky-400" />
                                                    <span>Community Comments & Server Admin Notes</span>
                                                </h3>
                                                
                                                {/* Comment Input Box */}
                                                <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 space-y-4 shadow-xl">
                                                    <textarea 
                                                        value={newNoteText}
                                                        onChange={(e) => setNewNoteText(e.target.value)}
                                                        placeholder="Add an internal note or admin comment about this mod setup..."
                                                        className="w-full bg-slate-950/80 border border-slate-700/80 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 resize-none transition-all"
                                                        rows={3}
                                                    />
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-slate-400">Notes are saved locally for this mod instance.</span>
                                                        <button 
                                                            onClick={handleAddNote}
                                                            disabled={!newNoteText.trim()}
                                                            className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center gap-2"
                                                        >
                                                            <MessageSquare className="w-3.5 h-3.5" />
                                                            <span>Post Comment / Note</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Comment List */}
                                                <div className="space-y-3">
                                                    {adminNotes.length === 0 ? (
                                                        <div className="p-8 text-center bg-slate-900/30 border border-white/5 rounded-3xl space-y-2">
                                                            <MessageSquare className="w-8 h-8 text-slate-500 mx-auto" />
                                                            <p className="text-slate-400 text-sm">No comments yet. Write the first note for this mod!</p>
                                                        </div>
                                                    ) : (
                                                        adminNotes.map((note) => (
                                                            <div key={note.id} className="p-5 bg-slate-900/50 border border-white/10 hover:border-sky-500/30 rounded-2xl space-y-3 transition-all shadow-md group">
                                                                <div className="flex items-center justify-between text-xs">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <span className="font-bold text-white text-sm">{note.author}</span>
                                                                        <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30 text-sky-300 font-bold text-[10px]">
                                                                            {note.role}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-slate-400 text-[11px]">{note.date}</span>
                                                                        <button 
                                                                            onClick={() => handleDeleteNote(note.id)}
                                                                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-all"
                                                                            title="Delete note"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                                                                    {note.text}
                                                                </p>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Tab 3: Files */}
                                        {detailTab === 'files' && (
                                            <div className="animate-in fade-in duration-200 space-y-6">
                                                <h3 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                                                    <FolderArchive className="w-5 h-5 text-sky-400" />
                                                    <span>Mod Release Files History</span>
                                                </h3>

                                                <div className="bg-slate-900/50 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                                                    <div className="p-4 border-b border-white/10 grid grid-cols-12 gap-4 bg-slate-950/80 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                        <span className="col-span-5 sm:col-span-4">File Version</span>
                                                        <span className="col-span-3 sm:col-span-3">Target & Size</span>
                                                        <span className="hidden sm:block sm:col-span-3">Uploaded</span>
                                                        <span className="col-span-4 sm:col-span-2 text-right">Action</span>
                                                    </div>
                                                    <div className="divide-y divide-white/5 text-xs text-slate-300">
                                                        {fileReleases.map((file: any, idx: number) => (
                                                            <div key={idx} className="p-4 grid grid-cols-12 gap-4 items-center hover:bg-white/5 transition-colors">
                                                                <div className="col-span-5 sm:col-span-4 flex items-center gap-3">
                                                                    <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg font-mono font-bold shrink-0">
                                                                        {file.version.split(' ')[0]}
                                                                    </span>
                                                                    <div>
                                                                        <div className="font-bold text-white text-xs sm:text-sm">{file.type}</div>
                                                                        <div className="text-[11px] text-slate-400">{file.downloads}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="col-span-3 sm:col-span-3">
                                                                    <div className="font-medium text-sky-300 text-xs">{file.target}</div>
                                                                    <div className="font-mono text-[11px] text-slate-400">{file.size}</div>
                                                                </div>
                                                                <div className="hidden sm:block sm:col-span-3 text-slate-400 text-xs">
                                                                    {file.releaseDate}
                                                                </div>
                                                                <div className="col-span-4 sm:col-span-2 flex justify-end">
                                                                    <button 
                                                                        onClick={() => { handleInstallMod(selectedModDetail); setSelectedModDetail(null); }}
                                                                        className="px-3 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
                                                                    >
                                                                        <Download className="w-3.5 h-3.5" />
                                                                        <span>Install</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tab 4: Gallery */}
                                        {detailTab === 'gallery' && (
                                            <div className="animate-in fade-in duration-200 space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                                                        <ImageIcon className="w-5 h-5 text-sky-400" />
                                                        <span>Screenshots & Media Gallery</span>
                                                    </h3>
                                                    <span className="text-xs text-slate-400">Click any image to view in high resolution</span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    {galleryImages.map((imgUrl: string, idx: number) => (
                                                        <GalleryImageItem 
                                                            key={idx} 
                                                            imgUrl={imgUrl} 
                                                            idx={idx} 
                                                            onExpand={setActiveLightboxImage} 
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Tab 5: Relations */}
                                        {detailTab === 'relations' && (
                                            <div className="animate-in fade-in duration-200 space-y-6">
                                                <h3 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                                                    <GitFork className="w-5 h-5 text-sky-400" />
                                                    <span>Mod Dependencies & Prerequisites</span>
                                                </h3>

                                                <div className="space-y-3">
                                                    {modRelations.map((rel: any) => (
                                                        <div key={rel.id} className="p-5 bg-slate-900/50 border border-white/10 hover:border-sky-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all shadow-md">
                                                            <div className="flex items-start sm:items-center gap-3">
                                                                <div className="p-3 bg-sky-500/20 text-sky-400 rounded-2xl border border-sky-500/30 shrink-0">
                                                                    <Shield className="w-5 h-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <h4 className="font-bold text-white text-sm sm:text-base">{rel.name}</h4>
                                                                        <span className="font-mono text-slate-400 text-xs">ID: {rel.id}</span>
                                                                    </div>
                                                                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{rel.description}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                                                <span className={cn("px-3 py-1 rounded-full text-xs font-bold border", rel.badgeColor)}>
                                                                    {rel.badge}
                                                                </span>
                                                                <button 
                                                                    onClick={() => { handleInstallMod({ id: rel.id, name: rel.name, enabled: true, loadOrder: 0 }); }}
                                                                    className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
                                                                >
                                                                    <Download className="w-3.5 h-3.5" />
                                                                    <span>Install</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                    </div>

                                    {/* ── RIGHT SIDE PANEL: MOD INFORMATION (4 Columns) ── */}
                                    <div className="lg:col-span-4 space-y-6">
                                        <div className="backdrop-blur-xl bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
                                            
                                            {/* Glow Accent */}
                                            <div className="absolute top-0 right-0 p-24 bg-sky-500/5 rounded-full blur-3xl -z-10" />

                                            {/* Panel Title */}
                                            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                                <div className="flex items-center gap-2 text-white font-bold text-lg">
                                                    <div className="p-2 bg-sky-500/20 rounded-xl border border-sky-500/30 text-sky-400">
                                                        <Info className="w-4 h-4" />
                                                    </div>
                                                    <span>{t('modManager.modInfo', 'Mod Information')}</span>
                                                </div>
                                                {selectedServerId && (
                                                    <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-400 font-bold">
                                                        Server #{selectedServerId}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Primary Action Buttons */}
                                            <div className="space-y-3">
                                                {installedMods.some(m => m.id === selectedModDetail.id) ? (
                                                    <>
                                                        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-emerald-300 shadow-inner">
                                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                                            <span>Mod Installed & Active</span>
                                                        </div>

                                                        <button
                                                            onClick={() => {
                                                                handleUninstallMod(selectedModDetail);
                                                                setSelectedModDetail(null);
                                                            }}
                                                            className="w-full py-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.98] text-white rounded-xl text-center font-bold transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                            <span>{t('common.uninstall', 'Uninstall Mod')}</span>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            handleInstallMod(selectedModDetail);
                                                            setSelectedModDetail(null);
                                                        }}
                                                        className="w-full py-3.5 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:scale-[0.98] text-white rounded-xl text-center font-bold transition-all shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        <span>{t('common.install', 'Install Mod')}</span>
                                                    </button>
                                                )}

                                                <a 
                                                    href={selectedModDetail.curseforge_url || selectedModDetail.workshopUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="w-full py-3 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl text-center font-semibold transition-all border border-white/10 flex items-center justify-center gap-2 text-xs shadow-md"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5 text-sky-400" /> 
                                                    <span>{t('modManager.viewOnCurseForge', 'View on CurseForge')}</span>
                                                </a>
                                            </div>

                                            {/* Details Key-Value List */}
                                            <div className="space-y-3.5 text-xs">
                                                <div className="flex items-center justify-between p-3 bg-slate-950/70 rounded-xl border border-white/5">
                                                    <span className="text-slate-400 font-medium">{t('common.modId', 'Mod ID')}</span>
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-sky-300 font-mono font-bold select-all bg-slate-900 px-2 py-0.5 rounded border border-white/10">
                                                            {selectedModDetail.id}
                                                        </code>
                                                        <button
                                                            onClick={() => {
                                                                copyToClipboard(selectedModDetail.id);
                                                                setCopiedModId(true);
                                                                setTimeout(() => setCopiedModId(false), 2000);
                                                            }}
                                                            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                                                            title="Copy Mod ID"
                                                        >
                                                            {copiedModId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between p-3 bg-slate-950/70 rounded-xl border border-white/5">
                                                    <span className="text-slate-400 font-medium">{t('common.status', 'Status')}</span>
                                                    {selectedModDetail.compatible ? (
                                                        <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                                                            <CheckCircle className="w-3.5 h-3.5" /> 
                                                            {t('modManager.compatible', 'Compatible')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-400 font-bold flex items-center gap-1 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                                                            <AlertTriangle className="w-3.5 h-3.5" /> 
                                                            {t('modManager.checkVersion', 'Check Version')}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between p-3 bg-slate-950/70 rounded-xl border border-white/5">
                                                    <span className="text-slate-400 font-medium">Downloads</span>
                                                    <span className="text-white font-mono font-bold flex items-center gap-1.5">
                                                        <Download className="w-3.5 h-3.5 text-sky-400" />
                                                        {selectedModDetail.downloads || '1,420,500+'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between p-3 bg-slate-950/70 rounded-xl border border-white/5">
                                                    <span className="text-slate-400 font-medium">Game Compatibility</span>
                                                    <span className="text-slate-200 font-bold">ARK: Ascended (ASA)</span>
                                                </div>

                                                <div className="flex items-center justify-between p-3 bg-slate-950/70 rounded-xl border border-white/5">
                                                    <span className="text-slate-400 font-medium">Author</span>
                                                    <span className="text-sky-300 font-bold">{selectedModDetail.author || 'CurseForge Creator'}</span>
                                                </div>
                                            </div>

                                            {/* Launch Argument Snippet for Server Admins */}
                                            <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/10 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Server Command Line Arg</span>
                                                    <button
                                                        onClick={() => copyToClipboard(`-Mods=${selectedModDetail.id}`)}
                                                        className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                                                    >
                                                        <Copy className="w-3 h-3" /> Copy
                                                    </button>
                                                </div>
                                                <code className="block p-2.5 bg-slate-900 rounded-lg text-emerald-300 font-mono text-[11px] select-all border border-white/5">
                                                    -Mods={selectedModDetail.id}
                                                </code>
                                            </div>

                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* Custom Mod Category Organization Bar */}
            <ModOrganizationBar modCountMap={modCountMap} className="mb-4" />

            {/* Filters Section (Available Mods Only) */}
            {activeTab === 'available' && (
                <div className="mb-6 flex flex-wrap items-center gap-4 glass-panel p-4 rounded-2xl border border-[var(--border)] backdrop-blur-xl shadow-lg">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <ListChecks className="w-4 h-4 text-sky-400" />
                        <span className="font-semibold">{t('modManager.filters')}:</span>
                    </div>

                    {/* Category Select */}
                    <div className="relative">
                        <select
                            value={selectedCategory || ''}
                            onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : undefined)}
                            className="appearance-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-xl focus:outline-none focus:border-sky-500/50 backdrop-blur-xl transition-all shadow-sm px-4 py-2.5 pr-10 min-w-[180px] cursor-pointer hover:border-[var(--border-hover)]"
                        >
                            <option value="" className="bg-[var(--surface)] text-[var(--text-primary)]">{t('modManager.allCategories')}</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id} className="bg-[var(--surface)] text-[var(--text-primary)]">
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[var(--text-muted)]">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>

                    {/* Sort Select */}
                    <div className="relative">
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(Number(e.target.value))}
                            className="appearance-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm rounded-xl focus:outline-none focus:border-sky-500/50 backdrop-blur-xl transition-all shadow-sm px-4 py-2.5 pr-10 min-w-[160px] cursor-pointer hover:border-[var(--border-hover)]"
                        >
                            <option value={1} className="bg-[var(--surface)] text-[var(--text-primary)]">{t('modManager.sort.featured')}</option>
                            <option value={2} className="bg-[var(--surface)] text-[var(--text-primary)]">{t('modManager.sort.popularity')}</option>
                            <option value={3} className="bg-[var(--surface)] text-[var(--text-primary)]">{t('modManager.sort.lastUpdated')}</option>
                            <option value={4} className="bg-[var(--surface)] text-[var(--text-primary)]">{t('modManager.sort.name')}</option>
                            <option value={6} className="bg-[var(--surface)] text-[var(--text-primary)]">{t('modManager.sort.totalDownloads')}</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[var(--text-muted)]">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>

                    {/* Sort Order */}
                    <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-sky-500/40 backdrop-blur-xl transition-all shadow-sm hover:scale-[1.03] active:scale-[0.97]"
                        title={sortOrder === 'asc' ? t('common.ascending') : t('common.descending')}
                    >
                        {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 text-sky-400" /> : <ArrowDown className="w-4 h-4 text-sky-400" />}
                    </button>

                    {/* Clear Filters */}
                    {(selectedCategory || sortField !== 2 || sortOrder !== 'desc') && (
                        <button
                            onClick={() => {
                                setSelectedCategory(undefined);
                                setSortField(2);
                                setSortOrder('desc');
                                setSearchQuery('');
                            }}
                            className="ml-auto text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5 font-medium px-3 py-2 bg-sky-500/10 rounded-lg hover:bg-sky-500/20 border border-sky-500/20 transition-all"
                        >
                            <X className="w-3 h-3" /> {t('modManager.clearFilters')}
                        </button>
                    )}
                </div>
            )}

            {/* Advanced Mode - Bulk Mod ID Import */}
            <div className="glass-panel rounded-xl border border-[var(--border)] overflow-hidden">
                <button
                    onClick={() => setShowAdvancedMode(!showAdvancedMode)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-[var(--surface-hover)] transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-lg">
                            <Code className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <span className="text-[var(--text-primary)] font-medium">{t('modManager.advancedMode')}</span>
                            <p className="text-[var(--text-muted)] text-sm">{t('modManager.advancedModeSubtitle')}</p>
                        </div>
                    </div>
                    {showAdvancedMode ? (
                        <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
                    )}
                </button>

                {showAdvancedMode && (
                    <div className="p-6 border-t border-[var(--border)] bg-[var(--surface-hover)]">
                        <AdvancedModInput
                            onImport={handleBulkImportMods}
                            isLoading={isBulkImporting}
                        />
                    </div>
                )}
            </div>


            {/* Search and Tabs */}
            <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
                <div className="relative w-full md:w-96">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                        placeholder={activeTab === 'available' ? t('modManager.searchMods') : t('modManager.searchMods')}
                        className="w-full pl-12 pr-10 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 transition-all backdrop-blur-xl shadow-sm"
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] pointer-events-none z-10" />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors z-10"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex gap-4 items-center">
                    {activeTab === 'available' && (
                        <button 
                            onClick={handleSelectAll} 
                            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)] backdrop-blur-xl transition-all shadow-sm active:scale-95"
                        >
                            <ListChecks className="w-4 h-4 text-sky-400" /> 
                            <span>{selectedModIds.size === availableMods.length ? t('common.deselectAll') : t('common.selectAll')}</span>
                        </button>
                    )}

                    {/* Modern Glassmorphic Tabs */}
                    <div className="flex p-1.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] backdrop-blur-md w-max shadow-inner gap-1 flex-wrap">
                        <button 
                            onClick={() => setActiveTab('available')} 
                            className={cn(
                                "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                                activeTab === 'available' 
                                    ? "text-sky-400 bg-[var(--surface-active)] shadow-sm border border-[var(--border)]" 
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                            )}
                        >
                            <span className="relative z-10">{t('modManager.availableMods', 'Available')}</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('installed')} 
                            className={cn(
                                "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                                activeTab === 'installed' 
                                    ? "text-emerald-400 bg-[var(--surface-active)] shadow-sm border border-[var(--border)]" 
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                            )}
                        >
                            <span className="relative z-10">{t('modManager.installedMods', 'Installed')}</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('watchdog')} 
                            className={cn(
                                "flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden",
                                activeTab === 'watchdog' 
                                    ? "text-violet-400 bg-[var(--surface-active)] shadow-sm border border-[var(--border)]" 
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                            )}
                        >
                            <ShieldCheck className="w-4 h-4" />
                            <span className="relative z-10">{t('modManager.watchdog', 'Watchdog')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {
                activeTab === 'watchdog' ? (
                    <ModWatchdogDashboard serverId={selectedServerId} />
                ) : activeTab === 'available' ? (
                    /* Available Mods Grid */
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isLoading ? (
                            <div className="col-span-full flex justify-center py-20"><Loader2 className="w-10 h-10 text-sky-500 animate-spin" /></div>
                        ) : availableMods.length === 0 ? (
                            <div className="col-span-full text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-slate-300">{t('modManager.noModsFound')}</h3>
                            </div>
                        ) : availableMods.length === 1 && availableMods[0].id === '0' ? (
                            <div className="col-span-full p-8 glass-panel rounded-2xl border border-amber-500/30 bg-slate-900/90 shadow-2xl">
                                <div className="max-w-2xl mx-auto space-y-5 text-center">
                                    <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 w-fit mx-auto">
                                        <Key className="w-10 h-10 text-amber-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white">{t('modManager.curseforgeKeyTitle', 'CurseForge API Key Config')}</h3>
                                    <p className="text-slate-300 text-sm leading-relaxed">
                                        {availableMods[0].description}
                                    </p>

                                    <div className="p-4 bg-slate-800/80 border border-amber-500/20 rounded-xl text-left text-xs space-y-2 text-slate-300">
                                        <div className="flex items-center gap-2 text-amber-400 font-semibold">
                                            <Info className="w-4 h-4" />
                                            <span>{t('modManager.howToGetApiKey', 'How to get your free CurseForge API Key:')}</span>
                                        </div>
                                        <ol className="list-decimal list-inside space-y-1 text-slate-400 ml-1">
                                            <li>{t('modManager.step1Key', 'Go to console.curseforge.com and sign in with your account.')}</li>
                                            <li>{t('modManager.step2Key', 'Create an Organization and generate a free API Key under API Keys section.')}</li>
                                            <li>{t('modManager.step3Key', 'Click "Configure CurseForge API Key" below to save it in Manager Settings.')}</li>
                                        </ol>
                                    </div>

                                    <div className="pt-2 flex flex-wrap justify-center gap-3">
                                        <button
                                            onClick={() => setShowKeyModal(true)}
                                            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 inline-flex items-center gap-2 text-sm"
                                        >
                                            <Key className="w-4 h-4" />
                                            <span>{t('modManager.configureApiKey', 'Configure CurseForge API Key')}</span>
                                        </button>
                                        <a
                                            href="https://console.curseforge.com/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold transition-all inline-flex items-center gap-2 text-sm"
                                        >
                                            <ExternalLink className="w-4 h-4 text-amber-400" />
                                            <span>{t('modManager.getFreeApiKey', 'Get API Key (console.curseforge.com)')}</span>
                                        </a>
                                        <button
                                            onClick={() => setShowAdvancedMode(true)}
                                            disabled={!selectedServerId}
                                            className="px-5 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20 inline-flex items-center gap-2 text-sm disabled:opacity-50"
                                        >
                                            <PackagePlus className="w-4 h-4" />
                                            <span>{t('modManager.addModById', 'Add Mod by ID (No Key Required)')}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : filteredAvailableMods.length === 0 ? (
                            <div className="col-span-full text-center py-16 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                                <Package className="w-14 h-14 text-slate-600 mx-auto mb-3" />
                                <h3 className="text-lg font-semibold text-slate-300">No mods in active category filter</h3>
                                <p className="text-xs text-slate-500 mt-1">Assign mods to this category or select "All Mods" to view all results.</p>
                            </div>
                        ) : (
                            filteredAvailableMods.map((mod) => (
                                <ModCard
                                    key={mod.id}
                                    mod={mod}
                                    isSelected={selectedModIds.has(mod.id)}
                                    onToggleSelect={handleToggleSelect}
                                    onSelectDetail={setSelectedModDetail}
                                    onInstall={handleInstallMod}
                                />
                            ))
                        )}
                    </div>

                    {/* Load More Button Section */}
                    {availableMods.length > 0 && availableMods[0].id !== '0' && !isLoading && (
                        <div className="flex flex-col items-center justify-center pt-8 pb-10 space-y-3">
                            {hasMore ? (
                                <button
                                    onClick={handleLoadMore}
                                    disabled={isLoadingMore}
                                    className="flex items-center space-x-3 px-8 py-4 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-base transition-all shadow-xl shadow-sky-500/25 hover:shadow-sky-500/40 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed border border-sky-400/30 ring-1 ring-white/10"
                                >
                                    {isLoadingMore ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                                            <span>{t('modManager.loadingMore', 'Loading More Mods...')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-5 h-5 animate-bounce text-sky-200" />
                                            <span>{t('modManager.loadMore', 'Load More Mods')}</span>
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div className="px-6 py-2.5 rounded-full bg-slate-900/60 border border-slate-800 text-slate-400 text-xs font-semibold flex items-center gap-2">
                                    <Check className="w-4 h-4 text-emerald-400" />
                                    <span>{t('modManager.allModsLoaded', 'All available mods loaded')} ({availableMods.length})</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                ) : (
                    /* Installed Mods List */
                    <div className="space-y-6">
                        {/* Server Sync Header Banner */}
                        <div className="p-5 rounded-3xl bg-slate-900/80 border border-sky-500/30 backdrop-blur-xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-sky-500/20 text-sky-400 rounded-2xl border border-sky-500/30 shrink-0">
                                    <Sparkles className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-extrabold text-white text-base sm:text-lg">Installed Server Mods Configuration</h3>
                                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                                            {installedMods.filter(m => m.enabled).length} Active / {installedMods.length} Total
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300 mt-1">
                                        Drag & drop or use arrow keys to reorder load sequence. Click any mod to view description, files & notes.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleSyncModsToServer}
                                disabled={isSyncing || !selectedServerId || installedMods.length === 0}
                                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 shrink-0 self-end md:self-center"
                            >
                                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                <span>Sync & Apply to Server</span>
                            </button>
                        </div>

                        {/* Filter Status Pills & Bulk Controls */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            {/* Filter Status Tabs */}
                            <div className="flex items-center p-1 rounded-2xl bg-slate-900/60 border border-white/10 gap-1 text-xs font-bold">
                                <button
                                    onClick={() => setInstalledFilter('all')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-xl transition-all",
                                        installedFilter === 'all'
                                            ? "bg-sky-500 text-white shadow-md font-extrabold"
                                            : "text-slate-400 hover:text-white"
                                    )}
                                >
                                    All ({installedMods.length})
                                </button>
                                <button
                                    onClick={() => setInstalledFilter('enabled')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-xl transition-all",
                                        installedFilter === 'enabled'
                                            ? "bg-emerald-600 text-white shadow-md font-extrabold"
                                            : "text-slate-400 hover:text-white"
                                    )}
                                >
                                    Enabled ({installedMods.filter(m => m.enabled).length})
                                </button>
                                <button
                                    onClick={() => setInstalledFilter('disabled')}
                                    className={cn(
                                        "px-4 py-1.5 rounded-xl transition-all",
                                        installedFilter === 'disabled'
                                            ? "bg-rose-600 text-white shadow-md font-extrabold"
                                            : "text-slate-400 hover:text-white"
                                    )}
                                >
                                    Disabled ({installedMods.filter(m => !m.enabled).length})
                                </button>
                            </div>

                            {/* Bulk Enable / Disable Action Buttons */}
                            <div className="flex items-center gap-2 self-end sm:self-center">
                                <button
                                    onClick={() => handleToggleAll(true)}
                                    disabled={isBulkUpdating || installedMods.every(m => m.enabled)}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                                >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>Enable All</span>
                                </button>
                                <button
                                    onClick={() => handleToggleAll(false)}
                                    disabled={isBulkUpdating || installedMods.every(m => !m.enabled)}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                                >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>Disable All</span>
                                </button>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-sky-500 animate-spin" /></div>
                        ) : installedMods.length === 0 ? (
                            <div className="text-center py-20 glass-panel rounded-2xl border-dashed border-2 border-slate-700/50">
                                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold text-slate-300">{t('modManager.noModsInstalled')}</h3>
                                <button onClick={() => setActiveTab('available')} className="mt-4 px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors">{t('modManager.browse')}</button>
                            </div>
                        ) : (
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId="installed-mods-list" isDropDisabled={searchQuery.length > 0 || installedFilter !== 'all'}>
                                    {(provided) => (
                                        <div
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="space-y-3"
                                        >
                                            {installedMods
                                                .filter(mod => {
                                                    const matchesSearch = !searchQuery || mod.name.toLowerCase().includes(searchQuery.toLowerCase()) || mod.id.includes(searchQuery);
                                                    if (!matchesSearch) return false;
                                                    if (installedFilter === 'enabled') return mod.enabled;
                                                    if (installedFilter === 'disabled') return !mod.enabled;
                                                    if (activeCategoryId !== 'all' && !isModInCategory(mod.id, activeCategoryId)) return false;
                                                    return true;
                                                })
                                                .map((mod, index) => {
                                                    const originalIndex = installedMods.findIndex(m => m.id === mod.id);
                                                    return (
                                                        <Draggable key={mod.id} draggableId={mod.id} index={index} isDragDisabled={searchQuery.length > 0 || installedFilter !== 'all'}>
                                                            {(provided, snapshot) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    style={{ ...provided.draggableProps.style, zIndex: snapshot.isDragging ? 50 : 'auto' }}
                                                                    onClick={() => setSelectedModDetail(mod)}
                                                                    className={cn(
                                                                        "group relative p-4 rounded-2xl bg-slate-900/80 border backdrop-blur-xl transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:border-sky-400/50 shadow-lg hover:shadow-xl",
                                                                        !mod.enabled ? "opacity-65 border-white/5" : "border-white/10",
                                                                        snapshot.isDragging ? "border-sky-500 bg-slate-900 shadow-2xl scale-[1.01]" : ""
                                                                    )}
                                                                >
                                                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                                                        {/* Drag Handle */}
                                                                        <div
                                                                            {...provided.dragHandleProps}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={cn(
                                                                                "p-2 rounded-xl transition-all shrink-0",
                                                                                searchQuery.length > 0 || installedFilter !== 'all'
                                                                                    ? "text-slate-700 cursor-not-allowed opacity-30"
                                                                                    : "cursor-grab active:cursor-grabbing text-slate-500 hover:text-sky-400 hover:bg-slate-800"
                                                                            )}
                                                                            title="Drag to reorder load position"
                                                                        >
                                                                            <GripVertical className="w-5 h-5" />
                                                                        </div>

                                                                        {/* Load Order Index & Up/Down Arrows */}
                                                                        <div className="flex flex-col items-center justify-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                            <button
                                                                                onClick={() => handleMoveMod(originalIndex, 'up')}
                                                                                disabled={originalIndex === 0 || searchQuery.length > 0 || installedFilter !== 'all'}
                                                                                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-sky-300 disabled:opacity-20 transition-colors"
                                                                                title="Move Up"
                                                                            >
                                                                                <ChevronUp className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <span className="text-[10px] font-bold font-mono text-slate-500">#{originalIndex + 1}</span>
                                                                            <button
                                                                                onClick={() => handleMoveMod(originalIndex, 'down')}
                                                                                disabled={originalIndex === installedMods.length - 1 || searchQuery.length > 0 || installedFilter !== 'all'}
                                                                                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-sky-300 disabled:opacity-20 transition-colors"
                                                                                title="Move Down"
                                                                            >
                                                                                <ChevronDown className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>

                                                                        {/* Mod Thumbnail */}
                                                                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-white/10">
                                                                            <InstalledModImage url={mod.thumbnailUrl} name={mod.name} />
                                                                        </div>

                                                                        {/* Mod Metadata & Title */}
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <h4 className="font-bold text-white text-base group-hover:text-sky-300 transition-colors truncate">
                                                                                    {mod.name}
                                                                                </h4>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        navigator.clipboard.writeText(mod.id);
                                                                                        toast.success(`Copied Mod ID: ${mod.id}`);
                                                                                    }}
                                                                                    className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-[11px] font-mono border border-white/10 hover:border-sky-500/40 transition-all"
                                                                                    title="Click to copy ID"
                                                                                >
                                                                                    #{mod.id}
                                                                                </button>

                                                                                {mod.enabled ? (
                                                                                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-md flex items-center gap-1">
                                                                                        <CheckCircle className="w-3 h-3" /> Active #{originalIndex + 1}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] font-bold rounded-md">
                                                                                        Disabled
                                                                                    </span>
                                                                                )}

                                                                                <div onClick={(e) => e.stopPropagation()}>
                                                                                    <ModCategorySelector modId={mod.id} modName={mod.name} modDescription={mod.description} />
                                                                                </div>
                                                                            </div>

                                                                            <p className="text-xs text-slate-300/80 mt-1 line-clamp-1 leading-relaxed">
                                                                                {stripHtmlTags(mod.description) || 'Installed server modification package.'}
                                                                            </p>

                                                                            {mod.isLocal && (
                                                                                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg w-fit">
                                                                                    <AlertTriangle className="w-3 h-3" />
                                                                                    <span>Using cached local package</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Right Control Action Buttons */}
                                                                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                                                                        <button
                                                                            onClick={() => setSelectedModDetail(mod)}
                                                                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5"
                                                                            title="Inspect Mod Details"
                                                                        >
                                                                            <ScanSearch className="w-3.5 h-3.5 text-sky-400" />
                                                                            <span>Inspect</span>
                                                                        </button>

                                                                        <button
                                                                            onClick={() => handleToggleMod(mod)}
                                                                            className={cn(
                                                                                "p-2 rounded-xl border transition-all shadow-sm",
                                                                                mod.enabled
                                                                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
                                                                                    : "bg-slate-800 text-slate-400 border-white/10 hover:text-white"
                                                                            )}
                                                                            title={mod.enabled ? "Disable Mod" : "Enable Mod"}
                                                                        >
                                                                            <Power className="w-4 h-4" />
                                                                        </button>

                                                                        <button
                                                                            onClick={() => handleUninstallMod(mod)}
                                                                            className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all shadow-sm hover:text-rose-300"
                                                                            title="Uninstall Mod"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    );
                                                })}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        )}
                    </div>
                )
            }

            {/* Advanced Mod ID Import Modal (No API Key Required) */}
            {showAdvancedMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl shadow-sky-900/20">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <PackagePlus className="w-5 h-5 text-sky-400" />
                                {t('modManager.addModByIdTitle', 'Install Mods by Mod ID (No API Key Required)')}
                            </h2>
                            <button
                                onClick={() => setShowAdvancedMode(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <AdvancedModInput
                                onImport={(modIds) => {
                                    setShowAdvancedMode(false);
                                    handleBulkImportMods(modIds);
                                }}
                                isLoading={isBulkImporting}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* CurseForge API Key Pop-Up Settings Modal */}
            <CurseForgeKeyModal
                isOpen={showKeyModal}
                onClose={() => setShowKeyModal(false)}
                onSaved={() => setRefreshKey(k => k + 1)}
            />

            {/* Gallery Fullscreen Image Lightbox Modal */}
            <GalleryLightboxModal
                images={galleryImages}
                activeImage={activeLightboxImage}
                onClose={() => setActiveLightboxImage(null)}
                onSelectImage={setActiveLightboxImage}
            />
        </div>
    );
}
