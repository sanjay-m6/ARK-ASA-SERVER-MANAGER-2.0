import { useState, useEffect, useRef, useCallback } from 'react';
import { Network, Server as ServerIcon, Link2, Unlink, Move, ZoomIn, ZoomOut, Play, Square, Focus, Cpu } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Server, Cluster } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

interface ClusterNode {
    id: number;
    serverId: number;
    x: number;
    y: number;
    name: string;
    mapName: string;
    status: string;
    ports: { gamePort: number; queryPort: number; rconPort: number };
    cpu?: number;
    players?: number;
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

    const centerX = 300;
    const centerY = 200;

    // Initialize nodes in a circular layout
    useEffect(() => {
        const clusterServers = cluster.serverIds
            .map(id => servers.find(s => s.id === id))
            .filter((s): s is Server => !!s);

        const radius = Math.min(150, 60 + clusterServers.length * 30);

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

                return {
                    id: idx,
                    serverId: server.id,
                    x,
                    y,
                    name: server.name,
                    mapName: resolvedMapName,
                    status: server.status,
                    ports: resolvedPorts,
                    // Mock dynamic data for demonstration
                    cpu: server.status === 'running' || server.status === 'online' ? Math.floor(Math.random() * 40) + 10 : 0,
                    players: server.status === 'running' || server.status === 'online' ? Math.floor(Math.random() * 50) : 0,
                };
            });
            return newNodes;
        });
    }, [cluster.serverIds, servers]);

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

    return (
        <div className="glass-panel rounded-2xl border border-slate-700/50 bg-slate-950 overflow-hidden shadow-2xl">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md z-10 relative">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20 shadow-inner">
                        <Network className="w-4 h-4 text-pink-400" />
                    </div>
                    <div>
                        <span className="text-white font-semibold text-sm block leading-none">Cluster Topology</span>
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider block mt-1">Interactive Network Map</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={resetView}
                        className="p-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-sky-400 transition-colors border border-slate-700/50 shadow-inner mr-2"
                        title="Auto-Center View"
                    >
                        <Focus className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
                        className="p-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700/50 shadow-inner"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-slate-400 font-mono w-10 text-center bg-slate-900 px-2 py-1 rounded shadow-inner">{Math.round(zoom * 100)}%</span>
                    <button
                        onClick={() => setZoom(z => Math.min(2.0, z + 0.1))}
                        className="p-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700/50 shadow-inner"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div
                ref={canvasRef}
                className={cn(
                    "relative w-full h-[450px] select-none overflow-hidden",
                    panning ? "cursor-grabbing" : "cursor-grab"
                )}
                style={{ background: 'radial-gradient(circle at 50% 50%, #0f172a 0%, #020617 100%)' }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Transform Layer */}
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
                                <circle cx="20" cy="20" r="1.5" fill="rgba(148,163,184,0.15)" />
                            </pattern>
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
                                        stroke={isActive ? `${mapColor}40` : "rgba(100,116,139,0.2)"}
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    />
                                    {/* Animated data flow pulse */}
                                    {isActive && (
                                        <path
                                            d={path}
                                            fill="none"
                                            stroke={mapColor}
                                            strokeWidth="3"
                                            strokeDasharray="10 40"
                                            strokeLinecap="round"
                                            className="animate-[dash_2s_linear_infinite]"
                                            style={{ filter: `drop-shadow(0 0 4px ${mapColor})` }}
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
                                left: hubX - 24,
                                top: hubY - 24,
                            }}
                        >
                            <div className="w-12 h-12 rounded-full bg-slate-900/80 border border-pink-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(236,72,153,0.3)] backdrop-blur-md">
                                <Link2 className="w-6 h-6 text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
                                <div className="absolute inset-0 rounded-full border-2 border-pink-500/30 animate-ping opacity-50" style={{ animationDuration: '3s' }}></div>
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
                                        left: node.x - 30, // center offset (half of width 60)
                                        top: node.y - 30,  // center offset
                                    }}
                                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                    onDoubleClick={() => setSelectedNode(node.id)}
                                >
                                    {/* Glassmorphic Node Body */}
                                    <div
                                        className={cn(
                                            "relative w-16 h-16 rounded-2xl flex flex-col items-center justify-center border border-slate-700/50 bg-slate-900/80 backdrop-blur-md shadow-inner transition-all duration-300",
                                            isSelected ? "ring-2 ring-offset-2 ring-offset-slate-900 scale-110 shadow-2xl" : "hover:scale-105 hover:shadow-xl"
                                        )}
                                        style={{
                                            borderColor: isActive ? `${color}80` : isCrashed ? 'rgba(239,68,68,0.5)' : 'rgba(71,85,105,0.5)',
                                            boxShadow: isActive ? `inset 0 0 15px ${color}20, 0 0 20px ${color}30` : isCrashed ? 'inset 0 0 15px rgba(239,68,68,0.2)' : 'none',
                                            ...(isSelected ? { ringColor: color } : {})
                                        }}
                                    >
                                        <ServerIcon className={cn("w-6 h-6 mb-1", isActive ? "drop-shadow-lg" : "")} style={{ color: isActive ? color : isCrashed ? '#ef4444' : '#64748b' }} />
                                        
                                        {/* Status Text Pill inside Node */}
                                        <div className={cn(
                                            "text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest",
                                            isActive ? "bg-green-500/20 text-green-400" : isCrashed ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-400"
                                        )}>
                                            {node.status}
                                        </div>

                                        {/* Top Right Activity Indicator */}
                                        {isActive && (
                                            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-slate-900 rounded-full flex items-center justify-center">
                                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Label underneath */}
                                    <div className="absolute top-[72px] left-1/2 -translate-x-1/2 text-center pointer-events-none w-[120px]">
                                        <p className="text-[11px] font-bold text-white drop-shadow-md truncate">{node.name}</p>
                                        <p className="text-[9px] text-slate-400 drop-shadow-md truncate">{(node.mapName || 'Unknown').replace('_WP', '')}</p>
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
                                                    "absolute left-full ml-4 top-1/2 -translate-y-1/2 z-50",
                                                    isSelected ? "block" : "hidden group-hover:block"
                                                )}
                                            >
                                                <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[180px] pointer-events-auto cursor-default">
                                                    {/* Triangle pointer */}
                                                    <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-[1px] w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-slate-700">
                                                        <div className="absolute -right-[9px] -top-[7px] w-0 h-0 border-y-[7px] border-y-transparent border-r-[7px] border-r-slate-900/95"></div>
                                                    </div>

                                                    <p className="text-sm text-white font-bold mb-0.5 truncate">{node.name}</p>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-green-500" : isCrashed ? "bg-red-500" : "bg-slate-500")} />
                                                        <span className={cn("text-[10px] font-bold uppercase", isActive ? "text-green-400" : isCrashed ? "text-red-400" : "text-slate-400")}>{node.status}</span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 mb-3 bg-slate-950/50 rounded-lg p-2 shadow-inner">
                                                        <div className="col-span-2">Map: <span className="text-slate-200">{node.mapName}</span></div>
                                                        <div>Game: <span className="text-slate-200">{node.ports.gamePort}</span></div>
                                                        <div>Query: <span className="text-slate-200">{node.ports.queryPort}</span></div>
                                                        {isActive && (
                                                            <>
                                                                <div className="flex items-center gap-1 text-sky-400"><Cpu className="w-3 h-3"/> {node.cpu}%</div>
                                                                <div className="flex items-center gap-1 text-emerald-400"><ServerIcon className="w-3 h-3"/> {node.players} Pl</div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Quick Actions inside Tooltip */}
                                                    <div className="flex items-center gap-1.5 mt-2">
                                                        {(node.status === 'stopped' || node.status === 'crashed') && onStartServer && (
                                                            <button onClick={(e) => { e.stopPropagation(); onStartServer(node.serverId); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded shadow-inner text-[10px] font-bold transition-all">
                                                                <Play className="w-3 h-3" /> Start
                                                            </button>
                                                        )}
                                                        {(node.status === 'running' || node.status === 'online') && onStopServer && (
                                                            <button onClick={(e) => { e.stopPropagation(); onStopServer(node.serverId); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded shadow-inner text-[10px] font-bold transition-all">
                                                                <Square className="w-3 h-3" /> Stop
                                                            </button>
                                                        )}
                                                        {onRemoveServer && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onRemoveServer(node.serverId); }}
                                                                className="flex items-center justify-center w-7 h-7 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded transition-all"
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
            </div>

            {/* Add server bar */}
            {onAddServer && availableServers.length > 0 && (
                <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/30 backdrop-blur flex items-center gap-3">
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-semibold uppercase tracking-wider">
                        <Move className="w-3.5 h-3.5" />
                        Add Node
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {availableServers.slice(0, 5).map(s => (
                            <button
                                key={s.id}
                                onClick={() => onAddServer(s.id)}
                                className="px-3 py-1 bg-slate-800/80 hover:bg-pink-500/20 text-slate-300 hover:text-pink-300 border border-slate-700/80 hover:border-pink-500/50 rounded-lg text-xs font-medium transition-all shadow-inner hover:shadow-[0_0_10px_rgba(236,72,153,0.2)]"
                            >
                                + {s.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Global Animation styles needed for data flow */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes dash {
                    to { stroke-dashoffset: -50; }
                }
            `}} />
        </div>
    );
}
