// SPDX-License-Identifier: GPL-3.0-only

import { minimalSetup } from "codemirror";
import {
  HighlightStyle,
  StreamLanguage,
  indentUnit,
  syntaxHighlighting,
  type StringStream,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

type CustomIndicatorCodeEditorMode = "light" | "dark";

type CustomIndicatorDslState = {
  blockComment: boolean;
  stringEscaped: boolean;
  stringQuote: "'" | '"' | null;
};

const LOGICAL_KEYWORDS = new Set(["AND", "OR", "NOT"]);

const RUNTIME_FIELD_NAMES = new Set([
  "OPEN",
  "O",
  "HIGH",
  "H",
  "LOW",
  "L",
  "CLOSE",
  "C",
  "VOL",
  "V",
  "VOLA",
  "AMOUNT",
  "TOTALVOL",
  "TOTALAMOUNT",
  "PERIOD",
  "DATE",
  "TIME",
  "TIME2",
  "YEAR",
  "MONTH",
  "DAY",
  "HOUR",
  "MINUTE",
  "SECOND",
  "WEEKDAY",
  "WEEKOFYEAR",
  "FROMOPEN",
  "TOTALFZNUM",
  "CURRBARSCOUNT",
  "TOTALBARSCOUNT",
  "ISLASTBAR",
]);

const RUNTIME_LITERAL_NAMES = new Set(["TRUE", "FALSE", "NULL", "DRAWNULL"]);

const CALLABLE_FUNCTION_NAMES = new Set([
  "ABS",
  "ACOS",
  "ALIGNRIGHT",
  "AMA",
  "AND",
  "ASIN",
  "ATAN",
  "AVEDEV",
  "BACKSET",
  "BARSCOUNT",
  "BARSLAST",
  "BARSLASTCOUNT",
  "BARSNEXT",
  "BARSSINCE",
  "BARSSINCEN",
  "BARSTATUS",
  "BETA",
  "BETWEEN",
  "BOLL_LOWER",
  "BOLL_MID",
  "BOLL_UPPER",
  "CEILING",
  "CONST",
  "CORR",
  "COS",
  "COUNT",
  "COVAR",
  "CROSS",
  "CROSSDOWN",
  "CROSSUP",
  "DATETODAY",
  "DAYTODATE",
  "DEVSQ",
  "DIFF",
  "DMA",
  "DOWNNDAY",
  "DRAWBAND",
  "DRAWICON",
  "DRAWKLINE",
  "DRAWLINE",
  "DRAWNUMBER",
  "DRAWSL",
  "DRAWTEXT",
  "EMA",
  "EVERY",
  "EXIST",
  "EXP",
  "EXPMA",
  "EXPMEMA",
  "FILLRGN",
  "FILTER",
  "FINDHIGH",
  "FINDHIGHBARS",
  "FINDLOW",
  "FINDLOWBARS",
  "FLOOR",
  "FORCAST",
  "FORECAST",
  "FRACPART",
  "HHV",
  "HHVBARS",
  "HOD",
  "IF",
  "IFF",
  "INPUT",
  "INT",
  "INTPART",
  "KAMA",
  "LAST",
  "LLV",
  "LLVBARS",
  "LN",
  "LOD",
  "LOG",
  "LOG10",
  "LOG2",
  "LONGCROSS",
  "LOWRANGE",
  "MA",
  "MAX",
  "MEMA",
  "MIN",
  "MOD",
  "MULAR",
  "NDAY",
  "NOT",
  "OR",
  "PEAK",
  "PEAKBARS",
  "POW",
  "RAND",
  "RANGE",
  "REF",
  "REFDATE",
  "REFV",
  "REFX",
  "REFXV",
  "RELATE",
  "REVERSE",
  "ROUND",
  "ROUND2",
  "RSI",
  "SAR",
  "SARTURN",
  "SECTOTIME",
  "SGN",
  "SIGN",
  "SIN",
  "SLOPE",
  "SMA",
  "SMMA",
  "SQRT",
  "STD",
  "STDP",
  "STICKLINE",
  "SUM",
  "SUMBARS",
  "TAN",
  "TFILTER",
  "TIMETOSEC",
  "TMA",
  "TOPRANGE",
  "TR",
  "TROUGH",
  "TROUGHBARS",
  "UPNDAY",
  "VALUEWHEN",
  "VAR",
  "VARP",
  "VOLAT",
  "WMA",
  "XMA",
  "ZIG",
  "ZIGA",
  "ZIGZAG",
]);

const PLOT_DIRECTIVE_PATTERN =
  /^(?:COLOR(?:[A-Z]+|[0-9A-F]{6})|LINETHICK\d+|DOTLINE|STICK|NODRAW|DRAWNULL)$/u;

const isIdentifierStart = (char: string): boolean => /[\p{L}_]/u.test(char);
const isIdentifierPart = (char: string): boolean => /[\p{L}\p{N}_]/u.test(char);

const hasFunctionCallLookahead = (lineRemainder: string): boolean =>
  lineRemainder.trimStart().startsWith("(");

const readBlockComment = (
  stream: StringStream,
  state: CustomIndicatorDslState,
): string => {
  if (!state.blockComment) {
    stream.next();
  }
  const hasCommentEnd = stream.skipTo("}");
  if (hasCommentEnd) {
    stream.next();
    state.blockComment = false;
    return "comment";
  }
  stream.skipToEnd();
  state.blockComment = true;
  return "comment";
};

const readString = (
  stream: StringStream,
  state: CustomIndicatorDslState,
): string => {
  if (!state.stringQuote) {
    const quote = stream.next();
    state.stringQuote = quote === '"' ? '"' : "'";
    state.stringEscaped = false;
  }

  while (!stream.eol()) {
    const char = stream.next();
    if (state.stringEscaped) {
      state.stringEscaped = false;
      continue;
    }
    if (char === "\\") {
      state.stringEscaped = true;
      continue;
    }
    if (char === state.stringQuote) {
      state.stringQuote = null;
      state.stringEscaped = false;
      break;
    }
  }

  return "string";
};

const customIndicatorDslLanguage = StreamLanguage.define<CustomIndicatorDslState>(
  {
    name: "zinuto-custom-indicator",
    startState: () => ({
      blockComment: false,
      stringEscaped: false,
      stringQuote: null,
    }),
    copyState: (state) => ({ ...state }),
    languageData: {
      commentTokens: {
        block: {
          open: "{",
          close: "}",
        },
      },
    },
    token: (stream, state) => {
      if (state.blockComment) {
        return readBlockComment(stream, state);
      }
      if (state.stringQuote) {
        return readString(stream, state);
      }
      if (stream.eatSpace()) {
        return null;
      }

      const current = stream.peek();
      if (!current) {
        return null;
      }
      if (current === "{") {
        return readBlockComment(stream, state);
      }
      if (current === "'" || current === '"') {
        return readString(stream, state);
      }
      if (stream.match(/^(?:\d+(?:\.\d*)?|\.\d+)/u)) {
        return "number";
      }
      if (stream.match(/^(?::=|>=|<=|<>|[+\-*/%^=<>:])/u)) {
        return "operator";
      }
      if (stream.match(/^[(),;]/u)) {
        return "punctuation";
      }

      if (isIdentifierStart(current)) {
        stream.next();
        while (!stream.eol()) {
          const next = stream.peek();
          if (!next || !isIdentifierPart(next)) {
            break;
          }
          stream.next();
        }

        const identifier = stream.current();
        const normalized = identifier.toUpperCase();
        if (LOGICAL_KEYWORDS.has(normalized)) {
          return "keyword";
        }
        if (RUNTIME_LITERAL_NAMES.has(normalized)) {
          return "bool";
        }
        if (RUNTIME_FIELD_NAMES.has(normalized)) {
          return "propertyName";
        }
        if (
          CALLABLE_FUNCTION_NAMES.has(normalized) &&
          hasFunctionCallLookahead(stream.string.slice(stream.pos))
        ) {
          return "variableName.function";
        }
        if (PLOT_DIRECTIVE_PATTERN.test(normalized)) {
          return "atom";
        }
        return "variableName";
      }

      stream.next();
      return "invalid";
    },
  },
);

const customIndicatorCodeHighlightStyle = HighlightStyle.define([
  {
    tag: tags.keyword,
    color: "color-mix(in srgb, var(--primary) 84%, var(--text-t1))",
    fontWeight: "680",
  },
  {
    tag: tags.number,
    color: "color-mix(in srgb, var(--text-t1) 82%, var(--primary))",
  },
  {
    tag: [tags.string, tags.atom, tags.bool],
    color: "color-mix(in srgb, var(--success) 42%, var(--text-t1))",
  },
  {
    tag: tags.propertyName,
    color: "color-mix(in srgb, var(--primary) 58%, var(--text-t1))",
    fontWeight: "620",
  },
  {
    tag: tags.function(tags.variableName),
    color: "color-mix(in srgb, var(--warning) 62%, var(--text-t1))",
  },
  {
    tag: tags.variableName,
    color: "var(--text-t1)",
  },
  {
    tag: tags.operator,
    color: "color-mix(in srgb, var(--muted) 52%, var(--text-t1))",
  },
  {
    tag: tags.punctuation,
    color: "color-mix(in srgb, var(--muted) 78%, var(--text-t2))",
  },
  {
    tag: tags.comment,
    color: "color-mix(in srgb, var(--muted) 84%, var(--text-t3))",
    fontStyle: "italic",
  },
  {
    tag: tags.invalid,
    color: "color-mix(in srgb, var(--danger) 86%, var(--text-t1))",
    textDecoration: "underline",
  },
]);

export const customIndicatorCodeEditorSetup: Extension = [
  minimalSetup,
  lineNumbers(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  customIndicatorDslLanguage,
  indentUnit.of("  "),
  syntaxHighlighting(customIndicatorCodeHighlightStyle),
];

export const buildCustomIndicatorCodeEditorThemeExtension = (
  resolvedMode: CustomIndicatorCodeEditorMode,
): Extension =>
  EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--ui-field-bg)",
        blockSize: "100%",
        color: "var(--text-t1)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        inlineSize: "100%",
        minBlockSize: "0",
        minHeight: "0",
        minInlineSize: "0",
        minWidth: "0",
        overflow: "hidden",
        width: "100%",
      },
      "&.cm-focused": {
        outline: "none",
      },
      "&.cm-focused .cm-scroller": {
        boxShadow:
          "inset 0 0 0 1px color-mix(in srgb, var(--primary) 42%, var(--ui-field-border))",
      },
      ".cm-scroller": {
        alignItems: "flex-start",
        blockSize: "100%",
        caretColor: "var(--primary)",
        color: "var(--text-t1)",
        display: "flex",
        fontFamily: "var(--ff-mono)",
        fontSize: "var(--ty-r2)",
        height: "100%",
        lineHeight: "1.58",
        minBlockSize: "0",
        minHeight: "0",
        overflow: "auto",
        position: "relative",
      },
      ".cm-content": {
        boxSizing: "border-box",
        display: "block",
        flex: "1 0 auto",
        minBlockSize: "100%",
        minHeight: "100%",
        padding: "12px 0 16px",
        whiteSpace: "pre",
        wordWrap: "normal",
      },
      ".cm-line": {
        padding: "0 20px 0 14px",
      },
      ".cm-gutters": {
        backgroundColor: "var(--ui-surface-bg)",
        borderRight: "1px solid var(--ui-surface-border-soft)",
        color: "color-mix(in srgb, var(--muted) 82%, var(--text-t3))",
        fontFamily: "var(--ff-mono)",
        fontSize: "var(--ty-r2)",
        lineHeight: "1.58",
        minBlockSize: "100%",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        fontVariantNumeric: "tabular-nums",
        minWidth: "42px",
        padding: "0 12px 0 10px",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)",
        color: "var(--text-t1)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "color-mix(in srgb, var(--primary) 24%, transparent)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--primary)",
      },
      ".cm-matchingBracket": {
        backgroundColor: "color-mix(in srgb, var(--primary) 18%, transparent)",
        color: "var(--text-t1)",
      },
      ".cm-nonmatchingBracket": {
        backgroundColor: "color-mix(in srgb, var(--danger) 18%, transparent)",
        color: "color-mix(in srgb, var(--danger) 82%, var(--text-t1))",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--panel)",
        border: "1px solid var(--ui-surface-border-soft)",
        color: "var(--text-t1)",
      },
    },
    { dark: resolvedMode === "dark" },
  );
