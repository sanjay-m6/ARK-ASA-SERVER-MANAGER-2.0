import React from 'react';
import { cn } from '../../utils/helpers';

interface SettingsSliderProps {
    label: React.ReactNode;
    value: number;
    min: number;
    max: number;
    step: number;
    description?: string;
    onChange: (value: number) => void;
    isModified?: boolean;
}

export function SettingsSlider({
    label,
    value,
    min,
    max,
    step,
    description,
    onChange,
    isModified
}: SettingsSliderProps) {
    // Dynamic max allows the slider to adapt if user types a value larger than default max
    const effectiveMax = Math.max(max, value);
    // Clamp percentage between 0 and 100 for visual bar
    const percentage = Math.min(100, Math.max(0, ((value - min) / (effectiveMax - min)) * 100));

    return (
        <div className={cn(
            "bg-slate-800/50 rounded-lg p-4 border transition-colors",
            isModified
                ? "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50"
                : "border-slate-700/50 hover:border-cyan-500/30"
        )}>
            <div className="flex justify-between items-center mb-2">
                <label className="text-white font-medium">{label}</label>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={min}
                        // Allow typing any number, don't clamp via max attribute on number input
                        step={step}
                        value={value}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) onChange(val);
                        }}
                        className={cn(
                            "bg-slate-900 border rounded px-2 py-1 w-24 text-right font-mono focus:outline-none focus:ring-1",
                            isModified
                                ? "border-orange-500/30 text-orange-200 focus:ring-orange-500/50 focus:border-orange-500"
                                : "border-slate-700 text-cyan-400 focus:ring-cyan-500"
                        )}
                    />
                </div>
            </div>

            {description && (
                <p className="text-slate-400 text-sm mb-3">{description}</p>
            )}

            <div className="relative h-2 w-full">
                <div className="absolute inset-0 h-2 bg-slate-700 rounded-full" />
                <div
                    className={cn(
                        "absolute h-2 rounded-full transition-all duration-300",
                        isModified ? "bg-gradient-to-r from-orange-500 to-red-500" : "bg-gradient-to-r from-cyan-500 to-blue-500"
                    )}
                    style={{ width: `${percentage}%` }}
                />
                <input
                    type="range"
                    min={min}
                    max={effectiveMax}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className={cn(
                        "absolute inset-0 w-full h-2 appearance-none bg-transparent cursor-pointer z-10",
                        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5",
                        "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg",
                        "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110",
                        "[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full",
                        "[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2",
                        isModified
                            ? "[&::-webkit-slider-thumb]:shadow-orange-500/50 [&::-webkit-slider-thumb]:border-orange-400 [&::-moz-range-thumb]:border-orange-400"
                            : "[&::-webkit-slider-thumb]:shadow-cyan-500/50 [&::-webkit-slider-thumb]:border-cyan-400 [&::-moz-range-thumb]:border-cyan-400"
                    )}
                />
            </div>

            <div className="flex justify-between mt-1 text-xs text-slate-500">
                <span>{min}</span>
                <span>{max}</span>
            </div>
        </div>
    );
}
