import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Network, Server as ServerIcon, Link2, Unlink, Move, ZoomIn, ZoomOut, Play, Square, Focus, Maximize2, Minimize2, Cpu, Globe, Wifi, WifiOff, Users, Hash, Clock, HardDrive, X } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Server, Cluster } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

/** Matches the backend ServerHealthInfo struct from discord_panel.rs */
interface ServerHealthInfo {
    id: number;
    name: string;
    status: string;
    player_count: number;
    max_players: number;
    cpu_usage: number;
    ram_usage: number;
    fps: number;
    uptime: string;
    last_started: string | null;
    mods: string[];
    crashed: boolean;
}

interface ClusterNode {
    id: number;
    serverId: number;
    x: number;
    y: number;
    name: string;
    mapName: string;
    status: string;
    ports: { gamePort: number; queryPort: number; rconPort: number };
    cpu: number;
    ram: number;
    players: number;
    maxPlayers: number;
    uptime: string;
}

interface VisualClusterBuilderProps {
    cluster: Cluster;
    servers: Server[];
    allServers: Server[];
    onAddServer?: (serverId: number) => void;
    onRemoveServer?: (serverId: number) => void;
    onStartServer?: (serverId: number) => void;
    onStopServer?: (serverId: number) => void;
}

const MAP_COLORS: Record<string, string> = {
    'TheIsland_WP': '#22c55e',
    'ScorchedEarth_WP': '#f59e0b',
    'TheCenter_WP': '#3b82f6',
    'Aberration_WP': '#0ea5e9',
    'Extinction_WP': '#ef4444',
    'Ragnarok_WP': '#06b6d4',
    'Valguero_WP': '#ec4899',
    'LostIsland_WP': '#14b8a6',
    'Fjordur_WP': '#10b981',
};

function getMapColor(mapName: string): string {
    for (const [key, color] of Object.entries(MAP_COLORS)) {
        if (mapName.toLowerCase().includes(key.toLowerCase().replace('_wp', ''))) {
            return color;
        }
    }
    return '#38bdf8'; // Default sky blue
}

export default function VisualClusterBuilder({ cluster, servers, allServers, onAddServer, onRemoveServer, onStartServer, onStopServer }: VisualClusterBuilderProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [nodes, setNodes] = useState<ClusterNode[]>([]);
    const [dragging, setDragging] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [selectedNode, setSelectedNode] = useState<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [panning, setPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [isMaximized, setIsMaximized] = useState(false);

    // Support Escape key to exit maximized mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isMaximized) {
                setIsMaximized(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMaximized]);

    const centerX = 300;
    const centerY = 200;

    // Real health data from backend
    const [healthData, setHealthData] = useState<Map<number, ServerHealthInfo>>(new Map());

    // Fetch real server health metrics from the backend
    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const result = await invoke<ServerHealthInfo[]>('get_cluster_servers_health', {
                    clusterId: cluster.id,
                });
                const map = new Map<number, ServerHealthInfo>();
                result.forEach(h => map.set(h.id, h));
                setHealthData(map);
            } catch (err) {
                console.error('Failed to fetch cluster health:', err);
            }
        };

        fetchHealth();
        const interval = setInterval(fetchHealth, 10_000);
        return () => clearInterval(interval);
    }, [cluster.id]);

    // Initialize nodes in a circular layout, merging real health data
    useEffect(() => {
        const clusterServers = cluster.serverIds
            .map(id => servers.find(s => s.id === id))
            .filter((s): s is Server => !!s);

        const radius = Math.min(180, 80 + clusterServers.length * 35);

        setNodes(prevNodes => {
            const newNodes: ClusterNode[] = clusterServers.map((server, idx) => {
                const existingNode = prevNodes.find(n => n.serverId === server.id);
                const angle = (2 * Math.PI * idx) / clusterServers.length - Math.PI / 2;
                
                // Keep existing position if node was already there, otherwise use circle
                const x = existingNode ? existingNode.x : centerX + radius * Math.cos(angle);
                const y = existingNode ? existingNode.y : centerY + radius * Math.sin(angle);

                // Support both ASA (server.config.mapName, server.ports) and ASE (server.mapName, top-level ports) shapes
                const anyServer = server as any;
                const resolvedMapName = server.config?.mapName ?? anyServer.mapName ?? 'Unknown';
                const resolvedPorts = server.ports ?? {
                    gamePort: anyServer.port ?? 7777,
                    queryPort: anyServer.queryPort ?? 27015,
                    rconPort: anyServer.rconPort ?? 27020,
                };

                // Use real health data from backend instead of random values
                const health = healthData.get(server.id);

                return {
                    id: idx,
                    serverId: server.id,
                    x,
                    y,
                    name: server.name,
                    mapName: resolvedMapName,
                    status: server.status,
                    ports: resolvedPorts,
                    cpu: health ? Math.round(health.cpu_usage * 10) / 10 : 0,
                    ram: health ? Math.round(health.ram_usage * 10) / 10 : 0,
                    players: health?.player_count ?? 0,
                    maxPlayers: health?.max_players ?? (server.config?.maxPlayers ?? 70),
                    uptime: health?.uptime ?? 'N/A',
                };
            });
            return newNodes;
        });
    }, [cluster.serverIds, servers, healthData]);

    const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: number) => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        setDragging(nodeId);
        setDragOffset({
            x: (e.clientX) / zoom - node.x,
            y: (e.clientY) / zoom - node.y,
        });
        setSelectedNode(nodeId);
    }, [nodes, zoom]);

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        setPanning(true);
        setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        setSelectedNode(null); // Click empty space to deselect
    }, [panOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (dragging !== null) {
            const x = (e.clientX) / zoom - dragOffset.x;
            const y = (e.clientY) / zoom - dragOffset.y;

            setNodes(prev => prev.map(n =>
                n.id === dragging
                    ? { ...n, x, y }
                    : n
            ));
        } else if (panning) {
            setPanOffset({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            });
        }
    }, [dragging, dragOffset, zoom, panning, panStart]);

    const handleMouseUp = useCallback(() => {
        setDragging(null);
        setPanning(false);
    }, []);

    const resetView = () => {
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
    };

    // Calculate center hub coordinates
    const hubX = nodes.length > 0 ? nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length : centerX;
    const hubY = nodes.length > 0 ? nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length : centerY;

    // Helper to draw smooth bezier curves from node to hub
    const createBezierPath = (startX: number, startY: number, endX: number, endY: number) => {
        const cx = (startX + endX) / 2;
        const cy = (startY + endY) / 2;
        // Curve slightly outward based on angle
        const angle = Math.atan2(endY - startY, endX - startX);
        const curveOffset = 40;
        const ctrlX = cx - Math.sin(angle) * curveOffset;
        const ctrlY = cy + Math.cos(angle) * curveOffset;
        
        return `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
    };

    // Available servers not in the cluster
    const availableServers = allServers.filter(
        s => !cluster.serverIds.includes(s.id)
    );

    // Stats for toolbar
    const onlineCount = nodes.filter(n => n.status === 'running' || n.status === 'online').length;
    const offlineCount = nodes.filter(n => n.status === 'stopped').length;
    const totalPlayers = nodes.reduce((sum, n) => sum + n.players, 0);

    const renderToolbar = (isFullscreen: boolean) => (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl z-10 relative">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-600/20 border border-pink-500/30 flex items-center justify-center shadow-lg shadow-pink-500/10">
                    <Network className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-[var(--text-primary)] font-bold text-sm block leading-none tracking-wide">Cluster Topology</span>
                        {isFullscreen && (
                            <span className="px-2 py-0.5 rounded-md bg-pink-500/15 text-pink-400 border border-pink-500/30 text-[10px] font-bold uppercase">{cluster.name}</span>
                        )}
                    </div>
                    <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider block mt-1">
                        {isFullscreen ? 'Interactive Network Map • Fullscreen View' : 'Interactive Network Map'}
                    </span>
                </div>
            </div>

            {/* Center Stats Chips */}
            <div className="hidden md:flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400">{onlineCount} Online</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)]">
                    <WifiOff className="w-3 h-3 text-[var(--text-muted)]" />
                    <span className="text-[10px] font-bold text-[var(--text-secondary)]">{offlineCount} Offline</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                    <Users className="w-3 h-3 text-sky-400" />
                    <span className="text-[10px] font-bold text-sky-400">{totalPlayers} Players</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <Globe className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold text-indigo-400">{nodes.length} Nodes</span>
                </div>
                {(cluster.clusterPath.startsWith('\\\\') || cluster.clusterPath.startsWith('//') || cluster.clusterPath.includes(':')) && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20" title={`Cluster storage path: ${cluster.clusterPath}`}>
                        <HardDrive className="w-3 h-3 text-purple-400" />
                        <span className="text-[10px] font-bold text-purple-300">
                            {cluster.clusterPath.startsWith('\\\\') || cluster.clusterPath.startsWith('//') ? 'Network Share' : 'Custom Path'}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                {/* Auto-Center View */}
                <button
                    onClick={resetView}
                    className="p-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] rounded-xl text-[var(--text-secondary)] hover:text-sky-400 transition-all border border-[var(--border)] shadow-inner cursor-pointer"
                    title="Auto-Center & Reset Zoom (100%)"
                >
                    <Focus className="w-3.5 h-3.5" />
                </button>
                {/* Zoom Out */}
                <button
                    onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
                    className="p-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--border)] shadow-inner cursor-pointer"
                    title="Zoom Out"
                >
                    <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs text-[var(--text-secondary)] font-mono w-12 text-center bg-[var(--surface)] px-2 py-1.5 rounded-lg shadow-inner border border-[var(--border)]">{Math.round(zoom * 100)}%</span>
                {/* Zoom In */}
                <button
                    onClick={() => setZoom(z => Math.min(2.0, z + 0.1))}
                    className="p-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--border)] shadow-inner cursor-pointer"
                    title="Zoom In"
                >
                    <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {/* Maximize / Exit Fullscreen Button */}
                {isFullscreen ? (
                    <>
                        <button
                            onClick={() => setIsMaximized(false)}
                            className="px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-xl transition-all shadow-inner ml-1 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                            title="Exit Fullscreen (Esc)"
                        >
                            <Minimize2 className="w-3.5 h-3.5" />
                            <span>Exit Fullscreen</span>
                        </button>
                        <button
                            onClick={() => setIsMaximized(false)}
                            className="p-2 bg-[var(--surface-hover)] hover:bg-rose-500/20 text-[var(--text-secondary)] hover:text-rose-400 rounded-xl transition-all border border-[var(--border)] hover:border-rose-500/30 shadow-inner cursor-pointer"
                            title="Close (Esc)"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => setIsMaximized(true)}
                        className="p-2 rounded-xl transition-all border shadow-inner bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-sky-400 border-[var(--border)] cursor-pointer"
                        title="Maximize Interactive Map (Fullscreen)"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );

    const renderCanvasContent = () => (
        <div 
            className="absolute inset-0 origin-center" 
            style={{ 
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transition: dragging || panning ? 'none' : 'transform 0.2s ease-out'
            }}
        >
            {/* Grid dots */}
            <svg className="absolute inset-0 w-[2000px] h-[2000px] -left-[1000px] -top-[1000px] pointer-events-none">
                <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <circle cx="20" cy="20" r="1" fill="rgba(148,163,184,0.08)" />
                    </pattern>
                    {/* Glow filter for connection lines */}
                    <filter id="connectionGlow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Curved Connection lines */}
                {nodes.length > 0 && nodes.map((node) => {
                    const isActive = node.status === 'running' || node.status === 'online';
                    const path = createBezierPath(node.x + 1000, node.y + 1000, hubX + 1000, hubY + 1000);
                    const mapColor = getMapColor(node.mapName);
                    
                    return (
                        <g key={`link-${node.id}`}>
                            {/* Base track line */}
                            <path
                                d={path}
                                fill="none"
                                stroke={isActive ? `${mapColor}30` : "rgba(100,116,139,0.12)"}
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                            {/* Animated data flow pulse */}
                            {isActive && (
                                <path
                                    d={path}
                                    fill="none"
                                    stroke={mapColor}
                                    strokeWidth="2.5"
                                    strokeDasharray="8 45"
                                    strokeLinecap="round"
                                    className="animate-[dash_2s_linear_infinite]"
                                    filter="url(#connectionGlow)"
                                />
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Center Hub */}
            {nodes.length > 0 && (
                <div
                    className="absolute flex items-center justify-center pointer-events-none z-10"
                    style={{
                        left: hubX - 28,
                        top: hubY - 28,
                    }}
                >
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-900/95 to-slate-800/90 border-2 border-pink-500/40 flex items-center justify-center shadow-[0_0_40px_rgba(236,72,153,0.25),0_0_80px_rgba(236,72,153,0.1)] backdrop-blur-xl">
                        <Link2 className="w-7 h-7 text-pink-400 drop-shadow-[0_0_12px_rgba(236,72,153,0.9)]" />
                        <div className="absolute inset-0 rounded-full border-2 border-pink-500/20 animate-ping opacity-40" style={{ animationDuration: '3s' }}></div>
                        {/* Outer glow ring */}
                        <div className="absolute -inset-2 rounded-full border border-pink-500/10 animate-pulse" style={{ animationDuration: '4s' }}></div>
                    </div>
                </div>
            )}

            {/* Nodes */}
            <div className="absolute inset-0 z-20">
                {nodes.map(node => {
                    const color = getMapColor(node.mapName);
                    const isActive = node.status === 'running' || node.status === 'online';
                    const isCrashed = node.status === 'crashed';
                    const isSelected = selectedNode === node.id;

                    return (
                        <div
                            key={node.id}
                            className={cn(
                                "absolute flex items-center group cursor-grab active:cursor-grabbing",
                                dragging === node.id && "z-30",
                                isSelected && "z-40"
                            )}
                            style={{
                                left: node.x - 36,
                                top: node.y - 36,
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            onDoubleClick={() => setSelectedNode(node.id)}
                        >
                            {/* Glassmorphic Node Body */}
                            <div
                                className={cn(
                                    "relative w-[72px] h-[72px] rounded-2xl flex flex-col items-center justify-center backdrop-blur-md transition-all duration-300",
                                    isSelected ? "ring-2 ring-offset-2 ring-offset-slate-950 scale-110 shadow-2xl" : "hover:scale-105 hover:shadow-xl"
                                )}
                                style={{
                                    background: isActive
                                        ? `linear-gradient(135deg, ${color}15, ${color}08)`
                                        : isCrashed
                                            ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))'
                                            : 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
                                    border: `1.5px solid ${isActive ? `${color}60` : isCrashed ? 'rgba(239,68,68,0.4)' : 'rgba(71,85,105,0.35)'}`,
                                    boxShadow: isActive
                                        ? `inset 0 1px 0 ${color}20, 0 0 30px ${color}20, 0 4px 20px rgba(0,0,0,0.4)`
                                        : isCrashed
                                            ? 'inset 0 0 15px rgba(239,68,68,0.15), 0 4px 20px rgba(0,0,0,0.4)'
                                            : '0 4px 20px rgba(0,0,0,0.4)',
                                    ...(isSelected ? { ringColor: color } : {})
                                }}
                            >
                                <ServerIcon className={cn("w-6 h-6 mb-0.5 transition-all", isActive ? "drop-shadow-lg" : "")} style={{ color: isActive ? color : isCrashed ? '#ef4444' : '#64748b' }} />
                                
                                {/* Status Text Pill inside Node */}
                                <div className={cn(
                                    "text-[7px] font-extrabold px-2 py-[2px] rounded-full uppercase tracking-[0.08em] mt-0.5",
                                    isActive ? "bg-green-500/20 text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.3)]" : isCrashed ? "bg-red-500/20 text-red-400" : "bg-slate-800/80 text-slate-500"
                                )}>
                                    {node.status === 'running' || node.status === 'online' ? 'ONLINE' : node.status === 'stopped' ? 'OFFLINE' : node.status.toUpperCase()}
                                </div>

                                {/* Top Right Activity Indicator */}
                                {isActive && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-slate-950 rounded-full flex items-center justify-center border border-slate-800">
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.9)]" />
                                    </div>
                                )}

                                {/* Colored accent bar at bottom */}
                                <div 
                                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                                    style={{ background: isActive ? color : isCrashed ? '#ef4444' : 'rgba(71,85,105,0.3)' }}
                                />
                            </div>

                            {/* Label underneath */}
                            <div className="absolute top-[80px] left-1/2 -translate-x-1/2 text-center pointer-events-none w-[140px]">
                                <p className="text-[11px] font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] truncate">{node.name}</p>
                                <p className="text-[9px] text-slate-500 drop-shadow-md truncate font-medium">{(node.mapName || 'Unknown').replace('_WP', '')}</p>
                            </div>

                            {/* Hover / Select Popover Tooltip */}
                            <AnimatePresence>
                                {(isSelected || (dragging !== node.id)) && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className={cn(
                                            "absolute left-full ml-5 top-1/2 -translate-y-1/2 z-50",
                                            isSelected ? "block" : "hidden group-hover:block"
                                        )}
                                    >
                                        <div className="bg-[var(--card-background)] backdrop-blur-2xl border border-[var(--border)] rounded-2xl p-4 shadow-2xl min-w-[210px] pointer-events-auto cursor-default text-[var(--text-primary)]">
                                            {/* Triangle pointer */}
                                            <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-[1px] w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-[var(--border)]">
                                                <div className="absolute -right-[9px] -top-[7px] w-0 h-0 border-y-[7px] border-y-transparent border-r-[7px] border-r-[var(--card-background)]"></div>
                                            </div>

                                            {/* Server Name + Status */}
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-sm text-[var(--text-primary)] font-bold truncate max-w-[140px]">{node.name}</p>
                                                <div className={cn(
                                                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide",
                                                    isActive ? "bg-green-500/15 text-green-400" : isCrashed ? "bg-red-500/15 text-red-400" : "bg-[var(--surface-hover)] text-[var(--text-muted)]"
                                                )}>
                                                    <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-green-500" : isCrashed ? "bg-red-500" : "bg-slate-400")} />
                                                    {node.status === 'running' || node.status === 'online' ? 'ONLINE' : node.status === 'stopped' ? 'OFFLINE' : node.status.toUpperCase()}
                                                </div>
                                            </div>

                                            {/* Info Grid */}
                                            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-[var(--text-secondary)] mb-3 bg-[var(--surface)] rounded-xl p-2.5 shadow-inner border border-[var(--border)]">
                                                <div className="col-span-2 flex items-center gap-1.5 pb-1.5 border-b border-[var(--border)] mb-0.5">
                                                    <Globe className="w-3 h-3 text-[var(--text-muted)]" />
                                                    <span className="text-[var(--text-primary)] font-semibold">{node.mapName}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Hash className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                                                    <span className="text-[var(--text-secondary)]">Game:</span>
                                                    <span className="text-[var(--text-primary)] font-mono font-medium">{node.ports.gamePort}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Hash className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                                                    <span className="text-[var(--text-secondary)]">Query:</span>
                                                    <span className="text-[var(--text-primary)] font-mono font-medium">{node.ports.queryPort}</span>
                                                </div>
                                                {isActive && (
                                                    <>
                                                        <div className="flex items-center gap-1.5 text-sky-400">
                                                            <Cpu className="w-3 h-3"/>
                                                            <span className="font-bold">{node.cpu}%</span>
                                                            <span className="text-[var(--text-muted)]">CPU</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-violet-400">
                                                            <HardDrive className="w-3 h-3"/>
                                                            <span className="font-bold">{node.ram}%</span>
                                                            <span className="text-[var(--text-muted)]">RAM</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-emerald-400">
                                                            <Users className="w-3 h-3"/>
                                                            <span className="font-bold">{node.players}/{node.maxPlayers}</span>
                                                            <span className="text-[var(--text-muted)]">Players</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-amber-400">
                                                            <Clock className="w-3 h-3"/>
                                                            <span className="font-bold">{node.uptime}</span>
                                                        </div>
                                                    </>
                                                )}
                                                {!isActive && (
                                                    <>
                                                        <div className="col-span-2 flex items-center gap-1.5 text-[var(--text-muted)]">
                                                            <Users className="w-3 h-3"/>
                                                            <span className="font-medium">0/{node.maxPlayers} Players</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* Quick Actions inside Tooltip */}
                                            <div className="flex items-center gap-1.5">
                                                {(node.status === 'stopped' || node.status === 'crashed') && onStartServer && (
                                                    <button onClick={(e) => { e.stopPropagation(); onStartServer(node.serverId); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl shadow-inner text-[10px] font-bold transition-all cursor-pointer">
                                                        <Play className="w-3 h-3" /> Start
                                                    </button>
                                                )}
                                                {(node.status === 'running' || node.status === 'online') && onStopServer && (
                                                    <button onClick={(e) => { e.stopPropagation(); onStopServer(node.serverId); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl shadow-inner text-[10px] font-bold transition-all cursor-pointer">
                                                        <Square className="w-3 h-3" /> Stop
                                                    </button>
                                                )}
                                                {onRemoveServer && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onRemoveServer(node.serverId); }}
                                                        className="flex items-center justify-center w-8 h-8 bg-[var(--surface-hover)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-400 border border-[var(--border)] hover:border-red-500/30 rounded-xl transition-all cursor-pointer"
                                                        title="Unlink from Cluster"
                                                    >
                                                        <Unlink className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const renderAddServerBar = () => {
        if (!onAddServer || availableServers.length === 0) return null;
        return (
            <div className="px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface)] backdrop-blur flex items-center gap-4">
                <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 font-bold uppercase tracking-wider">
                    <Move className="w-3.5 h-3.5" />
                    Add Node
                </span>
                <div className="h-5 w-px bg-[var(--border)]" />
                <div className="flex flex-wrap gap-2">
                    {availableServers.slice(0, 5).map(s => (
                        <button
                            key={s.id}
                            onClick={() => onAddServer(s.id)}
                            className="px-3.5 py-1.5 bg-[var(--surface-hover)] hover:bg-pink-500/15 text-[var(--text-secondary)] hover:text-pink-400 border border-[var(--border)] hover:border-pink-500/40 rounded-xl text-xs font-semibold transition-all shadow-inner hover:shadow-[0_0_15px_rgba(236,72,153,0.15)] cursor-pointer"
                        >
                            + {s.name}
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    const renderAnimationStyles = () => (
        <style dangerouslySetInnerHTML={{__html: `
            @keyframes dash {
                to { stroke-dashoffset: -53; }
            }
        `}} />
    );

    return (
        <>
            {/* In-Page View */}
            <div className="glass-panel rounded-2xl border border-[var(--border)] overflow-hidden shadow-2xl relative">
                {renderToolbar(false)}
                <div
                    ref={!isMaximized ? canvasRef : undefined}
                    className={cn(
                        "relative w-full h-[520px] select-none overflow-hidden",
                        panning ? "cursor-grabbing" : "cursor-grab"
                    )}
                    style={{ background: 'radial-gradient(ellipse at 50% 50%, #0f172a 0%, #020617 70%, #000000 100%)' }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {renderCanvasContent()}
                </div>
                {renderAddServerBar()}
                {renderAnimationStyles()}
            </div>

            {/* Fullscreen View via React Portal to Document Body */}
            {isMaximized && createPortal(
                <div className="fixed inset-0 z-[999999] bg-[#060a14] flex flex-col select-none overflow-hidden animate-in fade-in duration-200">
                    {renderToolbar(true)}
                    <div
                        ref={canvasRef}
                        className={cn(
                            "relative flex-1 w-full select-none overflow-hidden",
                            panning ? "cursor-grabbing" : "cursor-grab"
                        )}
                        style={{ background: 'radial-gradient(ellipse at 50% 50%, #0f172a 0%, #020617 70%, #000000 100%)' }}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        {renderCanvasContent()}
                    </div>
                    {renderAddServerBar()}
                    {renderAnimationStyles()}
                </div>,
                document.body
            )}
        </>
    );
}
