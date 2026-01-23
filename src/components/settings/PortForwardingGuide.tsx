import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, CheckCircle, Copy, Router, Globe, Shield, Settings } from 'lucide-react';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';

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
        toast.success('Copied to clipboard!');
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
            title: 'Find Your Router\'s IP Address',
            completed: completedSteps.has(1),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        Your router's IP is usually <code className="bg-slate-800 px-2 py-0.5 rounded text-cyan-400">192.168.1.1</code> or <code className="bg-slate-800 px-2 py-0.5 rounded text-cyan-400">192.168.0.1</code>.
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-sm text-slate-400 mb-2">Run this in Command Prompt to find it:</p>
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
                        The "Default Gateway" value is your router's IP address.
                    </p>
                </div>
            )
        },
        {
            id: 2,
            title: 'Log in to Your Router',
            completed: completedSteps.has(2),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        Open a web browser and enter your router's IP address in the URL bar.
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-sm text-slate-400 mb-2">Common default credentials:</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-500">Username:</span>
                                <span className="text-white ml-2 font-mono">admin</span>
                            </div>
                            <div>
                                <span className="text-slate-500">Password:</span>
                                <span className="text-white ml-2 font-mono">admin</span> or <span className="text-white font-mono">password</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        Tip: Check the label on your router for the default password, or try leaving it blank.
                    </p>
                </div>
            )
        },
        {
            id: 3,
            title: 'Find Port Forwarding Settings',
            completed: completedSteps.has(3),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        Look for "Port Forwarding", "NAT", "Virtual Server", or "Applications & Gaming" in your router menu.
                    </p>
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <p className="text-sm text-slate-400 mb-3">Common menu locations:</p>
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
            title: 'Add Port Forwarding Rules',
            completed: completedSteps.has(4),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        Create rules for each required port, pointing to your computer's local IP.
                    </p>
                    <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-800/50">
                                <tr>
                                    <th className="text-left p-3 text-slate-400">Port</th>
                                    <th className="text-left p-3 text-slate-400">Protocol</th>
                                    <th className="text-left p-3 text-slate-400">Purpose</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">7777</td>
                                    <td className="p-3 text-purple-400">UDP</td>
                                    <td className="p-3 text-slate-300">Game Port</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">7778</td>
                                    <td className="p-3 text-purple-400">UDP</td>
                                    <td className="p-3 text-slate-300">Game Port +1</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">27015</td>
                                    <td className="p-3 text-purple-400">UDP</td>
                                    <td className="p-3 text-slate-300">Steam Query</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-mono text-cyan-400">27020</td>
                                    <td className="p-3 text-blue-400">TCP</td>
                                    <td className="p-3 text-slate-300">RCON</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-slate-500">
                        Set "Internal IP" or "Device" to your computer's local IP address (e.g., 192.168.1.50)
                    </p>
                </div>
            )
        },
        {
            id: 5,
            title: 'Save and Apply',
            completed: completedSteps.has(5),
            content: (
                <div className="space-y-4">
                    <p className="text-slate-300 text-sm">
                        Save your settings. Some routers may require a restart for changes to take effect.
                    </p>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-medium">After saving, use the Port Status Checker above to verify!</span>
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
                    Port Forwarding Guide
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                    Step-by-step instructions to configure your router for internet access
                </p>
            </div>

            {/* Quick Links */}
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-300 mb-3">📖 Router Brand Guides</h4>
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
                                    {completedSteps.has(step.id) ? 'Done ✓' : 'Mark Done'}
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
                    {completedSteps.size}/{steps.length} complete
                </span>
            </div>
        </div>
    );
}
