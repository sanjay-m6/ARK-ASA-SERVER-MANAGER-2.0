import { useState, useRef, useEffect } from 'react';
import { ScrollText, Search, Pause, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import { listen } from '@tauri-apps/api/event';
import ServerSelect from '../../components/ui/ServerSelect';

export default function ASELogsConsole() {
  const { servers } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(servers[0]?.id || null);
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsub: () => void;
    listen<{ server_id: number; line: string }>('ase-log-line', (e) => {
      if (!selectedServer || e.payload.server_id === selectedServer) {
        if (e.payload.line === '__CLEAR_LOGS_SIGNAL__') {
          setLogs([]);
        } else {
          setLogs(prev => { const n = [...prev, e.payload.line]; return n.length > 2000 ? n.slice(-2000) : n; });
        }
      }
    }).then(u => { unsub = u; });
    return () => { if (unsub) unsub(); };
  }, [selectedServer]);

  useEffect(() => { if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs, autoScroll]);

  const filtered = filter ? logs.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : logs;

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><div className="p-2.5 bg-amber-500/10 rounded-xl"><ScrollText className="w-6 h-6 text-amber-400" /></div>ASE Logs Console</h1><p className="text-sm text-slate-400 mt-1">Real-time server log streaming</p></div>
        <ServerSelect 
          value={selectedServer} 
          onChange={(id) => { setSelectedServer(id); setLogs([]); }} 
          servers={servers} 
          accentColor="amber" 
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter logs..." className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/30" /></div>
        <button onClick={() => setAutoScroll(!autoScroll)} className={`px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all focus:outline-none border ${autoScroll ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'text-slate-400 border-white/10'}`}>{autoScroll ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{autoScroll ? 'Auto-scroll' : 'Paused'}</button>
        <button onClick={() => setLogs([])} className="px-3 py-2.5 text-slate-400 hover:text-white border border-white/10 rounded-xl text-sm font-medium transition-colors focus:outline-none">Clear</button>
      </div>

      <div ref={logRef} className="glass-panel rounded-2xl p-4 h-[600px] overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600"><p>Waiting for log output...</p></div>
        ) : filtered.map((line, i) => (
          <div key={i} className={`py-0.5 px-2 rounded ${line.toLowerCase().includes('error') ? 'text-rose-400 bg-rose-500/5' : line.toLowerCase().includes('warn') ? 'text-amber-400 bg-amber-500/5' : 'text-slate-300'}`}>{line}</div>
        ))}
      </div>
    </motion.div>
  );
}
