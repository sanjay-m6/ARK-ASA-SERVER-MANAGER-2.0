import { Component, ErrorInfo, ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        const t = (this.props.t && typeof this.props.t === 'function')
            ? this.props.t
            : (key: string, fallback?: string) => fallback || key;

        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-slate-200 p-6">
                    <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-lg shadow-2xl p-8 space-y-6">
                        <div className="flex items-center space-x-4 border-b border-slate-800 pb-6">
                            <div className="bg-red-500/10 p-3 rounded-full">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-10 w-10 text-red-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">{t('errorBoundary.title') || 'Application Error'}</h1>
                                <p className="text-slate-400">
                                    {t('errorBoundary.subtitle') || 'Something went wrong and the application could not render.'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-950 rounded p-4 font-mono text-xs text-red-300 overflow-auto max-h-64 border border-slate-800">
                                <p className="font-bold mb-2">{this.state.error?.toString()}</p>
                                <pre className="whitespace-pre-wrap opacity-75">
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </div>
                        </div>

                        <div className="flex items-center justify-end space-x-4 pt-4 border-t border-slate-800">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors"
                            >
                                {t('errorBoundary.reload') || 'Reload Application'}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default withTranslation()(ErrorBoundary);
