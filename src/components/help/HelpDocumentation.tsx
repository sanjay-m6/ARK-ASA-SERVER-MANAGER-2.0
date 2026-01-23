import { HelpCircle, BookOpen, Video, MessageCircle } from 'lucide-react';

const HELP_SECTIONS = [
    {
        icon: BookOpen,
        title: 'Documentation',
        description: 'Complete guide to ARK Server Manager',
        items: [
            'Installing your first server',
            'Managing mods and configurations',
            'Setting up server clusters',
            'Backup and recovery procedures',
        ],
    },
    {
        icon: Video,
        title: 'Video Tutorials',
        description: 'Step-by-step video guides',
        items: [
            'Quick Start Guide (5 min)',
            'Advanced Configuration (15 min)',
            'Troubleshooting Common Issues (10 min)',
        ],
    },
    {
        icon: MessageCircle,
        title: 'Community Support',
        description: 'Get help from the community',
        items: [
            'Discord Server',
            'Reddit Community',
            'GitHub Discussions',
            'Bug Reports',
        ],
    },
];

export default function HelpDocumentation() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Help & Documentation</h1>
                <p className="text-dark-400 mt-1">Learn how to use ARK Server Manager</p>
            </div>

            {/* Quick Start Banner */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-8 text-white">
                <div className="flex items-center space-x-4">
                    <HelpCircle className="w-12 h-12" />
                    <div>
                        <h2 className="text-2xl font-bold">New to ARK Server Manager?</h2>
                        <p className="text-primary-100 mt-1">Start with our quick start guide to get your first server running in minutes!</p>
                        <button className="mt-4 px-6 py-2 bg-white text-primary-700 font-semibold rounded-lg hover:bg-primary-50 transition-colors">
                            Start Quick Tour →
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
                <h3 className="text-lg font-semibold text-white mb-4">Frequently Asked Questions</h3>
                <div className="space-y-4">
                    {[
                        { q: 'How do I install my first ARK server?', a: 'Click "Install Server" in the Server Manager and follow the wizard to set up your ASA server.' },
                        { q: 'Can I run multiple servers at once?', a: 'Yes! You can run as many servers as your hardware can handle.' },
                        { q: 'How do I install mods?', a: 'Go to Mod Manager, search for mods, and click Install. They\'ll be automatically configured.' },
                        { q: 'What if my server crashes?', a: 'Enable auto-restart in Settings. The manager will automatically restart crashed servers.' },
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
