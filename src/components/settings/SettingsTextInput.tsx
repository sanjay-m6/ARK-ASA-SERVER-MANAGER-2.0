

interface SettingsTextInputProps {
    label: string;
    value: string;
    description?: string;
    placeholder?: string;
    type?: 'text' | 'password' | 'number';
    onChange: (value: string) => void;
}

export function SettingsTextInput({
    label,
    value,
    description,
    placeholder,
    type = 'text',
    onChange
}: SettingsTextInputProps) {
    return (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-cyan-500/30 transition-colors">
            <label className="text-white font-medium block mb-1">{label}</label>
            {description && (
                <p className="text-slate-400 text-sm mb-3">{description}</p>
            )}

            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
        </div>
    );
}
