import { useState, useEffect } from 'react';
import { Heart, Coffee, Star, Sparkles, CreditCard } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { invoke } from '@tauri-apps/api/core';

interface Sponsor {
    name: string;
    tier: 'bronze' | 'silver' | 'gold';
    message?: string;
}

const SUPPORT_LINKS = [
    { name: 'Ko-fi', url: 'https://ko-fi.com/infinity86', icon: Coffee, color: 'from-pink-500 to-red-500' },
    { name: 'PayPal', url: 'https://paypal.me/infinity86s', icon: CreditCard, color: 'from-blue-500 to-cyan-500' },
    { name: 'GitHub Sponsors', url: 'https://github.com/sponsors/sanjay-m6', icon: Heart, color: 'from-purple-500 to-pink-500' },
];

const SAMPLE_SPONSORS: Sponsor[] = [
    { name: 'CommunityArk', tier: 'gold', message: 'Supporting the ARK community!' },
    { name: 'DinoMaster', tier: 'silver' },
    { name: 'ServerPro', tier: 'bronze' },
];

export default function SponsorBanner() {
    const [currentSponsorIndex, setCurrentSponsorIndex] = useState(0);
    const [sponsors] = useState<Sponsor[]>(SAMPLE_SPONSORS);

    useEffect(() => {
        // Rotate sponsors every 10 seconds
        if (sponsors.length > 1) {
            const interval = setInterval(() => {
                setCurrentSponsorIndex(prev => (prev + 1) % sponsors.length);
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [sponsors.length]);

    const openUrl = async (url: string) => {
        try {
            await invoke('plugin:opener|open_url', { url });
        } catch (error) {
            window.open(url, '_blank');
        }
    };

    const getTierColor = (tier: Sponsor['tier']) => {
        switch (tier) {
            case 'gold': return 'text-amber-400';
            case 'silver': return 'text-slate-300';
            case 'bronze': return 'text-orange-400';
        }
    };

    const getTierIcon = (tier: Sponsor['tier']) => {
        switch (tier) {
            case 'gold': return <Sparkles className="w-4 h-4 text-amber-400" />;
            case 'silver': return <Star className="w-4 h-4 text-slate-300" />;
            case 'bronze': return <Star className="w-4 h-4 text-orange-400" />;
        }
    };

    const currentSponsor = sponsors[currentSponsorIndex];

    return (
        <div className="glass-panel rounded-xl p-4 border border-pink-500/20 bg-gradient-to-r from-pink-500/5 via-purple-500/5 to-cyan-500/5">
            <div className="flex items-center justify-between gap-4">
                {/* Left: Support message */}
                <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-pink-500/10">
                        <Heart className="w-5 h-5 text-pink-400" fill="currentColor" />
                    </div>
                    <div className="flex-1">
                        <div className="text-sm font-medium text-white">
                            Support ASA Server Manager
                        </div>
                        <div className="text-xs text-slate-400">
                            Help keep this project alive and thriving
                        </div>
                    </div>
                </div>

                {/* Center: Sponsor spotlight (if any) */}
                {currentSponsor && (
                    <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        {getTierIcon(currentSponsor.tier)}
                        <span className={cn("text-sm font-medium", getTierColor(currentSponsor.tier))}>
                            {currentSponsor.name}
                        </span>
                        {currentSponsor.message && (
                            <span className="text-xs text-slate-500 hidden lg:inline">
                                — {currentSponsor.message}
                            </span>
                        )}
                    </div>
                )}

                {/* Right: Action buttons */}
                <div className="flex items-center gap-2">
                    {SUPPORT_LINKS.map(link => {
                        const Icon = link.icon;
                        return (
                            <button
                                key={link.name}
                                onClick={() => openUrl(link.url)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-all hover:scale-105",
                                    `bg-gradient-to-r ${link.color}`
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{link.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Sponsor dots indicator */}
            {sponsors.length > 1 && (
                <div className="flex justify-center gap-1 mt-2">
                    {sponsors.map((_, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "w-1.5 h-1.5 rounded-full transition-colors",
                                idx === currentSponsorIndex ? "bg-pink-400" : "bg-slate-700"
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
