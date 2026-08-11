// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  type DialogSurfacePreset,
} from '@/ui/primitives/dialog';
import { cn } from '@/ui/cn';

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  preset?: DialogSurfacePreset;
  className?: string;
  style?: CSSProperties;
  overlayClassName?: string;
  children: ReactNode;
  showCloseButton?: boolean;
  blurMask?: boolean;
  closeOnInteractOutside?: boolean;
  closeOnEscapeKeyDown?: boolean;
  focusSurfaceOnOpen?: boolean;
  accessibilityTitle?: ReactNode;
  accessibilityDescription?: ReactNode | null;
};

export const AppModal = ({
  open,
  onClose,
  preset = 'custom',
  className,
  style,
  overlayClassName,
  children,
  showCloseButton = false,
  blurMask = false,
  closeOnInteractOutside = true,
  closeOnEscapeKeyDown = true,
  focusSurfaceOnOpen = false,
  accessibilityTitle,
  accessibilityDescription,
}: AppModalProps) => (
  <Dialog
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onClose();
      }
    }}
  >
    <DialogContent
      showCloseButton={showCloseButton}
      preset={preset}
      overlayClassName={overlayClassName}
      accessibilityTitle={accessibilityTitle}
      accessibilityDescription={accessibilityDescription}
      className={cn('app-modal-surface', blurMask && 'blur-mask', className)}
      style={style}
      onInteractOutside={(event) => {
        if (!closeOnInteractOutside) {
          event.preventDefault();
        }
      }}
      onEscapeKeyDown={(event) => {
        if (!closeOnEscapeKeyDown) {
          event.preventDefault();
        }
      }}
      onOpenAutoFocus={(event) => {
        if (!focusSurfaceOnOpen) return;
        event.preventDefault();
        (event.currentTarget as HTMLElement | null)?.focus();
      }}
    >
      {children}
    </DialogContent>
  </Dialog>
);
