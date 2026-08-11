// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";

export type SerializedCapsuleNode = Spread<
  {
    attachmentRefId: string;
  },
  SerializedLexicalNode
>;

export type SerializedNoteEmbedNode = Spread<
  {
    attachmentRefId: string;
  },
  SerializedLexicalNode
>;

const normalizeAttachmentRefId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export class CapsuleNode extends DecoratorNode<ReactNode> {
  __attachmentRefId: string;

  static getType(): string {
    return "zinuto-capsule";
  }

  static clone(node: CapsuleNode): CapsuleNode {
    return new CapsuleNode(node.__attachmentRefId, node.__key);
  }

  static importJSON(serializedNode: SerializedCapsuleNode): CapsuleNode {
    return $createCapsuleNode(serializedNode.attachmentRefId);
  }

  constructor(attachmentRefId: string, key?: NodeKey) {
    super(key);
    this.__attachmentRefId = normalizeAttachmentRefId(attachmentRefId);
  }

  exportJSON(): SerializedCapsuleNode {
    return {
      ...super.exportJSON(),
      type: "zinuto-capsule",
      version: 1,
      attachmentRefId: this.__attachmentRefId,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("span");
    element.className = "replay-note-capsule-node";
    element.dataset.attachmentRefId = this.__attachmentRefId;
    return element;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): ReactNode {
    return (
      <span className="replay-note-capsule-node-label">
        {this.__attachmentRefId}
      </span>
    );
  }

  isInline(): true {
    return true;
  }

  getAttachmentRefId(): string {
    return this.__attachmentRefId;
  }
}

export class NoteEmbedNode extends DecoratorNode<ReactNode> {
  __attachmentRefId: string;

  static getType(): string {
    return "zinuto-note-embed";
  }

  static clone(node: NoteEmbedNode): NoteEmbedNode {
    return new NoteEmbedNode(node.__attachmentRefId, node.__key);
  }

  static importJSON(serializedNode: SerializedNoteEmbedNode): NoteEmbedNode {
    return $createNoteEmbedNode(serializedNode.attachmentRefId);
  }

  constructor(attachmentRefId: string, key?: NodeKey) {
    super(key);
    this.__attachmentRefId = normalizeAttachmentRefId(attachmentRefId);
  }

  exportJSON(): SerializedNoteEmbedNode {
    return {
      ...super.exportJSON(),
      type: "zinuto-note-embed",
      version: 1,
      attachmentRefId: this.__attachmentRefId,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.className = "replay-note-embed-node";
    element.dataset.attachmentRefId = this.__attachmentRefId;
    return element;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): ReactNode {
    return (
      <div className="replay-note-embed-node-label">
        {this.__attachmentRefId}
      </div>
    );
  }

  getAttachmentRefId(): string {
    return this.__attachmentRefId;
  }
}

export const $createCapsuleNode = (attachmentRefId: string): CapsuleNode =>
  new CapsuleNode(attachmentRefId);

export const $isCapsuleNode = (
  node: LexicalNode | null | undefined,
): node is CapsuleNode => node instanceof CapsuleNode;

export const $createNoteEmbedNode = (attachmentRefId: string): NoteEmbedNode =>
  new NoteEmbedNode(attachmentRefId);

export const $isNoteEmbedNode = (
  node: LexicalNode | null | undefined,
): node is NoteEmbedNode => node instanceof NoteEmbedNode;
