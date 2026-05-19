import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Wifi, Router, Globe, Loader2, Check, X,
    Shield, Trash2, AlertTriangle, Radio
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import {
    discoverAseUPnPGateway,
    forwardAseServerPorts,
    removeAseServerPortForwards,
    type AseUPnPGatewayInfo,
    type AseUPnPForwardResult,
    type AsePortMappingResult
} from '../utils/aseCommands';
import toast from 'react-hot-toast';

export default function ASEUPnPPanel() {
    const { t } = useTranslation();
    const { servers } = useAseServerStore();
    const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
    const [gateway, setGateway] = useState<AseUPnPGatewayInfo | null>(null);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [isForwarding, setIsForwarding] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [lastResult, setLastResult] = useState<AseUPnPForwardResult | null>(null);
    const [lastRemovalResult, setLastRemovalResult] = useState<AsePortMappingResult[] | null>(null);
    const [discoveryError, setDiscoveryError] = useState<string | null>(null);

    useEffect(() => {
        if (servers.length > 0 && !selectedServerId) {
            setSelectedServerId(servers[0].id);
        }
    }, [servers, selectedServerId]);

    const handleDiscover = async () => {
        setIsDiscovering(true);
        setDiscoveryError(null);
        try {
            const gw = await discoverAseUPnPGateway();
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
        setLastRemovalResult(null);
        try {
            const result = await forwardAseServerPorts(selectedServerId);
            setLastResult(result);
            setGateway(result.gateway);
            if (result.allSuccess) {
                toast.success('All ASE ports forwarded successfully!');
            } else {
                toast.error('Some ASE ports failed to forward');
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
        setLastResult(null);
        try {
            const result = await removeAseServerPortForwards(selectedServerId);
            setLastRemovalResult(result);
            toast.success('ASE Port forwards removed');
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
                    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-500">
                        {t('upnp.title', 'ASE UPnP Port Forwarding')}
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">
                        Automatically map query and game ports on your home router for server visibility.
                    </p>
                </div>
            </div>

            {/* Gateway Discovery */}
            <div className="bg-slate-900/60 border border-amber-500/10 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Router className="w-5 h-5 text-amber-400" />
                        {t('upnp.gateway', 'UPnP IGD Gateway Status')}
                    </h3>
                    <button
                        onClick={handleDiscover}
                        disabled={isDiscovering}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl transition-all disabled:opacity-50 font-semibold"
                    >
                        {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                        <span>{isDiscovering ? 'Scanning IGD...' : 'Discover Gateway'}</span>
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
                            <p className="text-xs text-slate-500 mb-1">{t('upnp.gatewayAddr', 'Gateway Local Address')}</p>
                            <p className="text-white font-mono font-bold">{gateway.gatewayAddress}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                            <p className="text-xs text-slate-500 mb-1">{t('upnp.externalIp', 'External Public IP')}</p>
                            <p className="text-amber-400 font-mono font-bold">{gateway.externalIp}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                            <p className="text-xs text-slate-500 mb-1">{t('upnp.status', 'UPnP IGD Status')}</p>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <p className="text-emerald-400 font-bold">{t('upnp.available', 'IGD Mappings Available')}</p>
                            </div>
                        </div>
                    </div>
                ) : !discoveryError && !isDiscovering ? (
                    <div className="text-center py-8 text-slate-500">
                        <Wifi className="w-12 h-12 mx-auto mb-3 opacity-20 text-amber-500" />
                        <p>{t('upnp.clickDiscover', 'Click "Discover Gateway" to broadcast and listen for UPnP Router announcements.')}</p>
                    </div>
                ) : null}
            </div>

            {/* Port Forwarding Panel */}
            <div className="bg-slate-900/60 border border-amber-500/10 rounded-2xl p-6 backdrop-blur-sm">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                    <Globe className="w-5 h-5 text-amber-400" />
                    Automated Port Redirections
                </h3>

                <div className="space-y-4">
                    {/* Server selector */}
                    <div className="flex items-center gap-3">
                        <ServerSelect
                            value={selectedServerId}
                            onChange={setSelectedServerId}
                            servers={servers}
                            accentColor="amber"
                            className="flex-1"
                        />
                    </div>

                    {/* Current ports preview */}
                    {selectedServer && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Game Port</p>
                                <p className="text-white font-mono font-bold text-lg">{selectedServer.port}</p>
                                <p className="text-[10px] text-slate-500">UDP</p>
                            </div>
                            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Query Port</p>
                                <p className="text-white font-mono font-bold text-lg">{selectedServer.queryPort}</p>
                                <p className="text-[10px] text-slate-500">UDP</p>
                            </div>
                            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wide">RCON Command Port</p>
                                <p className="text-white font-mono font-bold text-lg">{selectedServer.rconPort}</p>
                                <p className="text-[10px] text-slate-500">TCP</p>
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleForward}
                            disabled={isForwarding || !selectedServerId}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                        >
                            {isForwarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                            <span>{isForwarding ? 'Injecting Port Forwards...' : 'Inject Port Forwards'}</span>
                        </button>
                        <button
                            onClick={handleRemove}
                            disabled={isRemoving || !selectedServerId}
                            className="flex items-center gap-2 px-5 py-3 bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-400 border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        >
                            {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            <span>Remove Port Mapping</span>
                        </button>
                    </div>

                    {/* Results */}
                    {lastResult && (
                        <div className="space-y-2 mt-4">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <Shield className="w-4 h-4 text-amber-400" />
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

                    {lastRemovalResult && (
                        <div className="space-y-2 mt-4">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <Shield className="w-4 h-4 text-amber-400" />
                                Removal Mappings Status
                            </h4>
                            {lastRemovalResult.map((m, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 rounded-xl border bg-slate-900/60 border-slate-700"
                                >
                                    <div className="flex items-center gap-3">
                                        <Check className="w-4 h-4 text-emerald-400" />
                                        <span className="text-white font-mono text-sm">{m.protocol}:{m.port}</span>
                                    </div>
                                    <span className="text-xs text-slate-400">Successfully Unmapped</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Safety note */}
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                        <AlertTriangle className="w-3 h-3 inline mr-1 mb-0.5" />
                        IGD dynamic leases automatically request 24h reservations. Ensure UPnP is checked on in your Router configuration interface.
                    </div>
                </div>
            </div>
        </div>
    );
}
