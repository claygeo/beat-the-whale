import { Component, type ReactNode } from 'react'

/** Last-resort guard: a render error shows a friendly retry instead of a blank white screen
 * (critical on mobile / in-app webviews where a crash would otherwise look like a dead page). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg px-8 text-center">
        <span className="text-5xl">🐋</span>
        <p className="max-w-xs text-sm text-ink-secondary">
          Something glitched mid-race. Reload to jump back in.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-bg transition-all active:scale-[0.98] hover:bg-primary/90"
        >
          Reload
        </button>
      </div>
    )
  }
}
