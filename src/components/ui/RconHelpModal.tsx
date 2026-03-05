import { X, Server, ShieldAlert, Terminal, CheckCircle2, PlayCircle } from 'lucide-react';

interface RconHelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function RconHelpModal({ isOpen, onClose }: RconHelpModalProps) {

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/10 rounded-lg">
                            <Terminal className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">RCON Console Guide</h2>
                            <p className="text-sm text-slate-400">Setup, Connection, and Troubleshooting</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-8 custom-scrollbar">

                    {/* Section 1: What is RCON */}
                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Server className="w-5 h-5 text-blue-400" />
                            What is RCON?
                        </h3>
                        <p className="text-slate-300 leading-relaxed text-sm">
                            RCON (Remote Console) is a protocol that allows server administrators to remotely execute commands, chat with players, and manage the server without being in-game.
                        </p>
                    </section>

                    {/* Section 2: Configuration */}
                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            Required Settings
                        </h3>
                        <div className="space-y-4 text-sm">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                                <h4 className="font-medium text-white mb-1">1. Enable RCON</h4>
                                <p className="text-slate-400 mb-2">RCON must be enabled in your server configuration.</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                                <h4 className="font-medium text-white mb-1">2. RCON Port</h4>
                                <p className="text-slate-400 mb-2">Usually <code className="text-cyan-400 bg-slate-900 px-1 rounded">32330</code> or <code className="text-cyan-400 bg-slate-900 px-1 rounded">27020</code>.</p>
                                <p className="text-slate-300"><strong>Note:</strong> You must Port Forward this port on your router as <strong>TCP</strong> and allow it through your Windows Firewall.</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                                <h4 className="font-medium text-white mb-1">3. Server Admin Password</h4>
                                <p className="text-slate-400">An admin password is absolutely required to authenticate your RCON connection. Do not leave this field blank.</p>
                            </div>
                        </div>
                    </section>

                    {/* Section 3: Troubleshooting */}
                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-rose-400" />
                            Troubleshooting Connection Issues
                        </h3>
                        <div className="space-y-4 text-sm">
                            <div className="border-l-2 border-rose-500/50 pl-4 py-1">
                                <h4 className="font-medium text-white">"Authentication Failed"</h4>
                                <p className="text-slate-400 mt-1">
                                    The RCON port is open, but the password doesn't match.
                                    Check your <code className="text-cyan-400">GameUserSettings.ini</code> file for corruption on the <code className="text-cyan-400">ServerAdminPassword=</code> line. Ensure there is no garbage text like <code>?ServerPassword=</code> appended to the end of your password.
                                </p>
                            </div>
                            <div className="border-l-2 border-amber-500/50 pl-4 py-1">
                                <h4 className="font-medium text-white">"Connection Timed Out"</h4>
                                <ul className="text-slate-400 mt-1 list-disc list-inside space-y-1">
                                    <li>The server is still starting. (RCON is the last service to boot).</li>
                                    <li>The RCON port is blocked by Windows Firewall or your router.</li>
                                    <li>You placed your public IP in the "Server IP" field. Ensure the Server IP is left empty or set to <code>0.0.0.0</code> to bind all local interfaces.</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Section 4: Basic Commands */}
                    <section>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <PlayCircle className="w-5 h-5 text-violet-400" />
                            Useful Commands
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                <code className="text-cyan-400 block mb-1">SaveWorld</code>
                                <span className="text-slate-400">Forces a world save.</span>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                <code className="text-cyan-400 block mb-1">DestroyWildDinos</code>
                                <span className="text-slate-400">Wipes all wild dinos.</span>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                <code className="text-cyan-400 block mb-1">ListPlayers</code>
                                <span className="text-slate-400">Shows connected players.</span>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                <code className="text-cyan-400 block mb-1">SetTimeOfDay 08:00</code>
                                <span className="text-slate-400">Changes in-game time.</span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-700/50 bg-slate-800/30 shrink-0 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                    >
                        Close Guide
                    </button>
                </div>
            </div>
        </div>
    );
}
