import { useState, useEffect, useRef, useCallback } from 'react';
import { Network, Server as ServerIcon, Link2, Unlink, Move, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Server, Cluster } from '../../types';

interface ClusterNode {
    id: number;
    serverId: number;
    x: number;
    y: number;
    name: string;
    mapName: string;
    status: string;
    ports: { gamePort: number; queryPort: number; rconPort: number };
}

interface VisualClusterBuilderProps {
    cluster: Cluster;
    servers: Server[];
    allServers: Server[];
    onAddServer?: (serverId: number) => void;
    onRemoveServer?: (serverId: number) => void;
}

const MAP_COLORS: Record<string, string> = {
    'TheIsland_WP': '#22c55e',
    'ScorchedEarth_WP': '#f59e0b',
    'TheCenter_WP': '#3b82f6',
    'Aberration_WP': '#a855f7',
    'Extinction_WP': '#ef4444',
    'Ragnarok_WP': '#06b6d4',
    'Valguero_WP': '#ec4899',
    'LostIsland_WP': '#14b8a6',
    'Fjordur_WP': '#8b5cf6',
};

function getMapColor(mapName: string): string {
    for (const [key, color] of Object.entries(MAP_COLORS)) {
        if (mapName.toLowerCase().includes(key.toLowerCase().replace('_wp', ''))) {
            return color;
        }
    }
    return '#64748b';
}

export default function VisualClusterBuilder({ cluster, servers, allServers, onAddServer, onRemoveServer }: VisualClusterBuilderProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [nodes, setNodes] = useState<ClusterNode[]>([]);
    const [dragging, setDragging] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [selectedNode, setSelectedNode] = useState<number | null>(null);
    const [zoom, setZoom] = useState(1);

    // Initialize nodes in a circular layout
    useEffect(() => {
        const clusterServers = cluster.serverIds
            .map(id => servers.find(s => s.id === id))
            .filter((s): s is Server => !!s);

        const centerX = 300;
        const centerY = 200;
        const radius = Math.min(150, 60 + clusterServers.length * 30);

        const newNodes: ClusterNode[] = clusterServers.map((server, idx) => {
            const angle = (2 * Math.PI * idx) / clusterServers.length - Math.PI / 2;
            return {
                id: idx,
                serverId: server.id,
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
                name: server.name,
                mapName: server.config.mapName,
                status: server.status,
                ports: server.ports,
            };
        });

        setNodes(newNodes);
    }, [cluster.serverIds, servers]);

    const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: number) => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        setDragging(nodeId);
        setDragOffset({
            x: (e.clientX - rect.left) / zoom - node.x,
            y: (e.clientY - rect.top) / zoom - node.y,
        });
        setSelectedNode(nodeId);
    }, [nodes, zoom]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (dragging === null) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = (e.clientX - rect.left) / zoom - dragOffset.x;
        const y = (e.clientY - rect.top) / zoom - dragOffset.y;

        setNodes(prev => prev.map(n =>
            n.id === dragging
                ? { ...n, x: Math.max(40, Math.min(560, x)), y: Math.max(40, Math.min(360, y)) }
                : n
        ));
    }, [dragging, dragOffset, zoom]);

    const handleMouseUp = useCallback(() => {
        setDragging(null);
    }, []);

    // Available servers not in the cluster
    const availableServers = allServers.filter(
        s => !cluster.serverIds.includes(s.id)
    );

    return (
        <div className="glass-panel rounded-2xl border border-slate-700/50 bg-[#0a0a15] overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-pink-400" />
                    <span className="text-white font-semibold text-sm">Cluster Topology</span>
                    <span className="text-slate-500 text-xs">— drag nodes to rearrange</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-slate-500 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                    <button
                        onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div
                ref={canvasRef}
                className="relative w-full h-[420px] cursor-crosshair select-none overflow-hidden"
                style={{ background: 'radial-gradient(circle at 50% 50%, #0f0f2a 0%, #070712 100%)' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Grid dots */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <circle cx="20" cy="20" r="1" fill="rgba(100,116,139,0.15)" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Connection lines */}
                    {nodes.length > 1 && nodes.map((nodeA, i) =>
                        nodes.slice(i + 1).map((nodeB) => (
                            <line
                                key={`${nodeA.id}-${nodeB.id}`}
                                x1={nodeA.x}
                                y1={nodeA.y}
                                x2={nodeB.x}
                                y2={nodeB.y}
                                stroke="rgba(236,72,153,0.2)"
                                strokeWidth="1.5"
                                strokeDasharray="6 4"
                            />
                        ))
                    )}

                    {/* Connection pulse animation */}
                    {nodes.length > 1 && nodes.map((nodeA, i) =>
                        nodes.slice(i + 1).map((nodeB) => {
                            const isActive = nodeA.status === 'running' && nodeB.status === 'running';
                            if (!isActive) return null;
                            return (
                                <line
                                    key={`pulse-${nodeA.id}-${nodeB.id}`}
                                    x1={nodeA.x}
                                    y1={nodeA.y}
                                    x2={nodeB.x}
                                    y2={nodeB.y}
                                    stroke="rgba(236,72,153,0.5)"
                                    strokeWidth="2"
                                    strokeDasharray="4 8"
                                    className="animate-pulse"
                                />
                            );
                        })
                    )}
                </svg>

                {/* Nodes */}
                <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                    {nodes.map(node => {
                        const color = getMapColor(node.mapName);
                        const isActive = node.status === 'running' || node.status === 'online';
                        const isSelected = selectedNode === node.id;

                        return (
                            <div
                                key={node.id}
                                className={cn(
                                    "absolute flex flex-col items-center group cursor-grab active:cursor-grabbing",
                                    dragging === node.id && "z-30",
                                )}
                                style={{
                                    left: node.x - 40,
                                    top: node.y - 40,
                                    width: 80,
                                }}
                                onMouseDown={(e) => handleMouseDown(e, node.id)}
                            >
                                {/* Node circle */}
                                <div
                                    className={cn(
                                        "w-16 h-16 rounded-2xl flex items-center justify-center border-2 transition-all shadow-lg",
                                        isSelected ? "ring-2 ring-offset-2 ring-offset-[#0a0a15]" : "",
                                    )}
                                    style={{
                                        backgroundColor: `${color}20`,
                                        borderColor: isActive ? color : '#334155',
                                        boxShadow: isActive ? `0 0 20px ${color}30` : 'none',
                                    }}
                                >
                                    <ServerIcon className="w-6 h-6" style={{ color: isActive ? color : '#64748b' }} />

                                    {/* Status pulse */}
                                    {isActive && (
                                        <div
                                            className="absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-[#0a0a15]"
                                            style={{ backgroundColor: '#22c55e' }}
                                        />
                                    )}
                                </div>

                                {/* Label */}
                                <div className="mt-1.5 text-center max-w-[80px]">
                                    <p className="text-[10px] font-bold text-white truncate">{node.name}</p>
                                    <p className="text-[9px] text-slate-500 truncate">{node.mapName.replace('_WP', '')}</p>
                                </div>

                                {/* Hover details */}
                                <div className="absolute top-full mt-2 hidden group-hover:block z-40 pointer-events-none">
                                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 shadow-xl min-w-[140px]">
                                        <p className="text-xs text-white font-bold mb-1">{node.name}</p>
                                        <div className="space-y-0.5 text-[10px] text-slate-400">
                                            <p>Map: {node.mapName}</p>
                                            <p>Game: {node.ports.gamePort}</p>
                                            <p>Query: {node.ports.queryPort}</p>
                                            <p>RCON: {node.ports.rconPort}</p>
                                            <p className={cn("font-bold", isActive ? "text-green-400" : "text-red-400")}>
                                                {node.status.toUpperCase()}
                                            </p>
                                        </div>
                                        {onRemoveServer && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onRemoveServer(node.serverId); }}
                                                className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 bg-red-500/20 text-red-300 rounded text-[10px] pointer-events-auto hover:bg-red-500/30 transition-colors"
                                            >
                                                <Unlink className="w-3 h-3" />
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Center hub */}
                    {nodes.length > 0 && (
                        <div
                            className="absolute flex items-center justify-center pointer-events-none"
                            style={{
                                left: nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length - 16,
                                top: nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length - 16,
                            }}
                        >
                            <div className="w-8 h-8 rounded-full bg-pink-500/10 border border-pink-500/30 flex items-center justify-center">
                                <Link2 className="w-4 h-4 text-pink-400" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Add server bar */}
            {onAddServer && availableServers.length > 0 && (
                <div className="px-4 py-3 border-t border-slate-800 flex items-center gap-3">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Move className="w-3 h-3" />
                        Add server:
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {availableServers.slice(0, 5).map(s => (
                            <button
                                key={s.id}
                                onClick={() => onAddServer(s.id)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-pink-500/20 hover:text-pink-300 text-slate-400 border border-slate-700 rounded-lg text-xs transition-all"
                            >
                                + {s.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
