import React from 'react';
import { Timer, XCircle } from 'lucide-react';
import { useTimedShutdownStore } from '../../stores/timedShutdownStore';

interface ServerTimedShutdownBannerProps {
    serverId: number;
    className?: string;
}

export const ServerTimedShutdownBanner: React.FC<ServerTimedShutdownBannerProps> = ({ serverId, className = '' }) => {
    const shutdownState = useTimedShutdownStore((state) => state.activeShutdowns[serverId]);
    const cancelShutdown = useTimedShutdownStore((state) => state.cancelShutdown);

    if (!shutdownState) return null;

    const formatRemaining = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div
            className={`flex items-center justify-between gap-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl shadow-lg shadow-amber-950/20 backdrop-blur-md animate-pulse ${className}`}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-bold text-amber-300">Graceful Shutdown in Progress:</span>
                    <span className="font-mono font-extrabold text-amber-400 text-sm">
                        {formatRemaining(shutdownState.remainingSeconds)}
                    </span>
                </div>
            </div>
            <button
                type="button"
                onClick={() => cancelShutdown(serverId)}
                className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0"
                title="Cancel Timed Shutdown"
            >
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span>Cancel Shutdown</span>
            </button>
        </div>
    );
};
