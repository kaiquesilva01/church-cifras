import { Component, type ReactNode } from 'react';

interface Props {
  onReload: () => void;
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="status">
        <p className="error">Não foi possível carregar a página.</p>
        <button type="button" className="btn" onClick={this.props.onReload}>
          Tentar de novo
        </button>
      </div>
    );
  }
}
