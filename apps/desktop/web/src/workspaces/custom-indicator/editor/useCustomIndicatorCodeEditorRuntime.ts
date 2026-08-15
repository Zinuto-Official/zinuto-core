// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { subscribeDesktopViewportChanges } from "@/api";
import { attachRafResizeMeasurement } from "@/ui/attachRafResizeMeasurement";
import {
  buildCustomIndicatorCodeEditorThemeExtension,
  customIndicatorCodeEditorSetup,
} from "@/workspaces/custom-indicator/editor/customIndicatorCodeEditorExtensions";
import { resolveCustomIndicatorCodeEditorCspNonce } from "@/workspaces/custom-indicator/editor/customIndicatorCodeEditorCspNonce";

type UseCustomIndicatorCodeEditorRuntimeArgs = {
  scriptSource: string;
  isReadOnly: boolean;
  resolvedMode: "light" | "dark";
  onSourceChange: (nextSource: string) => void;
};

export const useCustomIndicatorCodeEditorRuntime = ({
  scriptSource,
  isReadOnly,
  resolvedMode,
  onSourceChange,
}: UseCustomIndicatorCodeEditorRuntimeArgs) => {
  const codeEditorHostRef = useRef<HTMLDivElement | null>(null);
  const codeEditorViewRef = useRef<EditorView | null>(null);
  const codeEditorChangeRef = useRef(false);
  const codeEditorEditableCompartmentRef = useRef(new Compartment());
  const codeEditorReadOnlyCompartmentRef = useRef(new Compartment());
  const codeEditorThemeCompartmentRef = useRef(new Compartment());
  const initialCodeEditorResolvedModeRef = useRef(resolvedMode);
  const latestSourceChangeHandlerRef = useRef(onSourceChange);

  useEffect(() => {
    latestSourceChangeHandlerRef.current = onSourceChange;
  }, [onSourceChange]);

  useEffect(() => {
    const host = codeEditorHostRef.current;
    if (!host || codeEditorViewRef.current) {
      return;
    }
    const cspNonce = resolveCustomIndicatorCodeEditorCspNonce();
    const state = EditorState.create({
      doc: scriptSource,
      extensions: [
        customIndicatorCodeEditorSetup,
        ...(cspNonce ? [EditorView.cspNonce.of(cspNonce)] : []),
        codeEditorReadOnlyCompartmentRef.current.of(
          EditorState.readOnly.of(isReadOnly),
        ),
        codeEditorEditableCompartmentRef.current.of(
          EditorView.editable.of(!isReadOnly),
        ),
        codeEditorThemeCompartmentRef.current.of(
          buildCustomIndicatorCodeEditorThemeExtension(
            initialCodeEditorResolvedModeRef.current,
          ),
        ),
        EditorState.transactionFilter.of((transaction) => {
          if (!transaction.docChanged) {
            return transaction;
          }
          return transaction.newDoc.length <= INPUT_LIMITS.formulaSourceChars
            ? transaction
            : [];
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || codeEditorChangeRef.current) {
            return;
          }
          latestSourceChangeHandlerRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({
      state,
      parent: host,
    });
    codeEditorViewRef.current = view;

    let measureFrameId = 0;
    let measureTimerId = 0;
    let viewportFrameId = 0;
    let detachViewportChanges = () => {};
    const requestEditorMeasure = () => {
      if (measureFrameId) {
        window.cancelAnimationFrame(measureFrameId);
      }
      if (measureTimerId) {
        window.clearTimeout(measureTimerId);
      }
      measureFrameId = window.requestAnimationFrame(() => {
        measureFrameId = 0;
        if (codeEditorViewRef.current === view) {
          view.requestMeasure();
        }
      });
      measureTimerId = window.setTimeout(() => {
        measureTimerId = 0;
        if (codeEditorViewRef.current === view) {
          view.requestMeasure();
        }
      }, 96);
    };
    const detachHostResizeMeasurement = attachRafResizeMeasurement(
      host,
      requestEditorMeasure,
    );
    const handleViewportChange = () => {
      if (viewportFrameId) {
        return;
      }
      viewportFrameId = window.requestAnimationFrame(() => {
        viewportFrameId = 0;
        requestEditorMeasure();
      });
    };
    void subscribeDesktopViewportChanges(handleViewportChange).then(
      (detach) => {
        if (codeEditorViewRef.current !== view) {
          detach();
          return;
        }
        detachViewportChanges = detach;
      },
    );
    requestEditorMeasure();

    return () => {
      if (measureFrameId) {
        window.cancelAnimationFrame(measureFrameId);
      }
      if (measureTimerId) {
        window.clearTimeout(measureTimerId);
      }
      if (viewportFrameId) {
        window.cancelAnimationFrame(viewportFrameId);
      }
      detachHostResizeMeasurement();
      detachViewportChanges();
      if (codeEditorViewRef.current === view) {
        codeEditorViewRef.current = null;
      }
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = codeEditorViewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: [
        codeEditorReadOnlyCompartmentRef.current.reconfigure(
          EditorState.readOnly.of(isReadOnly),
        ),
        codeEditorEditableCompartmentRef.current.reconfigure(
          EditorView.editable.of(!isReadOnly),
        ),
      ],
    });
  }, [isReadOnly]);

  useEffect(() => {
    const view = codeEditorViewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: codeEditorThemeCompartmentRef.current.reconfigure(
        buildCustomIndicatorCodeEditorThemeExtension(resolvedMode),
      ),
    });
  }, [resolvedMode]);

  useEffect(() => {
    const view = codeEditorViewRef.current;
    if (!view) {
      return;
    }
    const currentSource = view.state.doc.toString();
    if (currentSource === scriptSource) {
      return;
    }
    codeEditorChangeRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentSource.length,
        insert: scriptSource,
      },
    });
    codeEditorChangeRef.current = false;
  }, [scriptSource]);

  return {
    codeEditorHostRef,
    codeEditorViewRef,
  };
};
