import { cn } from '../../utils/helpers';

interface CopilotSuggestionsProps {
    suggestions: string[];
    onSelect: (suggestion: string) => void;
    disabled?: boolean;
}

export default function CopilotSuggestions({ suggestions, onSelect, disabled }: CopilotSuggestionsProps) {
    if (suggestions.length === 0) return null;

    return (
        <div className="px-3 py-2 border-b border-white/5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">💡 Suggestions</p>
            <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 4).map((suggestion) => (
                    <button
                        key={suggestion}
                        onClick={() => onSelect(suggestion)}
                        disabled={disabled}
                        className={cn(
                            "text-[11px] px-2.5 py-1.5 rounded-lg border transition-all text-left leading-tight",
                            disabled
                                ? "bg-slate-800/30 text-slate-600 border-white/5 cursor-not-allowed"
                                : "bg-slate-800/50 text-slate-300 border-white/5 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-500/20"
                        )}
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
        </div>
    );
}
