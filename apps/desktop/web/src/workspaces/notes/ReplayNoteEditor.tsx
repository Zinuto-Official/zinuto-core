// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  HeadingNode,
  QuoteNode,
} from "@lexical/rich-text";
import {
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  mergeRegister,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import { VendorIcon, type VendorIconName } from "@/assets/graphics";
import { ToolbarIconButton as UiToolbarIconButton } from "@/ui/components/ToolbarIconButton";
import { formatMessage } from "@zinuto/shared/i18n";
import {
  normalizeReplayNoteAttachments,
  stringifyReplayNoteDocument,
  type ReplayNoteAttachmentV1,
  type ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { CapsuleNode, NoteEmbedNode } from "@/workspaces/notes/ReplayNoteLexicalNodes";
import {
  $applyReplayNoteDocumentToEditor,
  $exportReplayNoteDocumentFromEditor,
} from "@/workspaces/notes/replayNoteLexicalAdapter";
import {
  $resolveReplayNoteToolbarState,
  REPLAY_NOTE_STICKY_FORMATTING_SYNC_TAG,
  applyReplayNoteBlockStyleAction,
  applyReplayNoteInlineTextAction,
  applyReplayNoteInsertBlockAction,
  applyReplayNoteListAction,
  createReplayNoteInitialStickyFormattingState,
  createReplayNoteInitialToolbarState,
  resolveReplayNoteStickyBlockStyleUpdate,
  resolveReplayNoteStickyInlineTextUpdate,
  resolveReplayNoteStickyListUpdate,
  resolveReplayNoteToolbarStateWithStickyFormatting,
  syncReplayNoteStickyFormattingState,
  type ReplayNoteBlockStyleAction,
  type ReplayNoteInlineTextAction,
  type ReplayNoteInsertBlockAction,
  type ReplayNoteListAction,
  type ReplayNoteStickyFormattingState,
  type ReplayNoteToolbarState,
} from "@/workspaces/notes/replayNoteEditorFormatting";

const EDITOR_CHANGE_EMIT_DELAY_MS = 240;

const t = (language: AppUiLanguage, key: string): string =>
  formatMessage(language, key as never);

type ReplayNoteEditorProps = {
  noteId: string;
  initialDocument: ReplayNoteDocumentV1;
  attachments?: ReplayNoteAttachmentV1[];
  language: AppUiLanguage;
  onContentDocumentChange: (
    noteId: string,
    document: ReplayNoteDocumentV1,
    attachments: ReplayNoteAttachmentV1[],
  ) => void;
  mode?: "edit" | "read";
  className?: string;
  toolbarEndContent?: ReactNode;
};

type ToolbarItem = {
  action:
    | ReplayNoteInlineTextAction
    | ReplayNoteListAction
    | ReplayNoteInsertBlockAction;
  label: string;
  iconName: VendorIconName;
};

type BlockStyleItem = {
  action: ReplayNoteBlockStyleAction;
  label: string;
  iconName: VendorIconName;
};

const useToolbarConfig = (language: AppUiLanguage) =>
  useMemo(
    () => ({
      blockStyles: [
        { action: "paragraph", label: t(language, "appText.text"), iconName: "type" },
        { action: "heading1", label: t(language, "appText.title1"), iconName: "heading1" },
        { action: "heading2", label: t(language, "appText.title2"), iconName: "heading2" },
        { action: "heading3", label: t(language, "appText.title3"), iconName: "heading3" },
        { action: "quote", label: t(language, "appText.quote"), iconName: "quote" },
      ] satisfies BlockStyleItem[],
      inlineItems: [
        { action: "bold", label: t(language, "appText.bold"), iconName: "bold" },
        { action: "italic", label: t(language, "appText.italic"), iconName: "italic" },
        { action: "underline", label: t(language, "appText.underline"), iconName: "underline" },
        { action: "highlight", label: t(language, "appText.highlight"), iconName: "highlight" },
      ] satisfies ToolbarItem[],
      listItems: [
        { action: "bulletList", label: t(language, "appText.bulletList"), iconName: "list" },
        { action: "orderedList", label: t(language, "appText.orderedList"), iconName: "listOrdered" },
        { action: "checkList", label: t(language, "appText.taskList"), iconName: "listChecks" },
      ] satisfies ToolbarItem[],
      insertItems: [
        { action: "divider", label: t(language, "appText.divider"), iconName: "minus" },
      ] satisfies ToolbarItem[],
    }),
    [language],
  );

const ReplayNoteToolbarIconButton = ({
  item,
  isActive = false,
  isToggle = true,
  onAction,
}: {
  item: ToolbarItem;
  isActive?: boolean;
  isToggle?: boolean;
  onAction: (action: ToolbarItem["action"]) => void;
}) => (
  <UiToolbarIconButton
    active={isActive}
    className="replay-note-editor-toolbar-button"
    aria-pressed={isToggle ? isActive : undefined}
    aria-label={item.label}
    label={item.label}
    onMouseDown={(event) => event.preventDefault()}
    onClick={() => onAction(item.action)}
  >
    <VendorIcon name={item.iconName} />
  </UiToolbarIconButton>
);

const BlockStyleIconButton = ({
  item,
  isActive,
  onAction,
}: {
  item: BlockStyleItem;
  isActive: boolean;
  onAction: (action: ReplayNoteBlockStyleAction) => void;
}) => (
  <UiToolbarIconButton
    active={isActive}
    className="replay-note-editor-toolbar-button"
    aria-pressed={isActive}
    aria-label={item.label}
    label={item.label}
    onMouseDown={(event) => event.preventDefault()}
    onClick={() => onAction(item.action)}
  >
    <VendorIcon name={item.iconName} />
  </UiToolbarIconButton>
);

const EditablePlugin = ({ editable }: { editable: boolean }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editable, editor]);
  return null;
};

const ToolbarPlugin = ({
  blockStyles,
  inlineItems,
  listItems,
  insertItems,
  isReadOnly,
  toolbarLabel,
  endContent,
}: {
  blockStyles: BlockStyleItem[];
  inlineItems: ToolbarItem[];
  listItems: ToolbarItem[];
  insertItems: ToolbarItem[];
  isReadOnly: boolean;
  toolbarLabel: string;
  endContent?: ReactNode;
}) => {
  const [editor] = useLexicalComposerContext();
  const [selectionToolbarState, setSelectionToolbarState] =
    useState<ReplayNoteToolbarState>(
      createReplayNoteInitialToolbarState,
    );
  const [stickyFormattingState, setStickyFormattingState] =
    useState<ReplayNoteStickyFormattingState>(
      createReplayNoteInitialStickyFormattingState,
    );
  const selectionToolbarStateRef = useRef<ReplayNoteToolbarState>(
    createReplayNoteInitialToolbarState(),
  );
  const stickyFormattingStateRef = useRef<ReplayNoteStickyFormattingState>(
    createReplayNoteInitialStickyFormattingState(),
  );

  const toolbarState = useMemo(
    () =>
      resolveReplayNoteToolbarStateWithStickyFormatting(
        selectionToolbarState,
        stickyFormattingState,
      ),
    [selectionToolbarState, stickyFormattingState],
  );

  const updateToolbarState = useCallback(() => {
    const nextState = $resolveReplayNoteToolbarState();
    selectionToolbarStateRef.current = nextState;
    setSelectionToolbarState(nextState);
  }, []);

  useEffect(() => {
    stickyFormattingStateRef.current = stickyFormattingState;
  }, [stickyFormattingState]);

  useEffect(() => {
    if (isReadOnly) {
      const nextSelectionState = createReplayNoteInitialToolbarState();
      const nextStickyState = createReplayNoteInitialStickyFormattingState();
      selectionToolbarStateRef.current = nextSelectionState;
      stickyFormattingStateRef.current = nextStickyState;
      setSelectionToolbarState(nextSelectionState);
      setStickyFormattingState(nextStickyState);
      return;
    }
    editor.getEditorState().read(updateToolbarState);
    return mergeRegister(
      editor.registerUpdateListener(({ editorState, tags }) => {
        editorState.read(updateToolbarState);
        if (!tags.has(REPLAY_NOTE_STICKY_FORMATTING_SYNC_TAG)) {
          syncReplayNoteStickyFormattingState(
            editor,
            stickyFormattingStateRef.current,
          );
        }
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbarState();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, isReadOnly, updateToolbarState]);

  const applyBlockStyle = useCallback(
    (action: ReplayNoteBlockStyleAction) => {
      if (isReadOnly) {
        return;
      }
      const nextUpdate = resolveReplayNoteStickyBlockStyleUpdate(
        stickyFormattingStateRef.current,
        selectionToolbarStateRef.current,
        action,
      );
      stickyFormattingStateRef.current = nextUpdate.stickyState;
      setStickyFormattingState(nextUpdate.stickyState);
      applyReplayNoteBlockStyleAction(editor, nextUpdate.actionToApply);
      editor.focus();
    },
    [editor, isReadOnly],
  );

  const handleAction = useCallback(
    (action: ToolbarItem["action"]) => {
      if (isReadOnly) {
        return;
      }
      if (
        action === "bold" ||
        action === "italic" ||
        action === "underline" ||
        action === "highlight"
      ) {
        const nextUpdate = resolveReplayNoteStickyInlineTextUpdate(
          stickyFormattingStateRef.current,
          selectionToolbarStateRef.current,
          action,
        );
        stickyFormattingStateRef.current = nextUpdate.stickyState;
        setStickyFormattingState(nextUpdate.stickyState);
        applyReplayNoteInlineTextAction(
          editor,
          nextUpdate.actionToApply,
          nextUpdate.isActive,
        );
      } else if (
        action === "bulletList" ||
        action === "orderedList" ||
        action === "checkList"
      ) {
        const nextUpdate = resolveReplayNoteStickyListUpdate(
          stickyFormattingStateRef.current,
          selectionToolbarStateRef.current,
          action,
        );
        stickyFormattingStateRef.current = nextUpdate.stickyState;
        setStickyFormattingState(nextUpdate.stickyState);
        applyReplayNoteListAction(
          editor,
          nextUpdate.actionToApply,
          nextUpdate.isActive,
        );
      } else {
        applyReplayNoteInsertBlockAction(editor, action);
      }
      editor.focus();
    },
    [editor, isReadOnly],
  );

  if (isReadOnly) {
    return null;
  }

  return (
    <div
      className="replay-note-editor-toolbar"
      role="toolbar"
      aria-label={toolbarLabel}
    >
      <div className="replay-note-editor-toolbar-group">
        {blockStyles.map((item) => (
          <BlockStyleIconButton
            key={item.action}
            item={item}
            isActive={toolbarState.blockStyle === item.action}
            onAction={applyBlockStyle}
          />
        ))}
      </div>
      <div className="replay-note-editor-toolbar-group">
        {inlineItems.map((item) => (
          <ReplayNoteToolbarIconButton
            key={item.action}
            item={item}
            isActive={
              toolbarState.inlineFormats[item.action as ReplayNoteInlineTextAction]
            }
            onAction={handleAction}
          />
        ))}
      </div>
      <div className="replay-note-editor-toolbar-group">
        {listItems.map((item) => (
          <ReplayNoteToolbarIconButton
            key={item.action}
            item={item}
            isActive={toolbarState.listStyle === item.action}
            onAction={handleAction}
          />
        ))}
      </div>
      <div className="replay-note-editor-toolbar-group">
        {insertItems.map((item) => (
          <ReplayNoteToolbarIconButton
            key={item.action}
            item={item}
            isToggle={false}
            onAction={handleAction}
          />
        ))}
      </div>
      {endContent ? (
        <div className="replay-note-editor-toolbar-end">{endContent}</div>
      ) : null}
    </div>
  );
};

const OnDocumentChangePlugin = ({
  noteId,
  initialDocument,
  attachments,
  onChange,
}: {
  noteId: string;
  initialDocument: ReplayNoteDocumentV1;
  attachments: ReplayNoteAttachmentV1[];
  onChange: ReplayNoteEditorProps["onContentDocumentChange"];
}) => {
  const noteIdRef = useRef(noteId);
  const attachmentsRef = useRef(attachments);
  const onChangeRef = useRef(onChange);
  const initialSerialized = useMemo(
    () => stringifyReplayNoteDocument(initialDocument),
    [initialDocument],
  );
  const lastEmittedRef = useRef(initialSerialized);
  const lastFlushedRef = useRef(initialSerialized);
  const pendingDocumentRef = useRef<ReplayNoteDocumentV1 | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  const flushPendingDocument = useCallback(() => {
    const pending = pendingDocumentRef.current;
    pendingDocumentRef.current = null;
    if (!pending) {
      return;
    }
    const serialized = stringifyReplayNoteDocument(pending);
    if (serialized === lastFlushedRef.current) {
      return;
    }
    lastFlushedRef.current = serialized;
    onChangeRef.current(noteIdRef.current, pending, attachmentsRef.current);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushPendingDocument();
    }, EDITOR_CHANGE_EMIT_DELAY_MS);
  }, [flushPendingDocument]);

  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    lastEmittedRef.current = initialSerialized;
    lastFlushedRef.current = initialSerialized;
    pendingDocumentRef.current = null;
  }, [initialSerialized]);

  useEffect(
    () => () => {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushPendingDocument();
    },
    [flushPendingDocument],
  );

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
      if (tags.has("history-merge")) {
        return;
      }
      editorState.read(() => {
        const document = $exportReplayNoteDocumentFromEditor();
        const serialized = stringifyReplayNoteDocument(document);
        if (serialized === lastEmittedRef.current) {
          return;
        }
        lastEmittedRef.current = serialized;
        pendingDocumentRef.current = document;
        scheduleFlush();
      });
    },
    [scheduleFlush],
  );

  return <OnChangePlugin onChange={handleChange} ignoreSelectionChange />;
};

const ReplayNoteEditor = ({
  noteId,
  initialDocument,
  attachments = [],
  language,
  onContentDocumentChange,
  mode = "edit",
  className = "",
  toolbarEndContent,
}: ReplayNoteEditorProps) => {
  const { blockStyles, inlineItems, listItems, insertItems } =
    useToolbarConfig(language);
  const normalizedAttachments = useMemo(
    () => normalizeReplayNoteAttachments(attachments),
    [attachments],
  );
  const initialConfig = useMemo(
    () => ({
      namespace: `zinuto-replay-note-${noteId}`,
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        HorizontalRuleNode,
        CapsuleNode,
        NoteEmbedNode,
      ],
      theme: {
        heading: {
          h1: "replay-note-lexical-heading replay-note-lexical-heading-1",
          h2: "replay-note-lexical-heading replay-note-lexical-heading-2",
          h3: "replay-note-lexical-heading replay-note-lexical-heading-3",
        },
        quote: "replay-note-lexical-quote",
        text: {
          bold: "replay-note-lexical-text-bold",
          italic: "replay-note-lexical-text-italic",
          underline: "replay-note-lexical-text-underline",
          highlight: "replay-note-lexical-text-highlight",
        },
        list: {
          ul: "replay-note-lexical-list replay-note-lexical-list-ul",
          ol: "replay-note-lexical-list replay-note-lexical-list-ol",
          checklist: "replay-note-lexical-list replay-note-lexical-check-list",
          listitem: "replay-note-lexical-list-item",
          listitemChecked:
            "replay-note-lexical-check-list-item replay-note-lexical-check-list-item-checked",
          listitemUnchecked: "replay-note-lexical-check-list-item",
        },
        hr: "replay-note-lexical-divider",
        hrSelected: "is-selected",
      },
      editable: mode !== "read",
      onError(error: Error) {
        throw error;
      },
      editorState() {
        $applyReplayNoteDocumentToEditor(initialDocument);
      },
    }),
    [initialDocument, mode, noteId],
  );

  return (
    <div
      className={className}
      data-editor-mode={mode}
      data-autoshrink-ignore="true"
      data-no-drag="true"
    >
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin
          blockStyles={blockStyles}
          inlineItems={inlineItems}
          listItems={listItems}
          insertItems={insertItems}
          isReadOnly={mode === "read"}
          toolbarLabel={t(language, "appText.notes")}
          endContent={toolbarEndContent}
        />
        <div className="replay-note-lexical-shell">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="replay-note-lexical-content"
                spellCheck
                aria-label={t(language, "appText.enterContent")}
              />
            }
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <HorizontalRulePlugin />
          <EditablePlugin editable={mode !== "read"} />
          <OnDocumentChangePlugin
            noteId={noteId}
            initialDocument={initialDocument}
            attachments={normalizedAttachments}
            onChange={onContentDocumentChange}
          />
        </div>
      </LexicalComposer>
    </div>
  );
};

export default ReplayNoteEditor;
