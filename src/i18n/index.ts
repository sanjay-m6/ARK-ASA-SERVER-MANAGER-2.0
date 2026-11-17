import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import it from './locales/it.json';
import ptBR from './locales/pt-BR.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ta from './locales/ta.json';
import km from './locales/km.json';

export const supportedLanguages = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文', flag: '🇨🇳' },
    { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文', flag: '🇹🇼' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
    { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', flag: '🇰🇭' },
] as const;

export type LanguageCode = typeof supportedLanguages[number]['code'];

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            de: { translation: de },
            fr: { translation: fr },
            es: { translation: es },
            it: { translation: it },
            'pt-BR': { translation: ptBR },
            ru: { translation: ru },
            tr: { translation: tr },
            ja: { translation: ja },
            ko: { translation: ko },
            'zh-CN': { translation: zhCN },
            'zh-TW': { translation: zhTW },
            ta: { translation: ta },
            km: { translation: km },
        },
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // React already escapes
        },
        detection: {
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: 'ark_sm_language',
            caches: ['localStorage'],
        },
        saveMissing: false,
    });

const applyDocumentLanguage = (lng?: string) => {
    if (typeof document === 'undefined') return;
    const code = (lng || i18n.language || 'en').split('-')[0];
    document.documentElement.lang = lng || 'en';
    document.documentElement.setAttribute('data-lang', lng || 'en');
    document.documentElement.classList.toggle('lang-km', code === 'km');
};

i18n.on('languageChanged', applyDocumentLanguage);
applyDocumentLanguage(i18n.language);

export default i18n;
