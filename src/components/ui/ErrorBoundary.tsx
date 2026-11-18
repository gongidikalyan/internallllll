import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Prevent unformatted crash propagation; display structured recovery panel
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-[#060D1A]">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-[#1E3252] dark:bg-[#0C1729]">
            <div className="flex items-center gap-2.5 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h1 className="font-display text-base font-semibold">Application Recovery</h1>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {this.state.errorMessage}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.assign('/workspace')}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0B3B66] px-4 text-xs font-medium text-white hover:bg-[#082B4C] dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Return to Workspace
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
