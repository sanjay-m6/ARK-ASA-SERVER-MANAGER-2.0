import { useTranslation } from 'react-i18next';
import { Heart, Coffee, Star, CreditCard } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { invoke } from '@tauri-apps/api/core';

const SUPPORT_LINKS = [
    { name: 'Ko-fi', url: 'https://ko-fi.com/infinity86', icon: Coffee, colorClass: 'bg-[#ff5e5b] hover:bg-[#ff4c49] text-white' },
    { name: 'PayPal', url: 'https://paypal.me/infinity86s', icon: CreditCard, colorClass: 'bg-[#0070ba] hover:bg-[#005ea6] text-white' },
    { name: 'GitHub', url: 'https://github.com/sponsors/sanjay-m6', icon: Star, colorClass: 'bg-[#333333] hover:bg-[#444444] text-white' },
];

export default function SponsorBanner() {
    const { t } = useTranslation();

    const openUrl = async (url: string) => {
        try {
            await invoke('plugin:opener|open_url', { url });
        } catch (error) {
            window.open(url, '_blank');
        }
    };

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#1e2433] rounded-xl border border-white/5">
            {/* Left: Support message */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-full bg-[#2a3040]">
                    <Heart className="w-5 h-5 text-rose-400" fill="currentColor" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">
                        {t('sponsorBanner.title', 'Support the Development')}
                    </span>
                    <span className="text-[13px] text-slate-400 mt-0.5">
                        {t('sponsorBanner.subtitle', 'Keep our ASA Server Manager 2.0 running with a small contribution.')}
                    </span>
                </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {SUPPORT_LINKS.map(link => {
                    const Icon = link.icon;
                    return (
                        <button
                            key={link.name}
                            onClick={() => openUrl(link.url)}
                            className={cn(
                                "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex-shrink-0",
                                link.colorClass
                            )}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span>{link.name}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
