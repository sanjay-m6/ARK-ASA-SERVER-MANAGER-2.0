import { useState } from 'react';
import { FolderOpen, File, ChevronRight, ArrowUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';

export default function ASEFileManager() {
  const { servers } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(servers[0]?.id || null);
  const server = servers.find(s => s.id === selectedServer);
  const [currentPath, setCurrentPath] = useState('');

  const knownDirs = [
    { name: 'ShooterGame', type: 'dir', path: 'ShooterGame' },
    { name: 'Saved', type: 'dir', path: 'ShooterGame/Saved' },
    { name: 'Config', type: 'dir', path: 'ShooterGame/Saved/Config' },
    { name: 'SavedArks', type: 'dir', path: 'ShooterGame/Saved/SavedArks' },
    { name: 'Logs', type: 'dir', path: 'ShooterGame/Saved/Logs' },
    { name: 'GameUserSettings.ini', type: 'file', path: 'ShooterGame/Saved/Config/WindowsServer/GameUserSettings.ini' },
    { name: 'Game.ini', type: 'file', path: 'ShooterGame/Saved/Config/WindowsServer/Game.ini' },
  ];

  const items = currentPath ? knownDirs.filter(d => d.path.startsWith(currentPath + '/') && !d.path.slice(currentPath.length + 1).includes('/')) : knownDirs.filter(d => !d.path.includes('/'));

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><div className="p-2.5 bg-amber-500/10 rounded-xl"><FolderOpen className="w-6 h-6 text-amber-400" /></div>ASE File Manager</h1><p className="text-sm text-slate-400 mt-1">Browse server files and directories</p></div>
        <ServerSelect value={selectedServer} onChange={setSelectedServer} servers={servers} accentColor="amber" />
      </div>

      <div className="glass-panel rounded-xl p-3 flex items-center gap-2">
        <button onClick={() => setCurrentPath('')} className="text-xs text-amber-400 hover:text-amber-300 font-mono focus:outline-none">root</button>
        {currentPath && currentPath.split('/').map((part, i, arr) => (
          <span key={i} className="flex items-center gap-1"><ChevronRight className="w-3 h-3 text-slate-600" /><button onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))} className="text-xs text-slate-400 hover:text-white font-mono focus:outline-none">{part}</button></span>
        ))}
        {currentPath && <button onClick={() => setCurrentPath(currentPath.split('/').slice(0, -1).join('/'))} className="ml-auto p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors focus:outline-none"><ArrowUp className="w-4 h-4" /></button>}
      </div>

      <div className="glass-panel rounded-2xl p-4">
        {items.length === 0 ? (
          <div className="text-center py-12"><FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-2" /><p className="text-slate-500 text-sm">Empty directory</p></div>
        ) : (
          <div className="space-y-1">{items.map(item => (
            <button key={item.path} onClick={() => item.type === 'dir' && setCurrentPath(item.path)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-all text-left focus:outline-none">
              {item.type === 'dir' ? <FolderOpen className="w-5 h-5 text-amber-400" /> : <File className="w-5 h-5 text-slate-400" />}
              <span className={`text-sm ${item.type === 'dir' ? 'text-white font-medium' : 'text-slate-300'}`}>{item.name}</span>
              {item.type === 'dir' && <ChevronRight className="w-4 h-4 text-slate-600 ml-auto" />}
            </button>
          ))}</div>
        )}
      </div>

      {server && (
        <div className="bg-[#0A0F1C]/60 p-4 rounded-xl border border-white/5 shadow-2xl backdrop-blur-xl transition-all duration-300">
          <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
            <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">Install Path:</span>
            {server.installPath}
          </p>
        </div>
      )}
    </motion.div>
  );
}
