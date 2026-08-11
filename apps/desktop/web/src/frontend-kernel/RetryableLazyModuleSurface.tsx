// SPDX-License-Identifier: GPL-3.0-only

import {
  Component,
  Suspense,
  createElement,
  lazy,
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";

export const LAZY_MODULE_LOAD_DEADLINE_MS = 4_000;

const NON_RETRYABLE_MODULE_IMPORT_ERROR_PATTERNS = [
  /chunkloaderror/iu,
  /failed to fetch dynamically imported module/iu,
  /importing a module script failed/iu,
  /error loading dynamically imported module/iu,
  /loading chunk [^ ]+ failed/iu,
  /unable to preload (?:css|dependency)/iu,
];

const readLazyModuleErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error ?? "");
};

export const shouldReloadAfterRepeatedLazyModuleFailure = (
  error: unknown,
): boolean => {
  const message = readLazyModuleErrorMessage(error);
  return NON_RETRYABLE_MODULE_IMPORT_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
};

export const resolveLazyModuleRecoveryAction = (
  attempt: number,
  error: unknown,
): "reload" | "retry" =>
  attempt > 0 && shouldReloadAfterRepeatedLazyModuleFailure(error)
    ? "reload"
    : "retry";

type LazyModuleResult<Props extends object> = {
  default: ComponentType<Props>;
};

export const loadLazyModuleWithinDeadline = <Result,>(
  moduleName: string,
  loader: () => Promise<Result>,
  deadlineMs = LAZY_MODULE_LOAD_DEADLINE_MS,
): Promise<Result> =>
  new Promise<Result>((resolve, reject) => {
    let settled = false;
    const timerId = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`LAZY_MODULE_${moduleName}_TIMEOUT`));
    }, Math.max(0, deadlineMs));
    Promise.resolve()
      .then(loader)
      .then(
        (module) => {
          if (settled) {
            return;
          }
          settled = true;
          globalThis.clearTimeout(timerId);
          resolve(module);
        },
        (error) => {
          if (settled) {
            return;
          }
          settled = true;
          globalThis.clearTimeout(timerId);
          reject(error);
        },
      );
  });

type LazyModuleBoundaryProps = {
  children: ReactNode;
  moduleName: string;
  renderError: (error: unknown) => ReactNode;
};

type LazyModuleBoundaryState = {
  error: unknown | null;
};

class LazyModuleBoundary extends Component<
  LazyModuleBoundaryProps,
  LazyModuleBoundaryState
> {
  state: LazyModuleBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): LazyModuleBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[zinuto-lazy-module] scoped module failed", {
      moduleName: this.props.moduleName,
      error,
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return this.props.renderError(this.state.error);
    }
    return this.props.children;
  }
}

export type RetryableLazyModuleError = {
  error: unknown;
  retry: () => void;
};

type RetryableLazyModuleSurfaceProps<Props extends object> = {
  componentProps: Props;
  deadlineMs?: number;
  fallback: ReactNode;
  loader: () => Promise<LazyModuleResult<Props>>;
  moduleName: string;
  renderError: (state: RetryableLazyModuleError) => ReactNode;
};

export const RetryableLazyModuleSurface = <Props extends object>({
  componentProps,
  deadlineMs = LAZY_MODULE_LOAD_DEADLINE_MS,
  fallback,
  loader,
  moduleName,
  renderError,
}: RetryableLazyModuleSurfaceProps<Props>): ReactNode => {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);
  const LazyComponent = useMemo(
    () =>
      lazy(() =>
        loadLazyModuleWithinDeadline(moduleName, loader, deadlineMs),
      ),
    [attempt, deadlineMs, loader, moduleName],
  );

  return (
    <LazyModuleBoundary
      key={attempt}
      moduleName={moduleName}
      renderError={(error) =>
        renderError({
          error,
          retry: () => {
            if (
              resolveLazyModuleRecoveryAction(attempt, error) === "reload" &&
              typeof window !== "undefined"
            ) {
              window.location.reload();
              return;
            }
            retry();
          },
        })
      }
    >
      <Suspense fallback={fallback}>
        {createElement(LazyComponent, componentProps)}
      </Suspense>
    </LazyModuleBoundary>
  );
};
