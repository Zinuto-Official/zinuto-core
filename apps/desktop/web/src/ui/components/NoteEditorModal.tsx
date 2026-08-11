// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/ui/primitives/dialog';
import { cn } from '@/ui/cn';

type NoteEditorModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  meta?: ReactNode;
  chartPreview?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export const NoteEditorModal = ({
  open,
  onClose,
  title,
  meta,
  chartPreview,
  children,
  footer,
  className
}: NoteEditorModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent
        className={cn(
          'note-editor-modal-shell flex min-h-0 w-full max-w-[1200px] flex-col rounded-card-lg border border-card-border bg-card p-4 shadow-float',
          className
        )}
      >
        {(title || meta) ? (
          <DialogHeader className="note-editor-modal-header">
            {title ? <DialogTitle className="note-editor-modal-title text-left text-r5 text-text-primary">{title}</DialogTitle> : null}
            {meta ? <DialogDescription className="note-editor-modal-meta mt-1 text-left text-r1 text-text-tertiary">{meta}</DialogDescription> : null}
          </DialogHeader>
        ) : null}
        {chartPreview ? <div className="note-editor-modal-chart-preview mt-3 rounded-card border border-subtle/60 bg-panel-soft p-2">{chartPreview}</div> : null}
        <div className="note-editor-modal-content mt-3 min-h-[320px]">{children}</div>
        {footer ? <DialogFooter className="note-editor-modal-footer mx-0 mb-0 mt-3 flex justify-end border-t-0 bg-transparent p-0">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
};
