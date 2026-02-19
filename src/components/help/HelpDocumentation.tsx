import { HelpCircle, BookOpen, Video, MessageCircle } from 'lucide-react';

import { useTranslation } from 'react-i18next';

export default function HelpDocumentation() {
    const { t } = useTranslation();

    const HELP_SECTIONS = [
        {
            icon: BookOpen,
            title: t('help.sections.docs.title'),
            description: t('help.sections.docs.description'),
            items: [
                t('help.sections.docs.items.install'),
                t('help.sections.docs.items.mods'),
                t('help.sections.docs.items.clusters'),
                t('help.sections.docs.items.backup'),
            ],
        },
        {
            icon: Video,
            title: t('help.sections.video.title'),
            description: t('help.sections.video.description'),
            items: [
                t('help.sections.video.items.quickStart'),
                t('help.sections.video.items.advanced'),
                t('help.sections.video.items.troubleshooting'),
            ],
        },
        {
            icon: MessageCircle,
            title: t('help.sections.community.title'),
            description: t('help.sections.community.description'),
            items: [
                t('help.sections.community.items.discord'),
                t('help.sections.community.items.reddit'),
                t('help.sections.community.items.github'),
                t('help.sections.community.items.bugs'),
            ],
        },
    ];


    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">{t('help.title')}</h1>
                <p className="text-dark-400 mt-1">{t('help.subtitle')}</p>
            </div>

            {/* Quick Start Banner */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-8 text-white">
                <div className="flex items-center space-x-4">
                    <HelpCircle className="w-12 h-12" />
                    <div>
                        <h2 className="text-2xl font-bold">{t('help.quickStart.title')}</h2>
                        <p className="text-primary-100 mt-1">{t('help.quickStart.description')}</p>
                        <button className="mt-4 px-6 py-2 bg-white text-primary-700 font-semibold rounded-lg hover:bg-primary-50 transition-colors">
                            {t('help.quickStart.button')} →
                        </button>
                    </div>
                </div>
            </div>

            {/* Help Sections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {HELP_SECTIONS.map((section, index) => (
                    <div key={index} className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                        <div className="w-12 h-12 bg-primary-600/20 rounded-lg flex items-center justify-center mb-4">
                            <section.icon className="w-6 h-6 text-primary-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">{section.title}</h3>
                        <p className="text-sm text-dark-400 mb-4">{section.description}</p>
                        <ul className="space-y-2">
                            {section.items.map((item, idx) => (
                                <li key={idx} className="text-sm text-dark-300 hover:text-white cursor-pointer transition-colors">
                                    • {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {/* FAQ */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">{t('help.faq.title')}</h3>
                <div className="space-y-4">
                    {[
                        { q: t('help.faq.install.q'), a: t('help.faq.install.a') },
                        { q: t('help.faq.multiple.q'), a: t('help.faq.multiple.a') },
                        { q: t('help.faq.mods.q'), a: t('help.faq.mods.a') },
                        { q: t('help.faq.crash.q'), a: t('help.faq.crash.a') },
                    ].map((faq, index) => (
                        <div key={index} className="border-b border-dark-800 last:border-0 pb-4 last:pb-0">
                            <h4 className="font-semibold text-white mb-2">{faq.q}</h4>
                            <p className="text-sm text-dark-400">{faq.a}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
