import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatRelativeTime, formatDate } from '@/utils/autoSaveApi';
import { TimelineEvent } from '@/types/autosave';
import { Shield, Save, RotateCcw, Trash2, CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface TimelineViewProps {
  events: TimelineEvent[];
}

export const TimelineView: React.FC<TimelineViewProps> = ({ events }) => {
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'save_created':
        return <Save className="w-5 h-5 text-blue-400" />;
      case 'restored':
        return <RotateCcw className="w-5 h-5 text-purple-400" />;
      case 'protected':
        return <Shield className="w-5 h-5 text-green-400" />;
      case 'deleted':
        return <Trash2 className="w-5 h-5 text-red-400" />;
      case 'validated':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'corrupted':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      default:
        return <Info className="w-5 h-5 text-slate-400" />;
    }
  };

  const getImportanceColor = (level: string) => {
    switch (level) {
      case 'high':
      case 'critical':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
      default:
        return 'border-slate-850/80 bg-slate-900/40 backdrop-blur-md text-slate-300';
    }
  };

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
        <RotateCcw className="w-12 h-12 mb-4 opacity-30 text-blue-400" />
        <p className="text-lg font-medium">No timeline events recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="p-6 relative">
      {/* Vertical Line */}
      <div className="absolute left-10 top-0 bottom-0 w-0.5 bg-slate-800/80"></div>

      <div className="space-y-6 relative">
        <AnimatePresence>
          {events.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex gap-4"
            >
              <div className="relative z-10 w-8 h-8 rounded-full bg-slate-950 border-2 border-slate-800 flex items-center justify-center shadow-lg shrink-0 mt-1">
                {getEventIcon(event.eventType)}
              </div>
              <div className={`flex-1 rounded-2xl border p-4 shadow-sm ${getImportanceColor(event.importanceLevel)}`}>
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-bold tracking-wide text-xs opacity-90">{event.eventType.replace('_', ' ').toUpperCase()}</h4>
                  <div className="text-[10px] text-slate-500 whitespace-nowrap ml-4 leading-normal">
                    <span className="font-semibold text-slate-400 block text-right">{formatRelativeTime(event.eventTime)}</span>
                    <span>{formatDate(event.eventTime)}</span>
                  </div>
                </div>
                <p className="text-sm opacity-90 font-medium text-slate-300">{event.description}</p>
                {Object.keys(event.metadata || {}).length > 0 && (
                  <div className="mt-3 bg-slate-950/40 border border-slate-850/50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(event.metadata).map(([key, val]) => (
                      <div key={key}>
                        <span className="text-slate-500 block mb-0.5 font-bold text-[10px] uppercase tracking-wider">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-slate-300 font-mono truncate block" title={val as string}>{val as string}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TimelineView;
