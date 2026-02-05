import React, { useState, useCallback } from 'react';
import { FileText, Upload, AlertCircle, Check, X } from 'lucide-react';
import { cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface AdvancedModInputProps {
    onImport: (modIds: string[]) => void;
    isLoading?: boolean;
}

export const AdvancedModInput: React.FC<AdvancedModInputProps> = ({
    onImport,
    isLoading = false
}) => {
    const [inputText, setInputText] = useState('');
    const [parsedIds, setParsedIds] = useState<string[]>([]);
    const [errors, setErrors] = useState<string[]>([]);

    // Parse and validate mod IDs
    const parseModIds = useCallback((text: string) => {
        // Split by comma, newline, or space
        const rawIds = text.split(/[,\n\s]+/).filter(id => id.trim());
        const validIds: string[] = [];
        const errorList: string[] = [];
        const seen = new Set<string>();

        rawIds.forEach((id, index) => {
            const trimmed = id.trim();
            if (!trimmed) return;

            // Validate: must be numeric only
            if (!/^\d+$/.test(trimmed)) {
                errorList.push(`Line ${index + 1}: "${trimmed}" is not a valid mod ID (numbers only)`);
                return;
            }

            // Check for duplicates
            if (seen.has(trimmed)) {
                errorList.push(`Duplicate mod ID: ${trimmed}`);
                return;
            }

            seen.add(trimmed);
            validIds.push(trimmed);
        });

        setParsedIds(validIds);
        setErrors(errorList);
    }, []);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setInputText(text);
        parseModIds(text);
    };

    const handleImport = () => {
        if (parsedIds.length === 0) {
            toast.error('No valid mod IDs to import');
            return;
        }
        onImport(parsedIds);
    };

    const handleClear = () => {
        setInputText('');
        setParsedIds([]);
        setErrors([]);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 text-white/70">
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">Bulk Mod ID Import</span>
            </div>

            {/* Input Textarea */}
            <textarea
                value={inputText}
                onChange={handleTextChange}
                placeholder="Paste mod IDs here (comma, newline, or space separated)&#10;&#10;Example:&#10;123456789&#10;987654321&#10;456789123"
                className={cn(
                    "w-full h-32 px-4 py-3 rounded-xl",
                    "bg-white/5 border border-white/10",
                    "text-white placeholder-white/30",
                    "font-mono text-sm",
                    "focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30",
                    "resize-none transition-all"
                )}
            />

            {/* Status Bar */}
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                    {/* Valid count */}
                    {parsedIds.length > 0 && (
                        <div className="flex items-center gap-1.5 text-emerald-400">
                            <Check className="w-4 h-4" />
                            <span>{parsedIds.length} valid mod{parsedIds.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}

                    {/* Error count */}
                    {errors.length > 0 && (
                        <div className="flex items-center gap-1.5 text-amber-400">
                            <AlertCircle className="w-4 h-4" />
                            <span>{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleClear}
                        disabled={!inputText}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium",
                            "bg-white/5 border border-white/10",
                            "text-white/70 hover:text-white hover:bg-white/10",
                            "disabled:opacity-40 disabled:cursor-not-allowed",
                            "transition-all flex items-center gap-1.5"
                        )}
                    >
                        <X className="w-3.5 h-3.5" />
                        Clear
                    </button>

                    <button
                        onClick={handleImport}
                        disabled={parsedIds.length === 0 || isLoading}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium",
                            "bg-gradient-to-r from-orange-500 to-amber-500",
                            "text-white shadow-lg shadow-orange-500/20",
                            "hover:shadow-orange-500/40 hover:scale-[1.02]",
                            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100",
                            "transition-all flex items-center gap-1.5"
                        )}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        {isLoading ? 'Importing...' : 'Import Mods'}
                    </button>
                </div>
            </div>

            {/* Error List */}
            {errors.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="text-amber-400 text-sm font-medium mb-2">Validation Issues:</div>
                    <ul className="text-amber-400/70 text-xs space-y-1">
                        {errors.slice(0, 5).map((error, i) => (
                            <li key={i}>• {error}</li>
                        ))}
                        {errors.length > 5 && (
                            <li className="text-amber-400/50">...and {errors.length - 5} more</li>
                        )}
                    </ul>
                </div>
            )}

            {/* Preview */}
            {parsedIds.length > 0 && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-white/50 text-xs mb-2">Mod IDs to import (order preserved):</div>
                    <div className="flex flex-wrap gap-1.5">
                        {parsedIds.slice(0, 10).map((id, i) => (
                            <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-white/10 text-white/80 text-xs font-mono"
                            >
                                {id}
                            </span>
                        ))}
                        {parsedIds.length > 10 && (
                            <span className="px-2 py-0.5 rounded bg-white/5 text-white/50 text-xs">
                                +{parsedIds.length - 10} more
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdvancedModInput;
