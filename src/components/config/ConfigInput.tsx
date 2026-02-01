import { RotateCcw } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { ConfigField } from '../../data/configMappings';
import { SettingsSlider } from '../settings/SettingsSlider';
import { ArrayEditor } from './ArrayEditor';
import { ConfigTooltip } from './ConfigTooltip';

interface ConfigInputProps {
    field: ConfigField;
    value: string;
    onChange: (val: string) => void;
    isModified?: boolean;
    onReset?: () => void;
}

export default function ConfigInput({
    field,
    value,
    onChange,
    isModified,
    onReset
}: ConfigInputProps) {
    // Label with Tooltip
    const labelContent = (
        <ConfigTooltip
            label={field.label}
            description={field.description}
            defaultValue={field.defaultValue}
            currentValue={value}
            wikiLink={field.wikiLink}
        >
            <div className="flex items-center gap-2 mb-2">
                <div className="text-white font-medium flex items-center gap-2 group cursor-help">
                    {field.label}
                    {isModified && (
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                        </span>
                    )}
                </div>
                {isModified && onReset && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onReset(); }}
                        className="p-1 rounded-md hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Reset to default"
                    >
                        <RotateCcw className="w-3 h-3" />
                    </button>
                )}
            </div>
        </ConfigTooltip>
    );

    // Container Styles
    const containerClassName = cn(
        "glass-panel p-5 rounded-xl border transition-all duration-300 group",
        isModified
            ? "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50"
            : "border-slate-700/50 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-900/10"
    );

    // Input Styles
    const inputClassName = cn(
        "w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500",
        isModified && "border-orange-500/30 focus:ring-orange-500/50 focus:border-orange-500"
    );

    switch (field.type) {
        case 'slider':
            return (
                <SettingsSlider
                    label={
                        <div className="flex items-center gap-2 mb-1">
                            {labelContent}
                        </div>
                    }
                    description={field.description}
                    value={parseFloat(value) || field.min || 0}
                    min={field.min || 0}
                    max={field.max || 100}
                    step={field.step || 1}
                    onChange={(val) => onChange(val.toString())}
                    isModified={isModified}
                />
            );

        case 'boolean':
            return (
                <div className={containerClassName}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            {labelContent}
                            {field.description && <div className="text-sm text-slate-400 leading-relaxed">{field.description}</div>}
                        </div>
                        <button
                            onClick={() => onChange(value.toLowerCase() === 'true' ? 'False' : 'True')}
                            className={cn(
                                "relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 flex-shrink-0 mt-1",
                                value.toLowerCase() === 'true'
                                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/20"
                                    : "bg-slate-700 inner-shadow"
                            )}
                        >
                            <span
                                className={cn(
                                    "block w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300",
                                    value.toLowerCase() === 'true' ? "translate-x-7" : "translate-x-1"
                                )}
                            />
                        </button>
                    </div>
                </div>
            );

        case 'dropdown':
            return (
                <div className={containerClassName}>
                    {labelContent}
                    <div className="relative">
                        <select
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className={cn(inputClassName, "appearance-none cursor-pointer")}
                        >
                            {field.options?.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                    {field.description && <div className="mt-3 text-sm text-slate-400">{field.description}</div>}
                </div>
            );

        case 'array':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <div className={cn(containerClassName, "p-6")}>
                        <div className="mb-4">{labelContent}</div>
                        <ArrayEditor
                            label={""} // Label handled above
                            value={value}
                            onChange={onChange}
                            template={field.template || {}}
                        />
                        {field.description && (
                            <div className="mt-2 text-xs text-slate-500 px-1 italic">
                                {field.description}
                            </div>
                        )}
                    </div>
                </div>
            );

        case 'textarea':
            return (
                <div className="col-span-1 md:col-span-2 lg:col-span-2">
                    <div className={containerClassName}>
                        {labelContent}
                        <textarea
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className={cn(inputClassName, "min-h-[150px] resize-y")}
                            placeholder="Enter values, one per line..."
                        />
                        {field.description && <div className="mt-2 text-sm text-slate-400">{field.description}</div>}
                    </div>
                </div>
            );

        default:
            return (
                <div className={containerClassName}>
                    {labelContent}
                    <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className={inputClassName}
                    />
                    {field.description && <div className="mt-2 text-sm text-slate-400">{field.description}</div>}
                </div>
            );
    }
}
