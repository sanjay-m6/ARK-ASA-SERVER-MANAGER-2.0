import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, ToastBar, toast } from 'react-hot-toast';
import { X } from 'lucide-react';
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
                }}
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: '#0f172a',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '0.75rem',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                        padding: '10px 14px',
                    },
                    success: {
                        iconTheme: {
                            primary: '#0ea5e9',
                            secondary: '#f8fafc',
                        },
                    },
                    error: {
                        iconTheme: {
                            primary: '#ef4444',
                            secondary: '#f8fafc',
                        },
                    },
                }}
            >
                {(t) => (
                    <ToastBar toast={t}>
                        {({ icon, message }) => (
                            <div className="flex items-center gap-2 text-sm font-medium">
                                {icon}
                                <div className="flex-1 px-1">{message}</div>
                                {t.type !== 'loading' && (
                                    <button
                                        onClick={() => toast.dismiss(t.id)}
                                        className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors ml-2 focus:outline-none focus:ring-1 focus:ring-slate-700"
                                        aria-label="Close notification"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}
                    </ToastBar>
                )}
            </Toaster>
        </QueryClientProvider>
    </React.StrictMode>
);
