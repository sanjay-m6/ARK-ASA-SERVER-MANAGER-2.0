

interface SettingsToggleProps {
    label: string;
    value: boolean;
    description?: string;
    onChange: (value: boolean) => void;
}

export function SettingsToggle({
    label,
    value,
    description,
    onChange
}: SettingsToggleProps) {
    return (
        <div
            className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-cyan-500/30 transition-colors cursor-pointer"
            onClick={() => onChange(!value)}
        >
            <div className="flex justify-between items-center">
                <div className="flex-1">
                    <label className="text-white font-medium cursor-pointer">{label}</label>
                    {description && (
                        <p className="text-slate-400 text-sm mt-1">{description}</p>
                    )}
                </div>

                <div className="ml-4">
                    <div
                        className={`relative w-14 h-7 rounded-full transition-all duration-300 ${value
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                : 'bg-slate-600'
                            }`}
                    >
                        <div
                            className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-300 ${value ? 'left-8' : 'left-1'
                                }`}
                        />
                    </div>
                </div>
            </div>

            <div className={`mt-2 text-xs font-medium transition-colors ${value ? 'text-cyan-400' : 'text-slate-500'
                }`}>
                {value ? 'ENABLED' : 'DISABLED'}
            </div>
        </div>
    );
}
