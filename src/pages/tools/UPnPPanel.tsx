import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Wifi, Router, Globe, Loader2, Check, X,
    Shield, Trash2, AlertTriangle, Radio
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import {
    discoverUpnpGateway, forwardServerPorts, removeServerPortForwards,
    getAllServers,
    type UPnPGatewayInfo, type UPnPForwardResult
} from '../../utils/tauri';
import { Server } from '../../types';
import toast from 'react-hot-toast';

export default function UPnPPanel() {
    const { t } = useTranslation();
    const [servers, setServers] = useState<Server[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [gateway, setGateway] = useState<UPnPGatewayInfo | null>(null);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [isForwarding, setIsForwarding] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [lastResult, setLastResult] = useState<UPnPForwardResult | null>(null);
    const [discoveryError, setDiscoveryError] = useState<string | null>(null);

    useEffect(() => {
        getAllServers()
            .then((s) => {
                setServers(s);
                if (s.length > 0) setSelectedServerId(s[0].id);
            })
            .catch(console.error);
    }, []);

    const handleDiscover = async () => {
        setIsDiscovering(true);
        setDiscoveryError(null);
        try {
            const gw = await discoverUpnpGateway();
            setGateway(gw);
            toast.success('UPnP gateway discovered successfully');
        } catch (error) {
            setDiscoveryError(String(error));
            setGateway(null);
            toast.error(`Gateway discovery failed: ${error}`);
        } finally {
            setIsDiscovering(false);
        }
    };

    const handleForward = async () => {
        if (!selectedServerId) return;
        setIsForwarding(true);
        try {
            const result = await forwardServerPorts(selectedServerId);
            setLastResult(result);
            setGateway(result.gateway);
            if (result.all_success) {
                toast.success('All ports forwarded successfully!');
            } else {
                toast.error('Some ports failed to forward');
            }
        } catch (error) {
            toast.error(`Port forwarding failed: ${error}`);
        } finally {
            setIsForwarding(false);
        }
    };

    const handleRemove = async () => {
        if (!selectedServerId) return;
        setIsRemoving(true);
        try {
            await removeServerPortForwards(selectedServerId);
            setLastResult(null);
            toast.success('Port forwards removed');
        } catch (error) {
            toast.error(`Failed to remove forwards: ${error}`);
        } finally {
            setIsRemoving(false);
        }
    };

    const selectedServer = servers.find(s => s.id === selectedServerId);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-400">
                        {t('upnp.title', 'UPnP Port Forwarding')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">{t('upnp.subtitle', 'Automatically configure your router for server access')}</p>
                </div>
            </div>

            {/* Gateway Discovery */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Router className="w-5 h-5 text-cyan-400" />
                        {t('upnp.gateway', 'Gateway Status')}
                    </h3>
                    <button
                        onClick={handleDiscover}
                        disabled={isDiscovering}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-50"
                    >
                        {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                        <span>{isDiscovering ? 'Scanning...' : 'Discover Gateway'}</span>
                    </button>
                </div>

                {discoveryError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300 flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>{discoveryError}</span>
                    </div>
                )}

                {gateway ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                            <p className="text-xs text-slate-500 mb-1">{t('upnp.gatewayAddr', 'Gateway Address')}</p>
                            <p className="text-white font-mono font-bold">{gateway.gateway_address}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                            <p className="text-xs text-slate-500 mb-1">{t('upnp.externalIp', 'External IP')}</p>
                            <p className="text-cyan-400 font-mono font-bold">{gateway.external_ip}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                            <p className="text-xs text-slate-500 mb-1">{t('upnp.status', 'Status')}</p>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <p className="text-emerald-400 font-bold">{t('upnp.available', 'Available')}</p>
                            </div>
                        </div>
                    </div>
                ) : !discoveryError && !isDiscovering ? (
                    <div className="text-center py-8 text-slate-500">
                        <Wifi className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>{t('upnp.clickDiscover', 'Click "Discover Gateway" to detect your UPnP-enabled router')}</p>
                    </div>
                ) : null}
            </div>

            {/* Port Forwarding Panel */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-700/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                    <Globe className="w-5 h-5 text-teal-400" />
                    {t('upnp.portForward', 'Port Forwarding')}
                </h3>

                <div className="space-y-4">
                    {/* Server selector */}
                    <div className="flex items-center gap-3">
                        <select
                            value={selectedServerId || ''}
                            onChange={(e) => setSelectedServerId(Number(e.target.value))}
                            className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                            {servers.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Current ports preview */}
                    {selectedServer && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Game Port</p>
                                <p className="text-white font-mono font-bold text-lg">{selectedServer.ports.gamePort}</p>
                                <p className="text-[10px] text-slate-500">UDP</p>
                            </div>
                            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Query Port</p>
                                <p className="text-white font-mono font-bold text-lg">{selectedServer.ports.queryPort}</p>
                                <p className="text-[10px] text-slate-500">UDP</p>
                            </div>
                            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">RCON Port</p>
                                <p className="text-white font-mono font-bold text-lg">{selectedServer.ports.rconPort}</p>
                                <p className="text-[10px] text-slate-500">TCP</p>
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleForward}
                            disabled={isForwarding || !selectedServerId}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
                        >
                            {isForwarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                            <span>{isForwarding ? 'Forwarding...' : 'Forward All Ports'}</span>
                        </button>
                        <button
                            onClick={handleRemove}
                            disabled={isRemoving || !selectedServerId}
                            className="flex items-center gap-2 px-5 py-3 bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-400 border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        >
                            {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            <span>{t('upnp.remove', 'Remove')}</span>
                        </button>
                    </div>

                    {/* Results */}
                    {lastResult && (
                        <div className="space-y-2 mt-4">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <Shield className="w-4 h-4 text-slate-400" />
                                {t('upnp.results', 'Forwarding Results')}
                            </h4>
                            {lastResult.mappings.map((m, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-xl border",
                                        m.success
                                            ? "bg-emerald-500/10 border-emerald-500/20"
                                            : "bg-red-500/10 border-red-500/20"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {m.success ? (
                                            <Check className="w-4 h-4 text-emerald-400" />
                                        ) : (
                                            <X className="w-4 h-4 text-red-400" />
                                        )}
                                        <span className="text-white font-mono text-sm">{m.protocol}:{m.port}</span>
                                    </div>
                                    {m.error && (
                                        <span className="text-xs text-red-300 truncate max-w-[200px]">{m.error}</span>
                                    )}
                                    {m.success && (
                                        <span className="text-xs text-emerald-300">{t('upnp.forwarded', 'Forwarded')}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Safety note */}
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                        <AlertTriangle className="w-3 h-3 inline mr-1 mb-0.5" />
                        UPnP mappings have a 24-hour lease by default. Your router must support UPnP/IGD for this to work. Port forwards are removed when the lease expires or manually removed.
                    </div>
                </div>
            </div>
        </div>
    );
}
