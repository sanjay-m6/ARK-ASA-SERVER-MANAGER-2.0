import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, Search, Sparkles } from 'lucide-react';
import { supportedLanguages } from '../../i18n';
import { cn } from '../../utils/helpers';
import { setSetting } from '../../utils/tauri';
import toast from 'react-hot-toast';

export default function LanguageSettings() {
    const { t, i18n } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');

    const currentLangCode = i18n.language || 'en';

    const handleSelectLanguage = async (code: string, nativeName: string) => {
        try {
            await i18n.changeLanguage(code);
            localStorage.setItem('ark_sm_language', code);
            setSetting('app_language', code).catch(() => {});
            
            toast.success(
                t('settings.language.languageChanged', {
                    defaultValue: 'Language changed to {{language}}',
                    language: nativeName,
                }),
                { id: 'lang-toast' }
            );
        } catch (err) {
            console.error('Failed to change language:', err);
            toast.error('Failed to change application language');
        }
    };

    const filteredLanguages = supportedLanguages.filter((lang) => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return (
            lang.name.toLowerCase().includes(query) ||
            lang.nativeName.toLowerCase().includes(query) ||
            lang.code.toLowerCase().includes(query)
        );
    });

    const activeLanguageObj = supportedLanguages.find(
        (l) => l.code === currentLangCode || currentLangCode.startsWith(l.code)
    ) || supportedLanguages[0];

    return (
        <div className="space-y-8 animate-in slide-in-from-left-4 duration-300">
            {/* Header Banner */}
            <div className="glass-panel rounded-3xl p-7 shadow-xl relative overflow-hidden bg-[var(--surface)] border border-[var(--border)]">
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-sky-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 relative z-10">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-gradient-to-br from-sky-500/20 to-indigo-600/10 border border-sky-500/30 rounded-2xl shadow-inner text-sky-400">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-[var(--text-primary)]">
                                    {t('settings.language.title', 'Application Language')}
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                    {supportedLanguages.length} Languages
                                </span>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                                {t('settings.language.description', 'Choose your preferred language for the entire ARK Server Manager interface. Changes update instantly across all screens.')}
                            </p>
                        </div>
                    </div>

                    {/* Current Active Language Pill */}
                    <div className="flex items-center gap-3 bg-[var(--bg-primary)] px-4 py-2.5 rounded-2xl border border-[var(--border)] shrink-0 shadow-sm">
                        <span className="text-2xl">{activeLanguageObj.flag}</span>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                                {t('common.active', 'Active Language')}
                            </p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">
                                {activeLanguageObj.nativeName} ({activeLanguageObj.name})
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search and Language Grid Card */}
            <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-6">
                {/* Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('common.search', 'Search languages by name or code...')}
                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-sky-500/50 transition-all"
                        />
                    </div>
                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>Instant real-time translation</span>
                    </div>
                </div>

                {/* Languages Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {filteredLanguages.map((lang) => {
                        const isSelected = currentLangCode === lang.code || currentLangCode.startsWith(lang.code + '-');

                        return (
                            <button
                                key={lang.code}
                                type="button"
                                onClick={() => handleSelectLanguage(lang.code, lang.nativeName)}
                                className={cn(
                                    "p-4 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between gap-3 group cursor-pointer",
                                    isSelected
                                        ? "bg-sky-500/15 border-sky-500 ring-2 ring-sky-500/30 shadow-lg shadow-sky-500/10"
                                        : "bg-[var(--bg-primary)] border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-hover)]"
                                )}
                            >
                                <div className="flex items-center gap-3.5 overflow-hidden">
                                    <span className="text-3xl shrink-0 group-hover:scale-110 transition-transform duration-200">
                                        {lang.flag}
                                    </span>
                                    <div className="overflow-hidden">
                                        <p className={cn(
                                            "text-sm font-bold truncate transition-colors",
                                            isSelected ? "text-sky-400" : "text-[var(--text-primary)] group-hover:text-sky-300"
                                        )}>
                                            {lang.nativeName}
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary)] truncate">
                                            {lang.name}
                                        </p>
                                    </div>
                                </div>

                                <div className="shrink-0">
                                    {isSelected ? (
                                        <div className="w-7 h-7 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md shadow-sky-500/30">
                                            <Check className="w-4 h-4" />
                                        </div>
                                    ) : (
                                        <div className="w-7 h-7 rounded-full border border-[var(--border)] group-hover:border-sky-500/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                            <span className="text-[10px] font-bold text-sky-400 uppercase">Use</span>
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {filteredLanguages.length === 0 && (
                    <div className="p-8 text-center text-[var(--text-muted)] space-y-2">
                        <Globe className="w-8 h-8 opacity-40 mx-auto" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {t('common.noResults', 'No languages match your search.')}
                        </p>
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="text-xs text-sky-400 hover:underline"
                        >
                            Clear search filter
                        </button>
                    </div>
                )}

                {/* Footer Note */}
                <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border)] flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                    <span className="text-base">💡</span>
                    <p className="leading-relaxed">
                        {t('settings.language.restartNote', 'Language changes apply immediately. All navigation buttons, tooltips, configuration fields, and logs adapt in real-time.')}
                    </p>
                </div>
            </div>
        </div>
    );
}
