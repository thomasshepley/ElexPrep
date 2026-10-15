import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches a render error anywhere below it and shows a recoverable message instead of a blank
 * page. A change of resetKey (the route, in main.tsx) clears it, so navigating away recovers
 * without remounting the whole tree on every navigation. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-page" role="alert">
        <h1>Something went wrong</h1>
        <p className="muted">This page hit an unexpected error. Reloading usually fixes it - if it keeps happening, use "Submit a bug" so it can be looked at.</p>
        <p className="muted error-page-detail">{this.state.error.message}</p>
        <div className="row" style={{ alignItems: 'center' }}>
          <button onClick={() => window.location.reload()}>Reload</button>
          <a href="/">Go to the start</a>
        </div>
      </div>
    );
  }
}
