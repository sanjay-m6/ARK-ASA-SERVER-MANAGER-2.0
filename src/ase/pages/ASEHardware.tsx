import { useState } from 'react';
import { Cpu, Gauge } from 'lucide-react';
import { motion } from 'framer-motion';
export default function ASEHardware() {
  const [priority, setPriority] = useState('Normal');
  const [affinity, setAffinity] = useState<number[]>([]);

  const cores = Array.from({ length: navigator.hardwareConcurrency || 8 }, (_, i) => i);
  const priorities = ['Idle', 'Below Normal', 'Normal', 'Above Normal', 'High', 'Realtime'];

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><div className="p-2.5 bg-amber-500/10 rounded-xl"><Cpu className="w-6 h-6 text-amber-400" /></div>ASE Hardware</h1><p className="text-sm text-slate-400 mt-1">CPU affinity and process priority for ShooterGameServer.exe</p></div>

      </div>

      <div className="glass-panel rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Gauge className="w-5 h-5 text-amber-400" />Process Priority</h3>
        <div className="flex gap-2 flex-wrap">{priorities.map(p => (
          <button key={p} onClick={() => setPriority(p)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none border ${priority === p ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'text-slate-400 border-white/5 hover:border-white/10'}`}>{p}</button>
        ))}</div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Cpu className="w-5 h-5 text-amber-400" />CPU Affinity</h3>
        <p className="text-xs text-slate-500 mb-4">Select which CPU cores ShooterGameServer.exe should use. Leave all unchecked to use all cores.</p>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">{cores.map(c => (
          <button key={c} onClick={() => setAffinity(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])} className={`p-3 rounded-xl text-sm font-mono font-bold transition-all focus:outline-none border ${affinity.includes(c) ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-800/30 text-slate-500 border-white/5 hover:border-white/10'}`}>Core {c}</button>
        ))}</div>
        {affinity.length > 0 && <p className="text-xs text-amber-400 mt-3">Selected: {affinity.sort((a,b) => a-b).map(c => `Core ${c}`).join(', ')}</p>}
      </div>
    </motion.div>
  );
}
