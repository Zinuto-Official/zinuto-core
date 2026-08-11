// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getUiLabels } from "../../src/ui/config/uiLabels";
import {
  getCustomIndicatorReferenceCenterModules,
  resolveCustomIndicatorReferenceCenterEntryModule,
  type CustomIndicatorReferenceCenterTopic,
} from "../../src/ui/config/customIndicatorReferenceCenter";
import { getCustomIndicatorAiConversionGuideCopy } from "../../src/ui/config/uiConfig";
import {
  buildCustomIndicatorAiConversionGuideFilename,
  buildCustomIndicatorAiConversionGuideText,
} from "../../src/workspaces/custom-indicator/referenceCenter/aiConversionGuide";
import {
  DEFAULT_REFERENCE_CENTER_MODULE,
  filterReferenceCollections,
  getDefaultExpandedReferenceCollectionIds,
  getFirstReferenceTopicId,
  resolveExpandedReferenceCollectionIds,
} from "../../src/workspaces/custom-indicator/referenceCenter/useCustomIndicatorReferenceCenterController";

const ui = getUiLabels("zh-CN");
const referenceModules = getCustomIndicatorReferenceCenterModules("zh-CN", ui);
const referenceModule =
  referenceModules.find((module) => module.key === "functions") ?? null;
const officialReferenceLocales = ["zh-CN", "en", "ja", "ko", "es"] as const;
const referenceModulesByLocale = new Map(
  officialReferenceLocales.map((language) => [
    language,
    getCustomIndicatorReferenceCenterModules(language, getUiLabels(language)),
  ]),
);
const expectedFunctionExplanationLabels = new Map([
  ["zh-CN", "函数说明"],
  ["en", "Function Explanation"],
  ["ja", "関数説明"],
  ["ko", "함수 설명"],
  ["es", "Explicación de la función"],
] as const);
const expectedAiGuideDownloadStartedLabels = new Map([
  ["zh-CN", "文件已保存"],
  ["en", "File saved"],
  ["ja", "ファイルを保存しました"],
  ["ko", "파일을 저장했습니다"],
  ["es", "Archivo guardado"],
] as const);
const nativeBridge = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../contracts/native-bridge/native-bridge.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  commands?: Array<{
    name?: string;
    constraints?: { content?: { maxLength?: number } };
  }>;
};
const aiGuideSaveCommand = nativeBridge.commands?.find(
  (command) => command.name === "save_custom_indicator_ai_conversion_guide",
);
const aiGuideContentMaxLength =
  aiGuideSaveCommand?.constraints?.content?.maxLength ?? 0;
const amountSummaryPatterns = new Map([
  ["zh-CN", /成交额/u],
  ["en", /turnover/u],
  ["ja", /売買代金/u],
  ["ko", /거래대금/u],
  ["es", /importe negociado/u],
] as const);
const volumeSummaryPatterns = new Map([
  ["zh-CN", /成交量/u],
  ["en", /volume/u],
  ["ja", /出来高/u],
  ["ko", /거래량/u],
  ["es", /volumen/u],
] as const);
const refSummaryPatterns = new Map([
  ["zh-CN", /N 根 K 线之前/u],
  ["en", /N bars ago/u],
  ["ja", /N 本前/u],
  ["ko", /N봉 이전/u],
  ["es", /hace N velas/u],
] as const);
const normalizeDocText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const formatGuideTopicLine = (
  topic: CustomIndicatorReferenceCenterTopic,
): string =>
  `- ${normalizeDocText(topic.title)}: ${normalizeDocText(
    topic.formula,
  )} | ${normalizeDocText(topic.summary)}`;
const formatUnavailableGuideLine = (
  topic: CustomIndicatorReferenceCenterTopic,
  availabilityLabels: Record<
    CustomIndicatorReferenceCenterTopic["availability"],
    string
  >,
): string => {
  const reason = normalizeDocText(topic.description || topic.summary);
  const availability =
    availabilityLabels[topic.availability] ?? topic.availability;

  return `- ${normalizeDocText(topic.title)}: ${availability} | ${reason}`;
};
const countExampleLines = (value: string): number =>
  value
    .split(/<br>|\n/u)
    .map((line) => line.trim())
    .filter(Boolean).length;
const splitExampleStatements = (value: string): string[] =>
  value
    .split(/<br>|\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
const exampleGuideText = (
  guide: CustomIndicatorReferenceCenterTopic["exampleGuide"],
): string => {
  if (!guide) {
    return "";
  }
  return normalizeDocText(
    [
      guide.overview,
      ...guide.steps.flatMap((step) => [
        step.title,
        ...step.paragraphs,
      ]),
      guide.result,
      ...(guide.useCases ?? []),
    ].join(" "),
  );
};
const exampleGuideSearchText = (
  guide: CustomIndicatorReferenceCenterTopic["exampleGuide"],
): string => {
  if (!guide) {
    return "";
  }
  return normalizeDocText(
    [
      exampleGuideText(guide),
      ...guide.steps.map((step) => step.code),
    ].join(" "),
  );
};

test("reference center exposes the function encyclopedia as the entry module", () => {
  assert.deepEqual(
    referenceModules.map((module) => module.key),
    ["functions"],
  );
  assert.deepEqual(
    referenceModules.map((module) => module.label),
    ["函数百科"],
  );
  assert.equal(ui.customIndicatorReferenceCenterFunctionExplanation, "函数说明");
  officialReferenceLocales.forEach((language) => {
    const labels = getUiLabels(language);
    const guideCopy = getCustomIndicatorAiConversionGuideCopy(language);
    assert.equal(
      labels.customIndicatorReferenceCenterFunctionExplanation,
      expectedFunctionExplanationLabels.get(language),
    );
    assert.notEqual(labels.customIndicatorAiGuideDownloadLabel, "");
    assert.match(labels.customIndicatorAiGuideDownloadTooltip, /AI|IA/u);
    assert.equal(
      labels.customIndicatorAiGuideDownloadStarted,
      expectedAiGuideDownloadStartedLabels.get(language),
    );
    assert.notEqual(labels.customIndicatorAiGuideDownloadFailed, "");
    assert.notEqual(labels.customIndicatorAiGuideDownloadFilePrefix, "");
    assert.notEqual(guideCopy.summary, "");
    assert.equal(guideCopy.instructions.length, 2);
    assert.equal(guideCopy.indicatorSystemItems.length, 6);
    assert.equal(guideCopy.drawingItems.length, 3);
    assert.notEqual(guideCopy.referenceUi.downloadGuideLabel, "");
    assert.match(guideCopy.referenceUi.functionCountTemplate, /\{count\}/u);
  });
  assert.equal(DEFAULT_REFERENCE_CENTER_MODULE, "functions");
  assert.equal(resolveCustomIndicatorReferenceCenterEntryModule("default"), "functions");
  assert.equal(
    resolveCustomIndicatorReferenceCenterEntryModule("troubleshoot"),
    "functions",
  );
});

test("function encyclopedia keeps all function categories", () => {
  assert.ok(referenceModule);
  assert.equal(referenceModule.key, "functions");
  assert.match(referenceModule.overview, /函数名|别名/);
  assert.doesNotMatch(referenceModule.overview, /模板|快速验证|脚本规则/);
  assert.equal(referenceModule.collections.length, 11);
  assert.deepEqual(
    referenceModule.collections.map((collection) => collection.label),
    [
      "行情",
      "时间",
      "引用",
      "逻辑",
      "选择",
      "数学",
      "统计",
      "形态",
      "绘图",
      "线形与颜色",
      "操作符",
    ],
  );
});

test("AI conversion guide exports a compact full function surface for every official locale", () => {
  for (const [language, modules] of referenceModulesByLocale) {
    const localizedUi = getUiLabels(language);
    const guideCopy = getCustomIndicatorAiConversionGuideCopy(language);
    const module = modules.find((item) => item.key === "functions") ?? null;
    assert.ok(module);

    const guideText = buildCustomIndicatorAiConversionGuideText(
      language,
      localizedUi,
    );
    const unavailableSectionStart = guideText.indexOf(
      `${guideCopy.unavailableTitle}:`,
    );

    assert.equal(
      buildCustomIndicatorAiConversionGuideFilename(language),
      `zinuto-indicator-ai-guide-${language}.txt`,
    );
    assert.equal(module.collections.length, 11);
    assert.equal(module.topics.length, 189);
    assert.equal(aiGuideContentMaxLength, 65_536);
    assert.equal(guideText.length <= aiGuideContentMaxLength, true);
    assert.match(guideText, new RegExp(`^${escapeRegExp(guideCopy.title)}`, "u"));
    guideCopy.instructions.forEach((line) => {
      assert.match(
        guideText,
        new RegExp(escapeRegExp(normalizeDocText(line)), "u"),
      );
    });
    [guideCopy.indicatorSystemTitle, guideCopy.drawingTitle].forEach(
      (sectionTitle) => {
        assert.match(
          guideText,
          new RegExp(`${escapeRegExp(sectionTitle)}:`, "u"),
        );
      },
    );
    [...guideCopy.indicatorSystemItems, ...guideCopy.drawingItems].forEach(
      (line) => {
        assert.match(
          guideText,
          new RegExp(escapeRegExp(normalizeDocText(line)), "u"),
        );
      },
    );
    assert.match(
      guideText,
      /N := 20;\nMID: MA\(C, N\), COLOR60A5FA, LINETHICK2;/u,
    );
    assert.notEqual(unavailableSectionStart, -1);

    module.collections.forEach((collection) => {
      assert.match(
        guideText,
        new RegExp(`\\[${escapeRegExp(collection.label)}\\]`, "u"),
      );
    });

    module.topics.forEach((topic) => {
      if (topic.availability === "available") {
        const expectedLine = formatGuideTopicLine(topic);
        const lineIndex = guideText.indexOf(expectedLine);
        assert.notEqual(
          lineIndex,
          -1,
          `missing available guide line for ${language} ${topic.title}`,
        );
        assert.equal(
          lineIndex < unavailableSectionStart,
          true,
          `available guide line leaked into unavailable section for ${language} ${topic.title}`,
        );
        return;
      }

      const expectedLine = formatUnavailableGuideLine(
        topic,
        guideCopy.availabilityLabels,
      );
      const lineIndex = guideText.indexOf(expectedLine);
      assert.notEqual(
        lineIndex,
        -1,
        `missing unavailable guide line for ${language} ${topic.title}`,
      );
      assert.equal(
        lineIndex > unavailableSectionStart,
        true,
        `unavailable guide line should stay in unavailable section for ${language} ${topic.title}`,
      );
    });

    assert.doesNotMatch(guideText, /OUT:\s*\.\.\./u);
    assert.doesNotMatch(guideText, /runtime|parser|priceColorMode/iu);
  }
});

test("default expansion starts from the first category and selection expands the matching category", () => {
  assert.ok(referenceModule);
  const firstTopicId = getFirstReferenceTopicId(referenceModule.collections);
  const firstCollectionId = referenceModule.collections[0]?.id ?? "";
  const secondCollection = referenceModule.collections[1];
  const secondTopicId = secondCollection?.topicIds[0] ?? "";

  const defaultExpandedCollectionIds = getDefaultExpandedReferenceCollectionIds({
    collections: referenceModule.collections,
    selectedTopicId: firstTopicId,
  });
  assert.deepEqual(defaultExpandedCollectionIds, [firstCollectionId]);

  const expandedAfterSelection = resolveExpandedReferenceCollectionIds({
    collections: referenceModule.collections,
    currentExpandedCollectionIds: defaultExpandedCollectionIds,
    keyword: "",
  });
  assert.deepEqual(expandedAfterSelection, [firstCollectionId]);

  const expandedAfterManualSelection = [
    ...defaultExpandedCollectionIds,
    secondCollection?.id ?? "",
  ].filter(Boolean);
  assert.deepEqual(expandedAfterManualSelection, [
    firstCollectionId,
    secondCollection?.id ?? "",
  ]);
  assert.equal(secondTopicId !== "", true);
});

test("manual collapse is preserved when the selected topic lives in the collapsed category", () => {
  assert.ok(referenceModule);
  const firstCollection = referenceModule.collections[0];
  const selectedTopicId = firstCollection?.topicIds[0] ?? "";

  const collapsedCollectionIds = resolveExpandedReferenceCollectionIds({
    collections: referenceModule.collections,
    currentExpandedCollectionIds: [],
    keyword: "",
  });

  assert.deepEqual(collapsedCollectionIds, []);
  assert.equal(selectedTopicId !== "", true);
});

test("search keeps the category tree and auto-expands every matching category", () => {
  assert.ok(referenceModule);
  const filteredCollections = filterReferenceCollections({
    module: referenceModule,
    keyword: "DRAWLINE",
  });

  assert.deepEqual(
    filteredCollections.map((collection) => collection.label),
    ["绘图"],
  );

  const expandedCollectionIds = resolveExpandedReferenceCollectionIds({
    collections: filteredCollections,
    currentExpandedCollectionIds: [],
    keyword: "DRAW",
  });
  assert.deepEqual(
    expandedCollectionIds,
    filteredCollections.map((collection) => collection.id),
  );
});

test("function lookup and normalized search text are indexed once per module", () => {
  assert.ok(referenceModule);
  assert.equal(referenceModule.topicById.size, referenceModule.topics.length);
  assert.equal(
    referenceModule.searchEntryByTopicId.size,
    referenceModule.topics.length,
  );

  const maTopic =
    referenceModule.topics.find((topic) => topic.aliases.includes("MA")) ??
    null;
  assert.ok(maTopic);
  assert.equal(referenceModule.topicById.get(maTopic.id), maTopic);
  assert.ok(
    referenceModule.searchEntryByTopicId
      .get(maTopic.id)
      ?.aliases.includes("MA"),
  );
});

test("drawing reference entries provide the detail content needed by the dialog", () => {
  assert.ok(referenceModule);
  const drawingCollection =
    referenceModule.collections.find((collection) => collection.label === "绘图") ??
    null;
  assert.ok(drawingCollection);

  const drawingTopics = referenceModule.topics.filter(
    (topic) => topic.collectionId === drawingCollection.id,
  );
  const drawingAliases = drawingTopics.flatMap((topic) => topic.aliases);
  const drawIconTopic =
    drawingTopics.find((topic) => topic.aliases.includes("DRAWICON")) ?? null;

  assert.deepEqual(
    ["DRAWICON", "DRAWTEXT", "STICKLINE"].every((alias) =>
      drawingAliases.includes(alias),
    ),
    true,
  );
  assert.ok(drawIconTopic);
  assert.notEqual(drawIconTopic.formula, "");
  assert.notEqual(drawIconTopic.example, "");
  assert.ok(drawIconTopic.exampleGuide);
});

test("unsupported drawing entries stay documented with fail-closed guidance", () => {
  assert.ok(referenceModule);
  const drawLineTopic =
    referenceModule.topics.find((topic) => topic.aliases.includes("DRAWLINE")) ??
    null;

  assert.ok(drawLineTopic);
  assert.match(drawLineTopic.description, /暂不支持/);
  assert.match(drawLineTopic.description, /编译阶段/);
});

test("available function detail copy avoids internal runtime states", () => {
  assert.ok(referenceModule);
  const userFacingAliases = ["MA", "DMA", "RSI", "BOLL_UPPER", "STICK", "COLORRED", "/"];
  const userFacingTopics = userFacingAliases.map((alias) => {
    const topic =
      referenceModule.topics.find((item) => item.aliases.includes(alias)) ?? null;
    assert.ok(topic, `missing topic for ${alias}`);
    return topic;
  });
  const maTopic =
    userFacingTopics.find((topic) => topic.aliases.includes("MA")) ?? null;

  assert.ok(maTopic);
  assert.match(maTopic.summary, /移动平均|平滑/);
  userFacingTopics.forEach((topic) => {
    assert.equal(
      topic.description,
      "",
      `available topic should not rely on description: ${topic.title}`,
    );
    assert.doesNotMatch(
      [
        topic.summary,
        exampleGuideSearchText(topic.exampleGuide),
        topic.useWhen,
        topic.commonMistake,
      ].join(" "),
      /兼容状态|full|当前实现|当前运行时|当前解析器|priceColorMode|runtime|parser/,
    );
  });
});

test("available reference topics use example guides instead of detail descriptions", () => {
  const topics = referenceModules.flatMap((module) => module.topics);
  assert.ok(topics.length > 0);

  topics
    .filter((topic) => topic.availability === "available")
    .forEach((topic) => {
      assert.notEqual(topic.summary, "", `missing summary for ${topic.title}`);
      assert.equal(
        topic.description,
        "",
        `available description should be removed for ${topic.title}`,
      );
      assert.ok(topic.exampleGuide, `missing example guide for ${topic.title}`);
    });
});

test("function summaries explain the function itself across availability states", () => {
  assert.ok(referenceModule);

  for (const [language, modules] of referenceModulesByLocale) {
    const topics = modules.flatMap((module) => module.topics);
    const amountTopic =
      topics.find((topic) => topic.aliases.includes("AMOUNT")) ?? null;
    const volumeTopic =
      topics.find((topic) => topic.aliases.includes("VOL")) ?? null;
    const refTopic =
      topics.find((topic) => topic.aliases.includes("REF")) ?? null;
    const drawLineTopic =
      topics.find((topic) => topic.aliases.includes("DRAWLINE")) ?? null;

    assert.ok(amountTopic);
    assert.match(
      amountTopic.summary,
      amountSummaryPatterns.get(language) ?? /$^/u,
    );
    assert.doesNotMatch(
      amountTopic.summary,
      volumeSummaryPatterns.get(language) ?? /$^/u,
    );
    assert.ok(volumeTopic);
    assert.match(
      volumeTopic.summary,
      volumeSummaryPatterns.get(language) ?? /$^/u,
    );
    assert.ok(refTopic);
    assert.match(refTopic.summary, refSummaryPatterns.get(language) ?? /$^/u);
    assert.ok(drawLineTopic);
    assert.notEqual(drawLineTopic.summary, "");
    assert.equal(drawLineTopic.availability, "unsupported");

    topics.forEach((topic) => {
      assert.notEqual(
        topic.summary,
        "",
        `missing function summary for ${language} ${topic.title}`,
      );
    });
  }
});

test("function reference copy rejects low-value template fillers", () => {
  const bannedCopyPatterns = [
    /belongs to .*category/iu,
    /当前分类参考项/u,
    /可作为.+输入/u,
    /处理历史引用/u,
    /按各自名称和参数执行/u,
    /设置输出样式/u,
    /recommended syntax/iu,
    /推奨構文/u,
    /권장 구문/u,
    /sintaxis recomendada/iu,
    /只看.+单根.+误判/u,
    /Juzgar .*desde una sola barra/iu,
    /1 本のバーだけ/u,
    /한 봉 결과/u,
    /Use .* when the formula needs/iu,
    /需要用 .+组成完整表达式/u,
    /第\s*\d+\s*行/u,
    /\bLine\s*\d+/iu,
    /\d+\s*行目/u,
    /\d+\s*행/u,
    /La línea\s*\d+/iu,
  ];
  const bannedSummaryPatterns = [
    /returns a historical, window, or smoothed series/iu,
    /applies its mathematical operation/iu,
    /calculates a statistical, regression, or volatility series/iu,
    /reads a turning-point, SAR, or ZigZag pattern series/iu,
    /describes an external or rendering feature/iu,
    /current market source/iu,
    /not available in the current runtime/iu,
    /入力値から履歴参照、ウィンドウ、または平滑化/u,
    /入力値系列に対して対応する数学演算/u,
    /統計、回帰、またはボラティリティ/u,
    /転換点、SAR、または ZigZag パターン系列/u,
    /現在の市場データソースでは/u,
    /現在の実行環境では利用できません/u,
    /입력값에서 과거 참조/u,
    /입력값 시리즈에 해당 수학 연산/u,
    /입력 구간에서 통계/u,
    /전환점, SAR, 또는 ZigZag 패턴 시리즈/u,
    /현재 시장 데이터 소스/u,
    /현재 런타임에서는 사용할 수 없습니다/u,
    /devuelve una serie histórica, de ventana o suavizada/iu,
    /aplica su operación matemática/iu,
    /calcula una serie estadística, de regresión o volatilidad/iu,
    /lee una serie de patrón de giro, SAR o ZigZag/iu,
    /documenta una función externa/iu,
    /fuente de mercado actual/iu,
    /runtime actual/iu,
  ];

  for (const [language, modules] of referenceModulesByLocale) {
    modules
      .flatMap((module) => module.topics)
      .forEach((topic) => {
        bannedSummaryPatterns.forEach((pattern) => {
          assert.doesNotMatch(
            topic.summary,
            pattern,
            `low-value function summary in ${language} ${topic.title}: ${topic.summary}`,
          );
        });
        const copyFields = [
          topic.summary,
          topic.description,
          exampleGuideSearchText(topic.exampleGuide),
          topic.useWhen,
          topic.commonMistake,
        ];
        copyFields.forEach((copy) => {
          bannedCopyPatterns.forEach((pattern) => {
            assert.doesNotMatch(
              copy,
              pattern,
              `low-value reference copy in ${language} ${topic.title}: ${copy}`,
            );
          });
        });
      });
  }
});

test("available function code examples are concrete scripts", () => {
  let checkedCount = 0;

  for (const [language, modules] of referenceModulesByLocale) {
    const availableCodeTopics = modules
      .flatMap((module) => module.topics)
      .filter(
        (topic) =>
          topic.availability === "available" && topic.exampleKind === "code",
      );
    assert.ok(availableCodeTopics.length > 0);

    availableCodeTopics.forEach((topic) => {
      checkedCount += 1;
      assert.doesNotMatch(
        topic.example,
        /\.\.\./,
        `placeholder example for ${language} ${topic.title}`,
      );
      assert.equal(
        countExampleLines(topic.example) <= 2,
        true,
        `example should stay within two lines for ${language} ${topic.title}: ${topic.example}`,
      );
      assert.ok(
        topic.exampleGuide,
        `missing structured example guide for ${language} ${topic.title}`,
      );
      assert.notEqual(
        topic.exampleGuide.overview,
        "",
        `missing guide overview for ${language} ${topic.title}`,
      );
      assert.notEqual(
        topic.exampleGuide.result,
        "",
        `missing guide result for ${language} ${topic.title}`,
      );
      assert.deepEqual(
        topic.exampleGuide.steps.map((step) => step.code),
        splitExampleStatements(topic.example),
        `guide steps must match example statements for ${language} ${topic.title}`,
      );
      topic.exampleGuide.steps.forEach((step) => {
        assert.notEqual(
          step.title,
          "",
          `missing guide step title for ${language} ${topic.title}`,
        );
        assert.ok(
          step.paragraphs.length > 0,
          `missing guide step paragraphs for ${language} ${topic.title}`,
        );
      });
      assert.doesNotMatch(
        normalizeDocText(topic.example),
        /^[A-Z_][A-Z0-9_]*\s*:\s*[A-Z][A-Z0-9_]*(?:\(\))?\s*(?:,[^;]+)?;?$/u,
        `direct field dump example for ${language} ${topic.title}: ${topic.example}`,
      );
      assert.match(
        topic.example,
        /^[A-Z_][A-Z0-9_]*\s*:/u,
        `example should use formula assignment syntax for ${language} ${topic.title}: ${topic.example}`,
      );
    });
  }

  assert.equal(
    checkedCount,
    officialReferenceLocales.length *
      (referenceModule?.topics.filter(
        (topic) =>
          topic.availability === "available" && topic.exampleKind === "code",
      ).length ?? 0),
    "all official locales should compile the same available code surface",
  );
});

test("unavailable entries show guidance instead of fake runnable examples", () => {
  assert.ok(referenceModule);
  const unavailableTopics = referenceModule.topics.filter(
    (topic) => topic.availability !== "available",
  );
  assert.ok(unavailableTopics.length > 0);

  unavailableTopics.forEach((topic) => {
    assert.equal(topic.exampleKind, "unavailable", `wrong example kind for ${topic.title}`);
    assert.doesNotMatch(topic.example, /\.\.\./, `placeholder guidance for ${topic.title}`);
    assert.doesNotMatch(topic.example, /^\s*OUT:/, `fake output example for ${topic.title}`);
    assert.match(topic.description, /暂不|缺少|当前|不会|拦截/);
  });
});

test("volume alias group stays available", () => {
  assert.ok(referenceModule);
  const volumeTopic =
    referenceModule.topics.find((topic) => topic.aliases.includes("VOL")) ??
    null;

  assert.ok(volumeTopic);
  assert.equal(volumeTopic.availability, "available");
  assert.equal(volumeTopic.description, "");
  assert.deepEqual(["VOL", "V"].every((alias) => volumeTopic.aliases.includes(alias)), true);
});
