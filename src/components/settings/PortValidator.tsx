import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, RefreshCw, Wifi, Globe, Shield, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface PortInfo {
    port: number;
    protocol: 'TCP' | 'UDP' | 'Both';
    name: string;
    description: string;
    status?: 'checking' | 'open' | 'closed' | 'unknown';
}

const DEFAULT_PORTS: PortInfo[] = [
    { port: 7777, protocol: 'UDP', name: 'Game Port', description: 'Main game client connections' },
    { port: 7778, protocol: 'UDP', name: 'Game Port +1', description: 'Secondary game traffic' },
    { port: 27015, protocol: 'UDP', name: 'Query Port', description: 'Steam server browser queries' },
    { port: 27020, protocol: 'TCP', name: 'RCON Port', description: 'Remote console connections' },
];

export default function PortValidator() {
    const [ports, setPorts] = useState<PortInfo[]>(DEFAULT_PORTS);
    const [isChecking, setIsChecking] = useState(false);
    const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
    const [publicIp, setPublicIp] = useState<string | null>(null);
    const [localIp, setLocalIp] = useState<string | null>(null);

    useEffect(() => {
        // Get local IP on mount
        fetchIpAddresses();
    }, []);

    const fetchIpAddresses = async () => {
        try {
            // Try to get public IP from a free API
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            setPublicIp(data.ip);
        } catch (err) {
            console.error('Failed to get public IP:', err);
        }

        try {
            // Get local IP from backend
            const info = await invoke<{ localIp: string }>('get_network_info').catch(() => null);
            if (info) setLocalIp(info.localIp);
        } catch (err) {
            console.error('Failed to get local IP:', err);
        }
    };

    const checkPort = async (port: number): Promise<'open' | 'closed' | 'unknown'> => {
        try {
            const result = await invoke<'Public' | 'LAN' | 'Unknown' | 'Offline'>('check_server_reachability', { port });
            if (result === 'Public' || result === 'LAN') return 'open';
            if (result === 'Offline') return 'closed';
            return 'unknown';
        } catch (err) {
            console.error(`Failed to check port ${port}:`, err);
            return 'unknown';
        }
    };

    const checkAllPorts = async () => {
        setIsChecking(true);

        // Set all ports to checking state
        setPorts(prev => prev.map(p => ({ ...p, status: 'checking' as const })));

        // Check each port
        const updatedPorts: PortInfo[] = [];
        for (const portInfo of ports) {
            const status = await checkPort(portInfo.port);
            updatedPorts.push({ ...portInfo, status });
        }

        setPorts(updatedPorts);
        setLastCheckTime(new Date());
        setIsChecking(false);

        const openCount = updatedPorts.filter(p => p.status === 'open').length;
        if (openCount === updatedPorts.length) {
            toast.success('All ports are open and accessible!');
        } else if (openCount > 0) {
            toast.success(`${openCount}/${updatedPorts.length} ports are open`);
        } else {
            toast.error('No ports appear to be open. Check your firewall and router settings.');
        }
    };

    const getStatusIcon = (status?: PortInfo['status']) => {
        switch (status) {
            case 'checking':
                return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
            case 'open':
                return <CheckCircle className="w-5 h-5 text-green-400" />;
            case 'closed':
                return <XCircle className="w-5 h-5 text-red-400" />;
            default:
                return <AlertTriangle className="w-5 h-5 text-slate-500" />;
        }
    };

    const getStatusLabel = (status?: PortInfo['status']) => {
        switch (status) {
            case 'checking': return 'Checking...';
            case 'open': return 'Open';
            case 'closed': return 'Closed';
            default: return 'Not Checked';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Shield className="w-5 h-5 text-cyan-400" />
                        Port Status Checker
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                        Verify that your server ports are accessible from the internet
                    </p>
                </div>
                <button
                    onClick={checkAllPorts}
                    disabled={isChecking}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin")} />
                    {isChecking ? 'Checking...' : 'Check All Ports'}
                </button>
            </div>

            {/* IP Addresses */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                        <Globe className="w-4 h-4" />
                        Public IP
                    </div>
                    <div className="text-white font-mono">
                        {publicIp || 'Fetching...'}
                    </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                        <Wifi className="w-4 h-4" />
                        Local IP
                    </div>
                    <div className="text-white font-mono">
                        {localIp || 'Not available'}
                    </div>
                </div>
            </div>

            {/* Port Status Table */}
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-700/50 bg-slate-900/50">
                            <th className="text-left p-4 text-sm font-medium text-slate-400">Port</th>
                            <th className="text-left p-4 text-sm font-medium text-slate-400">Protocol</th>
                            <th className="text-left p-4 text-sm font-medium text-slate-400">Purpose</th>
                            <th className="text-center p-4 text-sm font-medium text-slate-400">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ports.map((portInfo) => (
                            <tr key={portInfo.port} className="border-b border-slate-700/30 last:border-0">
                                <td className="p-4">
                                    <span className="font-mono text-cyan-400 font-medium">{portInfo.port}</span>
                                </td>
                                <td className="p-4">
                                    <span className={cn(
                                        "px-2 py-1 rounded text-xs font-medium",
                                        portInfo.protocol === 'TCP' && "bg-blue-500/20 text-blue-400",
                                        portInfo.protocol === 'UDP' && "bg-purple-500/20 text-purple-400",
                                        portInfo.protocol === 'Both' && "bg-amber-500/20 text-amber-400"
                                    )}>
                                        {portInfo.protocol}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div className="text-white text-sm">{portInfo.name}</div>
                                    <div className="text-slate-500 text-xs">{portInfo.description}</div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center justify-center gap-2">
                                        {getStatusIcon(portInfo.status)}
                                        <span className={cn(
                                            "text-sm font-medium",
                                            portInfo.status === 'open' && "text-green-400",
                                            portInfo.status === 'closed' && "text-red-400",
                                            portInfo.status === 'checking' && "text-blue-400",
                                            !portInfo.status && "text-slate-500"
                                        )}>
                                            {getStatusLabel(portInfo.status)}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Last Check Time */}
            {lastCheckTime && (
                <div className="text-center text-sm text-slate-500">
                    Last checked: {lastCheckTime.toLocaleTimeString()}
                </div>
            )}

            {/* Help Text */}
            <div className="bg-slate-800/20 rounded-lg p-4 border border-slate-700/30">
                <h4 className="text-sm font-medium text-slate-300 mb-2">🔧 Troubleshooting</h4>
                <ul className="text-xs text-slate-500 space-y-1">
                    <li>• <strong className="text-slate-400">Closed ports?</strong> Check Windows Firewall and router port forwarding</li>
                    <li>• <strong className="text-slate-400">Unknown status?</strong> The server may need to be running to test ports</li>
                    <li>• <strong className="text-slate-400">Behind CGNAT?</strong> Contact your ISP or use a VPN with port forwarding</li>
                </ul>
            </div>
        </div>
    );
}
