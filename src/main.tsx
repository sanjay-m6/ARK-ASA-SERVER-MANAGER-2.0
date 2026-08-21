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
                        background: 'var(--surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '0.75rem',
                        boxShadow: 'var(--shadow)',
                        padding: '10px 14px',
                    },
                    success: {
                        iconTheme: {
                            primary: 'var(--accent)',
                            secondary: '#f8fafc',
                        },
                    },
                    error: {
                        iconTheme: {
                            primary: 'var(--danger)',
                            secondary: '#f8fafc',
                        },
                    },
                }}
            >
                {(t) => (
                    <ToastBar toast={t}>
                        {({ icon, message }) => (
                            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                {icon}
                                <div className="flex-1 px-1">{message}</div>
                                {t.type !== 'loading' && (
                                    <button
                                        onClick={() => toast.dismiss(t.id)}
                                        className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors ml-2 focus:outline-none"
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
