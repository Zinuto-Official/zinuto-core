// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from "react";
import { api } from "@/api";
import { Button } from "@/ui/primitives/button";
import { AppModal } from "@/ui/components/AppModal";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { StandardModalFrame } from "@/ui/components";
import type { SupportedLocale } from "@zinuto/shared/i18n";
import "@/styles/components/desktop-local-documents.css";
import {
  resolveDesktopLocalDocument,
  type DesktopLocalDocumentId,
} from "@/domains/local-content/desktopLocalDocuments";

type DesktopLocalDocumentDialogProps = {
  currentVersion?: string | null;
  documentId: DesktopLocalDocumentId | null;
  language: SupportedLocale;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

type RemoteLegalDocumentId = Extract<DesktopLocalDocumentId, "privacy" | "terms">;

type RemoteLegalDocumentState =
  | {
      status: "idle" | "loading" | "error";
      documentId: RemoteLegalDocumentId | null;
      markdown: null;
    }
  | {
      status: "ready";
      documentId: RemoteLegalDocumentId;
      markdown: string;
    };

const isRemoteLegalDocumentId = (
  documentId: DesktopLocalDocumentId | null,
): documentId is RemoteLegalDocumentId =>
  documentId === "privacy" || documentId === "terms";

export const DesktopLocalDocumentDialog = ({
  currentVersion,
  documentId,
  language,
  onOpenChange,
  open,
}: DesktopLocalDocumentDialogProps) => {
  const [remoteLegalDocument, setRemoteLegalDocument] =
    useState<RemoteLegalDocumentState>({
      status: "idle",
      documentId: null,
      markdown: null,
    });
  const [remoteLegalRetryToken, setRemoteLegalRetryToken] = useState(0);
  const remoteDocumentId = isRemoteLegalDocumentId(documentId)
    ? documentId
    : null;

  useEffect(() => {
    if (!open || !remoteDocumentId) {
      setRemoteLegalDocument({
        status: "idle",
        documentId: null,
        markdown: null,
      });
      return;
    }

    const controller = new AbortController();
    setRemoteLegalDocument({
      status: "loading",
      documentId: remoteDocumentId,
      markdown: null,
    });

    api
      .getDesktopLegalDocument(remoteDocumentId, language, {
        signal: controller.signal,
      })
      .then((document) => {
        if (controller.signal.aborted) {
          return;
        }
        setRemoteLegalDocument({
          status: "ready",
          documentId: remoteDocumentId,
          markdown: document.markdown,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setRemoteLegalDocument({
          status: "error",
          documentId: remoteDocumentId,
          markdown: null,
        });
      });

    return () => {
      controller.abort();
    };
  }, [language, open, remoteDocumentId, remoteLegalRetryToken]);

  if (!documentId) {
    return null;
  }

  const remoteMarkdown =
    remoteDocumentId &&
    remoteLegalDocument.status === "ready" &&
    remoteLegalDocument.documentId === remoteDocumentId
      ? remoteLegalDocument.markdown
      : undefined;
  const remoteReady = Boolean(remoteMarkdown);
  const document = resolveDesktopLocalDocument({
    id: documentId,
    language,
    currentVersion,
    legalMarkdown: remoteMarkdown,
  });
  const remoteError =
    Boolean(remoteDocumentId) &&
    remoteLegalDocument.status === "error" &&
    remoteLegalDocument.documentId === remoteDocumentId;
  const remoteLoading = Boolean(remoteDocumentId) && !remoteReady && !remoteError;
  const documentBody = remoteLoading ? (
    <div
      className="desktop-local-document-state"
      role="status"
      aria-live="polite"
    >
      <p className="desktop-local-document-paragraph">
        {tt("appText.loading2")}
      </p>
    </div>
  ) : remoteError ? (
    <div className="desktop-local-document-state" role="alert">
      <p className="desktop-local-document-paragraph">{tt("appText.request")}</p>
    </div>
  ) : (
    document.body
  );

  return (
    <AppModal
      open={open}
      onClose={() => onOpenChange(false)}
      preset="workflow"
      accessibilityTitle={document.title}
      accessibilityDescription={document.description}
    >
      <StandardModalFrame
          title={document.title}
          description={document.description}
          variant="workflow"
          bodyClassName="desktop-local-document-body"
          actions={
            <div className="desktop-local-document-actions">
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                variant="outline"
              >
                {tt("appText.cancel")}
              </Button>
              {remoteError ? (
                <Button
                  type="button"
                  onClick={() =>
                    setRemoteLegalRetryToken((current) => current + 1)
                  }
                >
                  {tt("appText.retry")}
                </Button>
              ) : null}
            </div>
          }
        >
          <div
            className="desktop-local-document-scroll"
            data-autoshrink-ignore="true"
          >
            {documentBody}
          </div>
        </StandardModalFrame>
    </AppModal>
  );
};
