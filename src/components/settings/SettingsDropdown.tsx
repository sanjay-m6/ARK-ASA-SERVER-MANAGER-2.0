import { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: string;
}

interface SettingsDropdownProps {
    label: string;
    value: string;
    options: Option[];
    description?: string;
    onChange: (value: string) => void;
}

export function SettingsDropdown({
    label,
    value,
    options,
    description,
    onChange
}: SettingsDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div
            ref={dropdownRef}
            className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-cyan-500/30 transition-colors relative"
        >
            <label className="text-white font-medium block mb-1">{label}</label>
            {description && (
                <p className="text-slate-400 text-sm mb-3">{description}</p>
            )}

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-left hover:border-cyan-500/50 transition-colors"
            >
                <span className="text-white">{selectedOption?.label || value}</span>
                <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors ${option.value === value
                                ? 'text-cyan-400 bg-slate-700/50'
                                : 'text-white'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}

                    {/* Custom Value Option */}
                    <div className="border-t border-slate-700 p-2">
                        <input
                            type="text"
                            placeholder="Enter custom value..."
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    onChange(e.currentTarget.value);
                                    setIsOpen(false);
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <p className="text-xs text-slate-500 mt-1 pl-1">Press Enter to set custom value</p>
                    </div>
                </div>
            )}
        </div>
    );
}
