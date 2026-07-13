import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles/globals.css';

// Block right-click context menu and developer shortcuts in production
if (!(import.meta as any).env?.DEV) {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12') {
            e.preventDefault();
        }
        if (e.ctrlKey && (
            (e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J' || e.key === 'R' || e.key === 'i' || e.key === 'c' || e.key === 'j' || e.key === 'r')) || 
            e.key === 'r' || e.key === 'R' || e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S'
        )) {
            e.preventDefault();
        }
        if (e.metaKey && (
            (e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J' || e.key === 'R' || e.key === 'i' || e.key === 'c' || e.key === 'j' || e.key === 'r')) || 
            e.key === 'r' || e.key === 'R' || e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S'
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

import ErrorBoundary from './components/ErrorBoundary';

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
                        background: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid #334155',
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
            />
        </QueryClientProvider>
    </React.StrictMode>
);
