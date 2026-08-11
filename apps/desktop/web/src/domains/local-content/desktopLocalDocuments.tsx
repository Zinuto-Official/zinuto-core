// SPDX-License-Identifier: GPL-3.0-only

import { type ReactNode } from "react";
import {
  formatMessage,
  type SupportedLocale,
} from "@zinuto/shared/i18n";
import {
  desktopLocalDocumentLocales,
  desktopLocalDocumentUiText,
  desktopLocalReleaseManifest,
  resolveDesktopReleasePublicationState,
  type DesktopLocalDocumentLocale,
} from "@zinuto/shared/desktopLocalDocuments";

export type DesktopLocalDocumentId =
  | "privacy"
  | "terms"
  | "releaseNotes";

export type DesktopLocalReleaseManifest = {
  version: string | null;
  publishedAt: string;
  releaseHighlights: Record<string, string[]>;
};

type DocumentLanguage = DesktopLocalDocumentLocale;
const DOCUMENT_LANGUAGES: readonly DocumentLanguage[] =
  desktopLocalDocumentLocales;

type MarkdownBlock =
  | {
      type: "heading";
      depth: number;
      text: string;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "list";
      ordered: boolean;
      items: string[];
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    }
  | {
      type: "rule";
    };

type DesktopLocalDocumentDescriptor = {
  title: string;
  description?: string;
  body: ReactNode;
};

const trimText = (value: unknown): string => String(value ?? "").trim();

const resolveDocumentLanguage = (language: SupportedLocale): DocumentLanguage =>
  language === "en-XA" ? "en" : language;

const safeReleaseHighlights = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([locale, entries]) => [
      locale,
      Array.isArray(entries)
        ? entries
            .map((entry) => trimText(entry))
            .filter((entry) => entry.length > 0)
        : [],
    ]),
  );
};

const normalizeReleaseManifest = (
  value: unknown,
): DesktopLocalReleaseManifest => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    version: trimText(record.version) || null,
    publishedAt: trimText(record.publishedAt),
    releaseHighlights: safeReleaseHighlights(record.releaseHighlights),
  };
};

export const DESKTOP_LOCAL_RELEASE_MANIFEST = normalizeReleaseManifest(
  desktopLocalReleaseManifest,
);

const splitTableRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => trimText(cell));

const isTableSeparatorRow = (line: string): boolean =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/u.test(line);

const isTableCandidateRow = (line: string): boolean =>
  line.includes("|") && splitTableRow(line).length > 1;

const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  const flushParagraph = (startIndex: number): number => {
    const paragraphLines: string[] = [];
    let cursor = startIndex;
    while (cursor < lines.length) {
      const currentLine = lines[cursor];
      const trimmed = trimText(currentLine);
      if (
        !trimmed ||
        /^#{1,6}\s+/u.test(trimmed) ||
        /^-\s+/u.test(trimmed) ||
        /^\d+\.\s+/u.test(trimmed) ||
        (isTableCandidateRow(trimmed) &&
          cursor + 1 < lines.length &&
          isTableSeparatorRow(lines[cursor + 1] || ""))
      ) {
        break;
      }
      paragraphLines.push(trimmed);
      cursor += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join(" "),
      });
    }
    return cursor;
  };

  while (index < lines.length) {
    const currentLine = lines[index] || "";
    const trimmed = trimText(currentLine);
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/u.test(trimmed)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/u);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        depth: headingMatch[1].length,
        text: trimText(headingMatch[2]),
      });
      index += 1;
      continue;
    }

    if (
      isTableCandidateRow(trimmed) &&
      index + 1 < lines.length &&
      isTableSeparatorRow(lines[index + 1] || "")
    ) {
      const headers = splitTableRow(trimmed);
      const rows: string[][] = [];
      let cursor = index + 2;
      while (cursor < lines.length) {
        const rowLine = trimText(lines[cursor] || "");
        if (!rowLine || !isTableCandidateRow(rowLine)) {
          break;
        }
        rows.push(splitTableRow(rowLine));
        cursor += 1;
      }
      blocks.push({
        type: "table",
        headers,
        rows,
      });
      index = cursor;
      continue;
    }

    if (/^-\s+/u.test(trimmed)) {
      const items: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const listLine = trimText(lines[cursor] || "");
        const match = listLine.match(/^-\s+(.*)$/u);
        if (!match) {
          break;
        }
        items.push(trimText(match[1]));
        cursor += 1;
      }
      blocks.push({
        type: "list",
        ordered: false,
        items,
      });
      index = cursor;
      continue;
    }

    if (/^\d+\.\s+/u.test(trimmed)) {
      const items: string[] = [];
      let cursor = index;
      while (cursor < lines.length) {
        const listLine = trimText(lines[cursor] || "");
        const match = listLine.match(/^\d+\.\s+(.*)$/u);
        if (!match) {
          break;
        }
        items.push(trimText(match[1]));
        cursor += 1;
      }
      blocks.push({
        type: "list",
        ordered: true,
        items,
      });
      index = cursor;
      continue;
    }

    index = flushParagraph(index);
  }

  return blocks;
};

const parseInlineMarkdown = (text: string): ReactNode[] => {
  const normalized = String(text || "");
  const tokenPattern =
    /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/gu;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = tokenPattern.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(normalized.slice(lastIndex, match.index));
    }
    if (match[2]) {
      nodes.push(
        <strong key={`strong-${match.index}`}>{match[2]}</strong>,
      );
    } else if (match[3] && match[4]) {
      const href = trimText(match[4]);
      if (/^(?:https?:|mailto:)/iu.test(href)) {
        nodes.push(
          <a
            key={`link-${match.index}`}
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {match[3]}
          </a>,
        );
      } else {
        nodes.push(match[3]);
      }
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    nodes.push(normalized.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [normalized];
};

const renderMarkdownBlocks = (blocks: MarkdownBlock[]): ReactNode =>
  blocks.map((block, index) => {
    if (block.type === "heading") {
      const Tag =
        block.depth === 1
          ? "h1"
          : block.depth === 2
            ? "h2"
            : "h3";
      return (
        <Tag
          key={`heading-${index}`}
          className="desktop-local-document-heading"
          data-depth={block.depth}
        >
          {parseInlineMarkdown(block.text)}
        </Tag>
      );
    }
    if (block.type === "paragraph") {
      return (
        <p key={`paragraph-${index}`} className="desktop-local-document-paragraph">
          {parseInlineMarkdown(block.text)}
        </p>
      );
    }
    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={`list-${index}`}
          className="desktop-local-document-list"
          data-ordered={block.ordered ? "true" : "false"}
        >
          {block.items.map((item, itemIndex) => (
            <li key={`list-item-${index}-${itemIndex}`}>
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ListTag>
      );
    }
    if (block.type === "rule") {
      return <hr key={`rule-${index}`} className="desktop-local-document-rule" />;
    }
    return (
      <div key={`table-${index}`} className="desktop-local-document-table-wrap">
        <table className="desktop-local-document-table">
          <thead>
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th key={`header-${index}-${headerIndex}`}>
                  {parseInlineMarkdown(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`row-${index}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`cell-${index}-${rowIndex}-${cellIndex}`}>
                    {parseInlineMarkdown(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  });

const extractPrimaryHeading = (blocks: MarkdownBlock[]): string | null =>
  blocks.find(
    (block): block is Extract<MarkdownBlock, { type: "heading" }> =>
      block.type === "heading" && block.depth === 1,
  )?.text ?? null;

const formatPublishedDate = (
  language: SupportedLocale,
  value: string,
): string | null => {
  const normalized = trimText(value);
  if (!normalized) {
    return null;
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    return normalized;
  }
  try {
    return new Intl.DateTimeFormat(resolveDocumentLanguage(language), {
      dateStyle: "medium",
    }).format(timestamp);
  } catch {
    return normalized;
  }
};

const resolveReleaseHighlights = (
  language: SupportedLocale,
): string[] => {
  const documentLanguage = resolveDocumentLanguage(language);
  const candidates = [
    documentLanguage,
    "en",
    ...DOCUMENT_LANGUAGES.filter(
      (candidate) => candidate !== documentLanguage && candidate !== "en",
    ),
  ];
  for (const candidate of candidates) {
    const entries = DESKTOP_LOCAL_RELEASE_MANIFEST.releaseHighlights[candidate] ?? [];
    if (entries.length > 0) {
      return entries.slice(0, 8);
    }
  }
  return [];
};

const renderReleaseNotes = ({
  language,
  currentVersion,
}: {
  language: SupportedLocale;
  currentVersion?: string | null;
}): ReactNode => {
  const copy =
    desktopLocalDocumentUiText[resolveDocumentLanguage(language)].releaseNotes;
  const highlights = resolveReleaseHighlights(language);
  const publishedAt = formatPublishedDate(
    language,
    DESKTOP_LOCAL_RELEASE_MANIFEST.publishedAt,
  );
  const currentVersionLabel = formatMessage(
    language,
    "appText.version",
  );
  const publicationState = resolveDesktopReleasePublicationState(
    DESKTOP_LOCAL_RELEASE_MANIFEST.publishedAt,
  );
  const publicationLabel = formatMessage(
    language,
    publicationState === "SCHEDULED"
      ? "appText.scheduled"
      : "appText.published",
  );
  return (
    <div className="desktop-local-document-stack">
      <div className="desktop-local-document-meta-grid">
        <div className="desktop-local-document-panel">
          <div className="desktop-local-document-kicker">{currentVersionLabel}</div>
          <div className="desktop-local-document-emphasis">
            {trimText(currentVersion) || "--"}
          </div>
        </div>
        <div className="desktop-local-document-panel">
          <div className="desktop-local-document-kicker">{copy.latestReleaseLabel}</div>
          <div className="desktop-local-document-emphasis">
            {DESKTOP_LOCAL_RELEASE_MANIFEST.version || "--"}
          </div>
        </div>
        <div className="desktop-local-document-panel">
          <div className="desktop-local-document-kicker">{publicationLabel}</div>
          <div className="desktop-local-document-emphasis">
            {publishedAt || "--"}
          </div>
        </div>
      </div>
      <section className="desktop-local-document-panel">
        <h2 className="desktop-local-document-panel-title">{copy.highlightsLabel}</h2>
        {highlights.length > 0 ? (
          <ul className="desktop-local-document-list">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="desktop-local-document-paragraph">
            {copy.emptyHighlightsLabel}
          </p>
        )}
      </section>
    </div>
  );
};

export const resolveDesktopLocalDocument = ({
  id,
  language,
  currentVersion,
  legalMarkdown,
}: {
  id: DesktopLocalDocumentId;
  language: SupportedLocale;
  currentVersion?: string | null;
  legalMarkdown?: string;
}): DesktopLocalDocumentDescriptor => {
  if (id === "releaseNotes") {
    return {
      title: formatMessage(language, "appText.releaseNotes"),
      description:
        DESKTOP_LOCAL_RELEASE_MANIFEST.version && DESKTOP_LOCAL_RELEASE_MANIFEST.publishedAt
          ? `${DESKTOP_LOCAL_RELEASE_MANIFEST.version} · ${
              formatPublishedDate(language, DESKTOP_LOCAL_RELEASE_MANIFEST.publishedAt) ||
              DESKTOP_LOCAL_RELEASE_MANIFEST.publishedAt
            }`
          : undefined,
      body: renderReleaseNotes({
        language,
        currentVersion,
      }),
    };
  }

  const blocks = parseMarkdownBlocks(legalMarkdown ?? "");
  const title =
    extractPrimaryHeading(blocks) ||
    (id === "privacy"
      ? formatMessage(language, "legal.privacyPolicy")
      : formatMessage(language, "legal.termsOfUse"));

  return {
    title,
    body: (
      <div className="desktop-local-document-markdown">
        {renderMarkdownBlocks(blocks)}
      </div>
    ),
  };
};
