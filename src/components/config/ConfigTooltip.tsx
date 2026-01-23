import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, ExternalLink } from 'lucide-react';

interface ConfigTooltipProps {
    label: string;
    description?: string;
    defaultValue?: string;
    currentValue?: string;
    wikiLink?: string;
    children: React.ReactNode;
}

export const ConfigTooltip = ({
    label,
    description,
    defaultValue,
    currentValue,
    wikiLink,
    children
}: ConfigTooltipProps) => {
    const [isVisible, setIsVisible] = useState(false);
    const timeoutRef = useRef<any>(null);

    const showTooltip = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setIsVisible(true), 200);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsVisible(false);
    };

    return (
        <div
            className="relative inline-block"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
        >
            {children}

            <AnimatePresence>
                {isVisible && (description || defaultValue) && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute bottom-full left-0 mb-3 z-[100] w-72 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 pointer-events-none"
                    >
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                                <h4 className="font-bold text-white text-sm">{label}</h4>
                                <Info className="w-3.5 h-3.5 text-cyan-400" />
                            </div>

                            {description && (
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    {description}
                                </p>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-1">
                                {defaultValue !== undefined && (
                                    <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Default</div>
                                        <div className="text-xs text-slate-200 font-mono mt-0.5">{defaultValue}</div>
                                    </div>
                                )}
                                {currentValue !== undefined && currentValue !== defaultValue && (
                                    <div className="bg-orange-500/10 rounded-lg p-2 border border-orange-500/20">
                                        <div className="text-[10px] text-orange-500 uppercase font-bold tracking-wider">Current</div>
                                        <div className="text-xs text-orange-400 font-mono mt-0.5">{currentValue}</div>
                                    </div>
                                )}
                            </div>

                            {wikiLink && (
                                <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/80 font-medium pt-1">
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Wiki link available</span>
                                </div>
                            )}
                        </div>

                        {/* Tooltip Arrow */}
                        <div className="absolute top-full left-4 -mt-px">
                            <div className="w-3 h-3 bg-slate-900 border-r border-b border-white/10 rotate-45 transform origin-top-left" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
