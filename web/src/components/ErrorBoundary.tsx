import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Stops one bad row taking the whole page with it.
 *
 * React unmounts the entire tree when a render throws, which shows as a blank
 * white screen — the least useful failure there is, because it hides both what
 * broke and everything that still works. This keeps the failure where it
 * happened and says what it was.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console so the stack is still there to read.
    console.error('[Virtus] render failed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <p className="font-medium">
          {this.props.label ?? 'This section'} could not be displayed.
        </p>
        <p className="mt-0.5 text-xs opacity-80">{this.state.error.message}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-2 text-xs font-medium underline"
        >
          Try again
        </button>
      </div>
    );
  }
}
