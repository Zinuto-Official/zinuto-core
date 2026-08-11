// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { runTauriUnlistenSafely, type TauriUnlistenFn } from '@/frontend-kernel/tauriEventCleanup';

type DragState = { active: boolean; x: number; y: number };

type NativeWindowDragDropEventType = 'enter' | 'over' | 'drop' | 'leave';

export type NativeWindowDragDropEvent = {
  type: NativeWindowDragDropEventType;
  paths: string[];
  position: { x: number; y: number } | null;
};

type UseWindowChromeDragOptions = {
  onNativeDragDropEvent?: (event: NativeWindowDragDropEvent) => void;
};

const NATIVE_DRAG_DROP_EVENT = 'zinuto-native-drag-drop';
const TAURI_DRAG_DROP_EVENTS = {
  enter: 'tauri://drag-enter',
  over: 'tauri://drag-over',
  drop: 'tauri://drag-drop',
  leave: 'tauri://drag-leave'
} as const;

export const useWindowChromeDrag = ({ onNativeDragDropEvent }: UseWindowChromeDragOptions = {}) => {
  const pendingWindowDragRef = useRef<DragState>({ active: false, x: 0, y: 0 });
  const lastWindowToggleAtRef = useRef(0);
  const nativeDragDropHandlerRef = useRef<UseWindowChromeDragOptions['onNativeDragDropEvent']>(onNativeDragDropEvent);

  useEffect(() => {
    nativeDragDropHandlerRef.current = onNativeDragDropEvent;
  }, [onNativeDragDropEvent]);

  useEffect(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
    };
    if (!nativeDragDropHandlerRef.current || typeof w.__TAURI_INTERNALS__?.invoke !== 'function') {
      return;
    }
    let disposed = false;
    let unlistenWindowDrop: TauriUnlistenFn | null = null;
    let unlistenBridgeDrop: TauriUnlistenFn | null = null;
    const runUnlistenGroup = (unlisteners: TauriUnlistenFn[]) => {
      unlisteners.forEach((unlisten) => runTauriUnlistenSafely(unlisten));
    };
    const emitDropEvent = (payload: {
      type?: string;
      paths?: unknown[];
      position?: { x?: unknown; y?: unknown };
      eventType?: string;
    }) => {
      const payloadType = payload.type ?? payload.eventType;
      if (payloadType !== 'enter' && payloadType !== 'over' && payloadType !== 'drop' && payloadType !== 'leave') {
        return;
      }
      const normalizedPaths = Array.isArray(payload.paths)
        ? payload.paths.map((item) => String(item || '').trim()).filter((item) => item.length > 0)
        : [];
      const rawPosition = payload.position;
      const x = Number(rawPosition?.x);
      const y = Number(rawPosition?.y);
      nativeDragDropHandlerRef.current?.({
        type: payloadType,
        paths: normalizedPaths,
        position: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
      });
    };
    void (async () => {
      const windowDropUnlisteners: TauriUnlistenFn[] = [];
      try {
        const mod = await import('@tauri-apps/api/window');
        if (disposed) {
          return;
        }
        const currentWindow = mod.getCurrentWindow();
        windowDropUnlisteners.push(
          await currentWindow.listen<{
            paths?: unknown[];
            position?: { x?: unknown; y?: unknown };
          }>(TAURI_DRAG_DROP_EVENTS.enter, (event) => {
            emitDropEvent({
              type: 'enter',
              paths: Array.isArray(event.payload?.paths) ? event.payload.paths : [],
              position: event.payload?.position
            });
          })
        );
        windowDropUnlisteners.push(
          await currentWindow.listen<{
            position?: { x?: unknown; y?: unknown };
          }>(TAURI_DRAG_DROP_EVENTS.over, (event) => {
            emitDropEvent({
              type: 'over',
              position: event.payload?.position
            });
          })
        );
        windowDropUnlisteners.push(
          await currentWindow.listen<{
            paths?: unknown[];
            position?: { x?: unknown; y?: unknown };
          }>(TAURI_DRAG_DROP_EVENTS.drop, (event) => {
            emitDropEvent({
              type: 'drop',
              paths: Array.isArray(event.payload?.paths) ? event.payload.paths : [],
              position: event.payload?.position
            });
          })
        );
        windowDropUnlisteners.push(
          await currentWindow.listen(TAURI_DRAG_DROP_EVENTS.leave, () => {
            emitDropEvent({ type: 'leave' });
          })
        );
        const nextUnlistenWindowDrop = () => {
          runUnlistenGroup(windowDropUnlisteners);
        };
        if (disposed) {
          nextUnlistenWindowDrop();
        } else {
          unlistenWindowDrop = nextUnlistenWindowDrop;
        }
      } catch {
        runUnlistenGroup(windowDropUnlisteners);
        // Ignore registration failures and rely on native bridge drop events.
      }
      try {
        const eventMod = await import('@tauri-apps/api/event');
        if (disposed) {
          return;
        }
        const nextUnlistenBridgeDrop = await eventMod.listen<{
          eventType?: string;
          paths?: string[];
        }>(NATIVE_DRAG_DROP_EVENT, (event) => {
          emitDropEvent({
            eventType: String(event.payload?.eventType ?? '').trim().toLowerCase(),
            paths: Array.isArray(event.payload?.paths) ? event.payload.paths : []
          });
        });
        if (disposed) {
          runTauriUnlistenSafely(nextUnlistenBridgeDrop);
        } else {
          unlistenBridgeDrop = nextUnlistenBridgeDrop;
        }
      } catch {
        // Ignore bridge listener failures on non-Tauri runtimes.
      }
    })();
    return () => {
      if (disposed) {
        return;
      }
      disposed = true;
      runTauriUnlistenSafely(unlistenWindowDrop);
      runTauriUnlistenSafely(unlistenBridgeDrop);
    };
  }, [onNativeDragDropEvent]);

  const shouldHandleWindowChromeAction = useCallback((event: ReactMouseEvent<HTMLDivElement>): boolean => {
    if (event.clientY > window.innerHeight * 0.2) {
      return false;
    }
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }
    if (
      target.closest(
        'button, input, select, textarea, a, [role="button"], [contenteditable="true"], [data-no-drag="true"], [draggable="true"]'
      )
    ) {
      return false;
    }
    return true;
  }, []);

  const invokeWindowDrag = useCallback(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
    };
    if (typeof w.__TAURI_INTERNALS__?.invoke !== 'function') {
      return;
    }
    void (async () => {
      try {
        const mod = await import('@tauri-apps/api/window');
        await mod.getCurrentWindow().startDragging();
      } catch {
        // Ignore startDragging failures outside the active desktop runtime.
      }
    })();
  }, []);

  const clearPendingWindowDrag = useCallback(() => {
    pendingWindowDragRef.current.active = false;
  }, []);

  const startWindowDrag = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.detail > 1 || !shouldHandleWindowChromeAction(event)) {
        return;
      }
      pendingWindowDragRef.current = {
        active: true,
        x: event.clientX,
        y: event.clientY
      };
    },
    [shouldHandleWindowChromeAction]
  );

  const continueWindowDrag = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const pending = pendingWindowDragRef.current;
      if (!pending.active) {
        return;
      }
      if ((event.buttons & 1) !== 1) {
        clearPendingWindowDrag();
        return;
      }
      const moveDistance = Math.abs(event.clientX - pending.x) + Math.abs(event.clientY - pending.y);
      if (moveDistance < 6) {
        return;
      }
      clearPendingWindowDrag();
      invokeWindowDrag();
    },
    [clearPendingWindowDrag, invokeWindowDrag]
  );

  const toggleWindowMaximize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !shouldHandleWindowChromeAction(event)) {
        return;
      }
      clearPendingWindowDrag();
      const now = Date.now();
      if (now - lastWindowToggleAtRef.current < 320) {
        return;
      }
      lastWindowToggleAtRef.current = now;
      const w = window as unknown as {
        __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
      };
      if (typeof w.__TAURI_INTERNALS__?.invoke !== 'function') {
        return;
      }
      void (async () => {
        try {
          const mod = await import('@tauri-apps/api/window');
          await mod.getCurrentWindow().toggleMaximize();
        } catch {
          // Ignore toggle failures outside the active desktop runtime.
        }
      })();
    },
    [clearPendingWindowDrag, shouldHandleWindowChromeAction]
  );

  return {
    clearPendingWindowDrag,
    startWindowDrag,
    continueWindowDrag,
    toggleWindowMaximize
  };
};
