import { X, Folder, Sparkles } from 'lucide-react';
import ServerOrganization from '../../pages/tools/ServerOrganization';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ServerOrganizationModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative z-[1000]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Folder className="w-5 h-5 text-sky-400" />
            </div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>Server Organization Workspace</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 font-mono font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> DIRECT ACCESS
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            title="Close Workspace"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/40">
          <ServerOrganization />
        </div>
      </div>
    </div>
  );
}
