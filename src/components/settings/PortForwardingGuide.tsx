import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, CheckCircle, Copy, Router, Globe, Shield, Settings } from 'lucide-react';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface Step {
    id: number;
    title: string;
    content: React.ReactNode;
    completed: boolean;
}

const ROUTER_BRANDS = [
    { name: 'Netgear', url: 'https://www.netgear.com/support/product/port-forwarding' },
    { name: 'TP-Link', url: 'https://www.tp-link.com/us/support/faq/134/' },
    { name: 'ASUS', url: 'https://www.asus.com/support/FAQ/1037906/' },
    { name: 'Linksys', url: 'https://www.linksys.com/support-article?articleNum=140707' },
    { name: 'D-Link', url: 'https://support.dlink.com/faq/view.asp?prod_id=1354' },
    { name: 'Xfinity', url: 'https://www.xfinity.com/support/articles/port-forwarding-xfinity-xfi' },
];

export default function PortForwardingGuide() {
    const { t } = useTranslation();
    const [expandedStep, setExpandedStep] = useState<number | null>(1);
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

    const openUrl = async (url: string) => {
        try {
            await invoke('plugin:opener|open_url', { url });
        } catch (error) {
            console.error('Failed to open URL:', error);
            window.open(url, '_blank');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('settings.portForwarding.copied'));
    };

    const toggleStep = (stepId: number) => {
        setExpandedStep(expandedStep === stepId ? null : stepId);
    };

    const markComplete = (stepId: number) => {
        const newCompleted = new Set(completedSteps);
        if (newCompleted.has(stepId)) {
            newCompleted.delete(stepId);
        } else {
            newCompleted.add(stepId);
        }
        setCompletedSteps(newCompleted);
    };

    const steps: Step[] = [
        {
            id: 1,
            title: t('settings.portForwarding.steps.findIp.title'),
            completed: completedSteps.has(1),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        {t('settings.portForwarding.steps.findIp.intro')} <code className="bg-slate-800 px-2 py-0.5 rounded text-cyan-400">192.168.1.1</code> {t('settings.portForwarding.steps.findIp.or')} <code className="bg-slate-800 px-2 py-0.5 rounded text-cyan-400">192.168.0.1</code>.
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-sm text-slate-400 mb-2">{t('settings.portForwarding.steps.findIp.cmdPrompt')}</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 bg-slate-950 px-3 py-2 rounded font-mono text-green-400 text-sm">
                                ipconfig | findstr "Default Gateway"
                            </code>
                            <button
                                onClick={() => copyToClipboard('ipconfig | findstr "Default Gateway"')}
                                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <Copy className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        {t('settings.portForwarding.steps.findIp.findGateway')}
                    </p>
                </div>
            )
        },
        {
            id: 2,
            title: t('settings.portForwarding.steps.login.title'),
            completed: completedSteps.has(2),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        {t('settings.portForwarding.steps.login.content')}
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-sm text-slate-400 mb-2">{t('settings.portForwarding.steps.login.credentials')}</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-500">{t('settings.portForwarding.steps.login.username')}</span>
                                <span className="text-white ml-2 font-mono">admin</span>
                            </div>
                            <div>
                                <span className="text-slate-500">{t('settings.portForwarding.steps.login.password')}</span>
                                <span className="text-white ml-2 font-mono">admin</span> {t('settings.portForwarding.steps.login.passwordOr')} <span className="text-white font-mono">password</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        {t('settings.portForwarding.steps.login.tip')}
                    </p>
                </div>
            )
        },
        {
            id: 3,
            title: t('settings.portForwarding.steps.findSettings.title'),
            completed: completedSteps.has(3),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        {t('settings.portForwarding.steps.findSettings.content')}
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-sm text-slate-400 mb-3">{t('settings.portForwarding.steps.findSettings.locations')}</p>
                        <ul className="space-y-2 text-sm">
                            <li className="flex items-center gap-2">
                                <Router className="w-4 h-4 text-cyan-400" />
                                <span className="text-white">Advanced → Port Forwarding</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Settings className="w-4 h-4 text-cyan-400" />
                                <span className="text-white">NAT/QoS → Port Forwarding</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-cyan-400" />
                                <span className="text-white">Firewall → Port Forwarding</span>
                            </li>
                        </ul>
                    </div>
                </div>
            )
        },
        {
            id: 4,
            title: t('settings.portForwarding.steps.addRules.title'),
            completed: completedSteps.has(4),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        {t('settings.portForwarding.steps.addRules.content')}
                    </p>
                    <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-800/50">
                                <tr>
                                    <th className="text-left p-3 text-slate-400">{t('settings.portForwarding.steps.addRules.headers.port')}</th>
                                    <th className="text-left p-3 text-slate-400">{t('settings.portForwarding.steps.addRules.headers.protocol')}</th>
                                    <th className="text-left p-3 text-slate-400">{t('settings.portForwarding.steps.addRules.headers.purpose')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">7777</td>
                                    <td className="p-3 text-purple-400">UDP</td>
                                    <td className="p-3 text-slate-300">{t('settings.portForwarding.steps.addRules.purposes.game')}</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">7778</td>
                                    <td className="p-3 text-purple-400">UDP</td>
                                    <td className="p-3 text-slate-300">{t('settings.portForwarding.steps.addRules.purposes.gamePlus')}</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">27015</td>
                                    <td className="p-3 text-purple-400">UDP</td>
                                    <td className="p-3 text-slate-300">{t('settings.portForwarding.steps.addRules.purposes.query')}</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">27020</td>
                                    <td className="p-3 text-blue-400">TCP</td>
                                    <td className="p-3 text-slate-300">{t('settings.portForwarding.steps.addRules.purposes.rcon')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-slate-500">
                        {t('settings.portForwarding.steps.addRules.tip')}
                    </p>
                </div>
            )
        },
        {
            id: 5,
            title: t('settings.portForwarding.steps.save.title'),
            completed: completedSteps.has(5),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        {t('settings.portForwarding.steps.save.content')}
                    </p>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-medium">{t('settings.portForwarding.steps.save.verify')}</span>
                        </div>
                    </div>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Globe className="w-5 h-5 text-green-400" />
                    {t('settings.portForwarding.title')}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                    {t('settings.portForwarding.description')}
                </p>
            </div>

            {/* Quick Links */}
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-300 mb-3">{t('settings.portForwarding.routerGuides')}</h4>
                <div className="flex flex-wrap gap-2">
                    {ROUTER_BRANDS.map(brand => (
                        <button
                            key={brand.name}
                            onClick={() => openUrl(brand.url)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
                        >
                            {brand.name}
                            <ExternalLink className="w-3 h-3" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Steps Accordion */}
            <div className="space-y-2">
                {steps.map((step) => (
                    <div
                        key={step.id}
                        className={cn(
                            "bg-slate-800/30 rounded-lg border transition-all",
                            expandedStep === step.id ? "border-cyan-500/30" : "border-slate-700/50",
                            completedSteps.has(step.id) && "border-green-500/30 bg-green-500/5"
                        )}
                    >
                        <div
                            className="flex items-center justify-between p-4 cursor-pointer"
                            onClick={() => toggleStep(step.id)}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                    completedSteps.has(step.id)
                                        ? "bg-green-500/20 text-green-400"
                                        : "bg-slate-700 text-slate-300"
                                )}>
                                    {completedSteps.has(step.id) ? (
                                        <CheckCircle className="w-5 h-5" />
                                    ) : (
                                        step.id
                                    )}
                                </div>
                                <span className={cn(
                                    "font-medium",
                                    completedSteps.has(step.id) ? "text-green-400" : "text-white"
                                )}>
                                    {step.title}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); markComplete(step.id); }}
                                    className={cn(
                                        "px-3 py-1 rounded text-xs font-medium transition-colors",
                                        completedSteps.has(step.id)
                                            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                                    )}
                                >
                                    {completedSteps.has(step.id) ? t('settings.portForwarding.done') : t('settings.portForwarding.markDone')}
                                </button>
                                {expandedStep === step.id ? (
                                    <ChevronDown className="w-5 h-5 text-slate-400" />
                                ) : (
                                    <ChevronRight className="w-5 h-5 text-slate-400" />
                                )}
                            </div>
                        </div>
                        {expandedStep === step.id && (
                            <div className="px-4 pb-4 pt-0 border-t border-slate-700/50 mt-0">
                                <div className="pt-4">
                                    {step.content}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Progress */}
            <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-700/50 rounded-full h-2">
                    <div
                        className="bg-gradient-to-r from-cyan-500 to-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(completedSteps.size / steps.length) * 100}%` }}
                    />
                </div>
                <span className="text-sm text-slate-400">
                    {t('settings.portForwarding.progress', { completed: completedSteps.size, total: steps.length })}
                </span>
            </div>
        </div>
    );
}
