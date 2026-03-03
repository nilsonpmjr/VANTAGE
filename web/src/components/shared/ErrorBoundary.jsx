import React from 'react';

/**
 * React error boundary — catches unhandled render errors and displays
 * a fallback UI instead of a white screen.
 *
 * Props:
 *   fallback — optional custom fallback element; default is a generic message
 *   children
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary] Unhandled render error:', error, info);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div style={{
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-main)',
                    color: 'var(--text-primary)',
                    gap: '1rem',
                    padding: '2rem',
                    textAlign: 'center',
                }}>
                    <span style={{ fontSize: '3rem' }}>⚠️</span>
                    <h2 style={{ margin: 0, color: 'var(--red)' }}>Algo deu errado</h2>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '480px' }}>
                        Ocorreu um erro inesperado. Por favor, recarregue a página.
                    </p>
                    <button
                        className="btn-primary"
                        onClick={() => window.location.reload()}
                    >
                        Recarregar Página
                    </button>
                    {this.state.error && (
                        <details style={{ color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '600px' }}>
                            <summary style={{ cursor: 'pointer' }}>Detalhes do erro</summary>
                            <pre style={{ textAlign: 'left', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
                                {this.state.error.toString()}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
