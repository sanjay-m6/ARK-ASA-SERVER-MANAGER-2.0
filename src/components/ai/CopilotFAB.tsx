import { Bot } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useCopilotStore } from '../../stores/copilotStore';

export default function CopilotFAB() {
    const { toggle, isOpen, alertCount } = useCopilotStore();

    return (
        <button
            id="copilot-fab"
            onClick={toggle}
            className={cn(
                "fixed top-28 right-6 z-[90] w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 group shadow-lg",
                isOpen
                    ? "bg-slate-800 border border-slate-600 shadow-black/40 scale-90"
                    : "bg-gradient-to-br from-cyan-500/90 to-blue-600/90 border border-cyan-400/30 shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105"
            )}
            title={isOpen ? 'Close Copilot' : 'Open Copilot'}
            aria-label={isOpen ? 'Close Copilot' : 'Open Copilot'}
        >
            <Bot className={cn(
                "w-5 h-5 transition-transform duration-300",
                isOpen ? "text-slate-400 rotate-0" : "text-white group-hover:rotate-12"
            )} />

            {/* Alert badge */}
            {alertCount > 0 && !isOpen && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-dark-950 animate-bounce">
                    {alertCount > 9 ? '9+' : alertCount}
                </span>
            )}

            {/* Pulse ring when alerts exist */}
            {alertCount > 0 && !isOpen && (
                <span className="absolute inset-0 rounded-full border-2 border-red-400/50 animate-ping" />
            )}
        </button>
    );
}
