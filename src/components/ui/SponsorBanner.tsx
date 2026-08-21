import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { invoke } from '@tauri-apps/api/core';
import kofiIcon from '../../assets/sponsor/9148201.webp';
import paypalIcon from '../../assets/sponsor/paypal.webp';

const SUPPORT_LINKS = [
    { 
        name: 'Ko-fi', 
        url: 'https://ko-fi.com/infinity86', 
        logo: (
            <img src={kofiIcon} alt="Ko-fi" className="w-[18px] h-[18px] object-contain flex-shrink-0 mr-0.5" />
        ), 
        colorClass: 'bg-[#ff5e5b] hover:bg-[#ff4c49] text-white shadow-lg shadow-rose-500/10 hover:shadow-rose-500/20' 
    },
    { 
        name: 'PayPal', 
        url: 'https://paypal.me/infinity86s?locale.x=en_GB&country.x=IN', 
        logo: (
            <img src={paypalIcon} alt="PayPal" className="w-[18px] h-[18px] object-contain flex-shrink-0 mr-0.5" />
        ), 
        colorClass: 'bg-[#0070ba] hover:bg-[#005ea6] text-white shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20' 
    },
    { 
        name: 'GitHub', 
        url: 'https://github.com/sponsors/sanjay-m6', 
        logo: (
            <svg className="w-4 h-4 fill-current flex-shrink-0" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
        ), 
        colorClass: 'bg-[#24292f] hover:bg-[#1a1f24] text-white shadow-lg shadow-black/15 hover:shadow-black/25' 
    },
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 glass-panel rounded-xl border border-[var(--border)] shadow-md">
            {/* Left: Support message */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-full bg-[var(--surface-hover)] border border-[var(--border)]">
                    <Heart className="w-5 h-5 text-rose-500" fill="currentColor" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {t('sponsorBanner.title', 'Support the Development')}
                    </span>
                    <span className="text-[13px] text-[var(--text-muted)] mt-0.5">
                        {t('sponsorBanner.subtitle', 'Keep our ASA & ASE Server Manager 2.0 running with a small contribution.')}
                    </span>
                </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-3.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {SUPPORT_LINKS.map(link => {
                    return (
                        <button
                            key={link.name}
                            onClick={() => openUrl(link.url)}
                            className={cn(
                                "flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex-shrink-0",
                                link.colorClass
                            )}
                        >
                            {link.logo}
                            <span>{link.name}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
