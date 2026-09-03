import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, ToastBar, toast } from 'react-hot-toast';
import { X, Check, AlertCircle, Info, Loader2 } from 'lucide-react';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/globals.css';

// Block right-click context menu and developer shortcuts in production
if ((import.meta as any).env?.PROD) {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12') {
            e.preventDefault();
        }
        if (e.ctrlKey && (
            (e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J' || e.key === 'i' || e.key === 'c' || e.key === 'j')) || 
            e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S'
        )) {
            e.preventDefault();
        }
        if (e.metaKey && (
            (e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J' || e.key === 'i' || e.key === 'c' || e.key === 'j')) || 
            e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S'
        )) {
            e.preventDefault();
        }
    });
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
            <Toaster
                position="top-right"
                containerStyle={{
                    top: 64,
                    right: 20,
                }}
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: 'rgba(15, 20, 32, 0.95)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        color: '#f8fafc',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '0.875rem',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                        padding: '10px 14px',
                    },
                }}
            >
                {(t) => (
                    <ToastBar
                        toast={t}
                        style={{
                            ...t.style,
                            border: t.type === 'success' 
                                ? '1px solid rgba(16, 185, 129, 0.35)' 
                                : t.type === 'error' 
                                ? '1px solid rgba(244, 63, 94, 0.35)' 
                                : t.type === 'loading'
                                ? '1px solid rgba(14, 165, 233, 0.35)'
                                : '1px solid rgba(255, 255, 255, 0.12)',
                            background: 'rgba(15, 20, 32, 0.95)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            boxShadow: t.type === 'success'
                                ? '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                : t.type === 'error'
                                ? '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(244, 63, 94, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                : '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                        }}
                    >
                        {({ message }) => {
                            const renderIcon = () => {
                                switch (t.type) {
                                    case 'success':
                                        return (
                                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-400/35 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] shrink-0">
                                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                            </div>
                                        );
                                    case 'error':
                                        return (
                                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-400/35 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)] shrink-0">
                                                <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                                            </div>
                                        );
                                    case 'loading':
                                        return (
                                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-400/35 text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.3)] shrink-0">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin stroke-[2.5]" />
                                            </div>
                                        );
                                    default:
                                        return (
                                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-400/35 text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.3)] shrink-0">
                                                <Info className="w-3.5 h-3.5 stroke-[2.5]" />
                                            </div>
                                        );
                                }
                            };

                            return (
                                <div className="flex items-center gap-3 text-xs font-semibold text-slate-100 tracking-wide">
                                    {renderIcon()}
                                    <div className="flex-1 px-0.5 select-none leading-relaxed">{message}</div>
                                    {t.type !== 'loading' && (
                                        <button
                                            onClick={() => toast.dismiss(t.id)}
                                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all duration-150 ml-1.5 focus:outline-none shrink-0"
                                            aria-label="Close notification"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        }}
                    </ToastBar>
                )}
            </Toaster>
        </QueryClientProvider>
    </React.StrictMode>
);
