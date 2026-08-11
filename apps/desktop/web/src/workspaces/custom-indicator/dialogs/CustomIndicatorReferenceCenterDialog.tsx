// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { AppIcon, VendorIcon } from "@/assets/graphics/AppIcons";
import { AppModal } from "@/ui/components/AppModal";
import {
  PageSidebarLayout,
  StandardModalFrame,
} from "@/ui/components";
import type {
  CustomIndicatorReferenceCenterCollection,
  CustomIndicatorReferenceCenterModule,
  CustomIndicatorReferenceCenterTopic,
} from "@/ui/config/customIndicatorReferenceCenter";
import {
  getCustomIndicatorAiConversionGuideCopy,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import { writeCustomIndicatorReferenceTextToClipboard } from "@/workspaces/custom-indicator/referenceCenter/aiConversionGuide";
import { CustomIndicatorAiConversionGuidePanel } from "@/workspaces/custom-indicator/referenceCenter/CustomIndicatorAiConversionGuidePanel";

const COPY_FEEDBACK_MS = 2_000;

type CustomIndicatorReferenceCenterDialogProps = {
  presentation?: "dialog" | "window";
  language: AppUiLanguage;
  ui: UiLabelEntry;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  activeReferenceCenterDocModule: CustomIndicatorReferenceCenterModule | null;
  activeReferenceCenterRelatedTopics: readonly CustomIndicatorReferenceCenterTopic[];
  activeReferenceCenterTopic: CustomIndicatorReferenceCenterTopic | null;
  isReferenceSearchPending: boolean;
  expandedReferenceCollectionIds: readonly string[];
  filteredReferenceCollections: readonly CustomIndicatorReferenceCenterCollection[];
  selectedReferenceTopicId: string;
  referenceKeyword: string;
  referenceSelectionHint: string;
  rulesSearchInputRef: RefObject<HTMLInputElement | null>;
  onSetReferenceKeyword: (keyword: string) => void;
  onExpandAllReferenceCollections: () => void;
  onCollapseAllReferenceCollections: () => void;
  onToggleReferenceCollection: (collectionId: string) => void;
  onSelectReferenceTopic: (topicId: string) => void;
};

const TopicListRow = ({
  topic,
  isActive,
  onSelect,
}: {
  topic: CustomIndicatorReferenceCenterTopic;
  isActive: boolean;
  onSelect: (topicId: string) => void;
}) => {
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const primaryName = topic.aliases[0] ?? topic.title;
  const secondaryNames = topic.aliases
    .filter((alias) => alias !== primaryName)
    .slice(0, 3);
  const secondaryCopy = secondaryNames.join(" / ");

  useEffect(() => {
    if (isActive) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isActive]);

  return (
    <Button
      ref={rowRef}
      type="button"
      variant="inline"
      className={`custom-indicator-reference-topic-row ${
        isActive ? "is-active" : ""
      }`}
      onClick={() => onSelect(topic.id)}
      data-reference-topic-id={topic.id}
      aria-current={isActive ? "true" : undefined}
    >
      <span className="custom-indicator-reference-topic-row-copy">
        <span className="custom-indicator-reference-topic-row-head">
          <strong>{primaryName}</strong>
        </span>
        {secondaryCopy ? (
          <span className="custom-indicator-reference-topic-row-meta">
            {secondaryCopy}
          </span>
        ) : null}
        {topic.availability !== "available" ? (
          <span
            className="custom-indicator-reference-topic-row-status"
            aria-hidden="true"
          />
        ) : null}
      </span>
    </Button>
  );
};

const ReferenceCodePanel = ({
  label,
  tone,
  code,
  guide,
  prose = false,
  actionLabel,
  copied,
  onCopy,
}: {
  label: string;
  tone: "formula" | "example";
  code: string;
  guide?: CustomIndicatorReferenceCenterTopic["exampleGuide"];
  prose?: boolean;
  actionLabel: string;
  copied: boolean;
  onCopy: () => void;
}) => (
  <section className={`custom-indicator-reference-primary-panel is-${tone}`}>
    <div className="custom-indicator-reference-primary-panel-head">
      <span className="custom-indicator-reference-detail-label">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="custom-indicator-reference-copy-button"
        onClick={onCopy}
      >
        <VendorIcon
          name={copied ? "check" : "code2"}
          data-icon="inline-start"
          aria-hidden="true"
        />
        {actionLabel}
      </Button>
    </div>
    {prose ? (
      <p className="custom-indicator-reference-prose-example">{code}</p>
    ) : (
      <pre className={`custom-indicator-reference-code-block is-${tone}`}>
        <code>{code}</code>
      </pre>
    )}
    <ReferenceExampleGuide guide={guide ?? null} />
  </section>
);

const ReferenceExampleGuide = ({
  guide,
}: {
  guide: CustomIndicatorReferenceCenterTopic["exampleGuide"];
}) => {
  if (!guide) {
    return null;
  }

  return (
    <div className="custom-indicator-reference-example-guide">
      <p className="custom-indicator-reference-example-guide-overview">
        {guide.overview}
      </p>
      <div className="custom-indicator-reference-example-guide-steps">
        {guide.steps.map((step) => (
          <section
            key={step.code}
            className="custom-indicator-reference-example-guide-step"
          >
            <h5>{step.title}</h5>
            <pre className="custom-indicator-reference-guide-code">
              <code>{step.code}</code>
            </pre>
            <div className="custom-indicator-reference-guide-copy">
              {step.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="custom-indicator-reference-example-guide-result">
        {guide.result}
      </p>
      {guide.useCases?.length ? (
        <ul className="custom-indicator-reference-example-guide-use-cases">
          {guide.useCases.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const ReferenceInfoSection = ({
  label,
  children,
  tone,
}: {
  label: string;
  children: ReactNode;
  tone?: "watchout" | "unavailable";
}) => (
  <section
    className={`custom-indicator-reference-detail-section ${
      tone ? `is-${tone}` : ""
    }`}
  >
    <span className="custom-indicator-reference-detail-label">{label}</span>
    {children}
  </section>
);

const ReferenceShell = ({
  presentation,
  isOpen,
  onOpenChange,
  activeReferenceCenterDocModule,
  ui,
  children,
}: {
  presentation: NonNullable<CustomIndicatorReferenceCenterDialogProps["presentation"]>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  activeReferenceCenterDocModule: CustomIndicatorReferenceCenterModule | null;
  ui: UiLabelEntry;
  children: ReactNode;
}) => {
  if (presentation === "window") {
    return (
      <div className="custom-indicator-reference-modal custom-indicator-reference-window">
        {children}
      </div>
    );
  }

  return (
    <AppModal
      open={isOpen}
      onClose={() => onOpenChange(false)}
      className="custom-indicator-reference-modal"
      closeOnInteractOutside
      closeOnEscapeKeyDown
      accessibilityTitle={ui.customIndicatorRulesTitle}
      accessibilityDescription={
        activeReferenceCenterDocModule?.overview ?? ui.customIndicatorRulesUsage
      }
    >
      {children}
    </AppModal>
  );
};

export const CustomIndicatorReferenceCenterDialog = ({
  presentation = "dialog",
  language,
  ui,
  isOpen,
  onOpenChange,
  activeReferenceCenterDocModule,
  activeReferenceCenterRelatedTopics,
  activeReferenceCenterTopic,
  isReferenceSearchPending,
  expandedReferenceCollectionIds,
  filteredReferenceCollections,
  selectedReferenceTopicId,
  referenceKeyword,
  referenceSelectionHint,
  rulesSearchInputRef,
  onSetReferenceKeyword,
  onExpandAllReferenceCollections,
  onCollapseAllReferenceCollections,
  onToggleReferenceCollection,
  onSelectReferenceTopic,
}: CustomIndicatorReferenceCenterDialogProps) => {
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const [copiedCodeTarget, setCopiedCodeTarget] = useState<
    "formula" | "example" | null
  >(null);
  const [isAiGuideOpen, setIsAiGuideOpen] = useState(false);
  const aiGuideCopy = getCustomIndicatorAiConversionGuideCopy(language);
  const visibleReferenceTopicIds = useMemo(
    () =>
      filteredReferenceCollections.flatMap((collection) => collection.topicIds),
    [filteredReferenceCollections],
  );
  const totalTopicCount = activeReferenceCenterDocModule?.topics.length ?? 0;
  const categoryCount = activeReferenceCenterDocModule?.collections.length ?? 0;

  const formatCount = useCallback(
    (template: string, count: number) =>
      template.replace("{count}", String(count)),
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    rulesSearchInputRef.current?.focus();
  }, [isOpen, rulesSearchInputRef]);

  useEffect(() => {
    detailScrollRef.current?.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [activeReferenceCenterTopic?.id]);

  useEffect(() => {
    setCopiedCodeTarget(null);
  }, [activeReferenceCenterTopic?.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      rulesSearchInputRef.current?.focus();
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [isOpen, rulesSearchInputRef]);

  useEffect(
    () => () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    },
    [],
  );

  const primaryTitle =
    activeReferenceCenterTopic?.aliases[0] ??
    activeReferenceCenterTopic?.title ??
    ui.customIndicatorRulesTitle;
  const extraAliases = (
    activeReferenceCenterTopic?.aliases.filter(
      (alias) => alias !== activeReferenceCenterTopic.aliases[0],
    ) ?? []
  ).slice(0, 6);

  const isCurrentTopicUnavailable =
    activeReferenceCenterTopic?.exampleKind === "unavailable" ||
    activeReferenceCenterTopic?.availability === "unsupported" ||
    activeReferenceCenterTopic?.availability === "blocked-data-scope";
  const hasSecondaryInfo =
    Boolean(activeReferenceCenterTopic?.useWhen) ||
    Boolean(activeReferenceCenterTopic?.commonMistake);

  const handleSelectTopic = useCallback(
    (topicId: string) => {
      setIsAiGuideOpen(false);
      onSelectReferenceTopic(topicId);
    },
    [onSelectReferenceTopic],
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && referenceKeyword) {
        event.preventDefault();
        onSetReferenceKeyword("");
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      if (!visibleReferenceTopicIds.length) {
        return;
      }
      event.preventDefault();
      const selectedIndex = visibleReferenceTopicIds.indexOf(
        selectedReferenceTopicId,
      );
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const fallbackIndex = direction > 0 ? -1 : 0;
      const nextIndex =
        (selectedIndex < 0 ? fallbackIndex : selectedIndex) + direction;
      const wrappedIndex =
        (nextIndex + visibleReferenceTopicIds.length) %
        visibleReferenceTopicIds.length;
      const nextTopicId = visibleReferenceTopicIds[wrappedIndex];
      if (nextTopicId) {
        handleSelectTopic(nextTopicId);
      }
    },
    [
      handleSelectTopic,
      onSetReferenceKeyword,
      referenceKeyword,
      selectedReferenceTopicId,
      visibleReferenceTopicIds,
    ],
  );

  const handleCopyCode = useCallback(
    async (target: "formula" | "example", content: string) => {
      if (!(await writeCustomIndicatorReferenceTextToClipboard(content))) {
        return;
      }
      setCopiedCodeTarget(target);
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        copyFeedbackTimerRef.current = null;
        setCopiedCodeTarget(null);
      }, COPY_FEEDBACK_MS);
    },
    [],
  );

  return (
    <ReferenceShell
      presentation={presentation}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      activeReferenceCenterDocModule={activeReferenceCenterDocModule}
      ui={ui}
    >
      <StandardModalFrame
        className="custom-indicator-reference-frame"
        title={
          <div className="custom-indicator-reference-header">
            <div className="custom-indicator-reference-header-copy">
              <div className="custom-indicator-reference-header-title-row">
                <h3>{ui.customIndicatorRulesTitle}</h3>
                <div className="custom-indicator-reference-header-actions">
                  <div className="custom-indicator-reference-ai-guide-action">
                    <Tooltip delay={0}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={isAiGuideOpen ? "secondary" : "ghost"}
                          size="sm"
                          className="custom-indicator-reference-ai-guide-button"
                          onClick={() =>
                            setIsAiGuideOpen((current) => !current)
                          }
                          aria-pressed={isAiGuideOpen}
                        >
                          <VendorIcon
                            name="code2"
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          <span>{ui.customIndicatorAiGuideDownloadLabel}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="end"
                        sideOffset={8}
                        className="custom-indicator-reference-ai-guide-tooltip"
                      >
                        {ui.customIndicatorAiGuideDownloadTooltip}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {presentation === "window" ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenChange(false)}
                    >
                      {ui.customIndicatorRulesClose}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        }
        description={
          <div className="custom-indicator-reference-toolbar-shell">
            <p className="custom-indicator-reference-header-desc">
              {activeReferenceCenterDocModule?.overview ?? ui.customIndicatorRulesUsage}
            </p>
            <div className="custom-indicator-reference-toolbar">
              <div className="custom-indicator-reference-search-wrap">
                <AppIcon
                  name="actionSearch"
                  className="custom-indicator-reference-search-icon"
                  aria-hidden="true"
                />
                <Input
                  ref={rulesSearchInputRef}
                  type="search"
                  className="custom-indicator-reference-search"
                  density="compact"
                  value={referenceKeyword}
                  onChange={(event) => onSetReferenceKeyword(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  title={ui.customIndicatorRulesSearchPlaceholder}
                  placeholder={ui.customIndicatorRulesSearchPlaceholder}
                  aria-controls="custom-indicator-reference-topic-list"
                  aria-describedby="custom-indicator-reference-search-meta"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="custom-indicator-reference-search-clear"
                onClick={() => onSetReferenceKeyword("")}
                disabled={!referenceKeyword.trim()}
                aria-label={ui.clearSelected}
                title={ui.clearSelected}
              >
                <VendorIcon name="x" aria-hidden="true" />
              </Button>
              <div
                id="custom-indicator-reference-search-meta"
                className="custom-indicator-reference-search-meta"
                role="status"
                aria-live="polite"
              >
                <span>
                  {referenceKeyword.trim() ? (
                    formatCount(
                      aiGuideCopy.referenceUi.resultCountTemplate,
                      visibleReferenceTopicIds.length,
                    )
                  ) : (
                    <span className="custom-indicator-reference-catalog-summary">
                      <span>
                        {formatCount(
                          aiGuideCopy.referenceUi.functionCountTemplate,
                          totalTopicCount,
                        )}
                      </span>
                      <span aria-hidden="true" />
                      <span>
                        {formatCount(
                          aiGuideCopy.referenceUi.categoryCountTemplate,
                          categoryCount,
                        )}
                      </span>
                    </span>
                  )}
                </span>
                <span aria-hidden="true">
                  {aiGuideCopy.referenceUi.keyboardHint}
                </span>
              </div>
            </div>
          </div>
        }
        bodyClassName="custom-indicator-reference-frame-body"
      >
        <PageSidebarLayout
          className="custom-indicator-reference-layout"
          sidebarClassName="custom-indicator-reference-layout-sidebar"
          mainClassName="custom-indicator-reference-layout-main"
          divider="subtle"
          sidebar={
            <div className="custom-indicator-reference-sidebar">
              <div className="custom-indicator-reference-sidebar-toolbar">
                <span>
                  {formatCount(
                    aiGuideCopy.referenceUi.resultCountTemplate,
                    visibleReferenceTopicIds.length,
                  )}
                </span>
                {!referenceKeyword.trim() ? (
                  <div>
                    <Button
                      type="button"
                      variant="inline"
                      onClick={onExpandAllReferenceCollections}
                    >
                      {aiGuideCopy.referenceUi.expandAllLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="inline"
                      onClick={onCollapseAllReferenceCollections}
                    >
                      {aiGuideCopy.referenceUi.collapseAllLabel}
                    </Button>
                  </div>
                ) : null}
              </div>
              <div
                id="custom-indicator-reference-topic-list"
                className="custom-indicator-reference-topic-list"
                aria-busy={isReferenceSearchPending}
              >
                {filteredReferenceCollections.length ? (
                  filteredReferenceCollections.map((collection) => {
                    const isExpanded = expandedReferenceCollectionIds.includes(
                      collection.id,
                    );
                    return (
                      <section
                        key={collection.id}
                        className={`custom-indicator-reference-collection ${
                          isExpanded ? "is-expanded" : ""
                        }`}
                      >
                        <Button
                          type="button"
                          variant="inline"
                          className="custom-indicator-reference-collection-toggle"
                          onClick={() =>
                            onToggleReferenceCollection(collection.id)
                          }
                          aria-expanded={isExpanded}
                        >
                          <span className="custom-indicator-reference-collection-toggle-copy">
                            <strong>{collection.label}</strong>
                          </span>
                          <span className="custom-indicator-reference-collection-meta">
                            <span className="custom-indicator-reference-collection-count">
                              {collection.topicIds.length}
                            </span>
                            <span className="custom-indicator-reference-collection-caret">
                              <AppIcon
                                name={
                                  isExpanded
                                    ? "actionChevronDown"
                                    : "actionChevronRight"
                                }
                              />
                            </span>
                          </span>
                        </Button>
                        {isExpanded ? (
                          <div className="custom-indicator-reference-collection-body">
                            {collection.topicIds.map((topicId) => {
                              const topic =
                                activeReferenceCenterDocModule?.topicById.get(
                                  topicId,
                                );
                              if (!topic) {
                                return null;
                              }
                              return (
                                <TopicListRow
                                  key={topic.id}
                                  topic={topic}
                                  isActive={
                                    selectedReferenceTopicId === topic.id
                                  }
                                  onSelect={handleSelectTopic}
                                />
                              );
                            })}
                          </div>
                        ) : null}
                      </section>
                    );
                  })
                ) : (
                  <section className="custom-indicator-reference-list-empty">
                    <p>{referenceSelectionHint}</p>
                  </section>
                )}
              </div>
            </div>
          }
          content={
            <div
              ref={detailScrollRef}
              className="custom-indicator-reference-detail"
            >
              {isAiGuideOpen ? (
                <CustomIndicatorAiConversionGuidePanel
                  language={language}
                  ui={ui}
                  onClose={() => setIsAiGuideOpen(false)}
                />
              ) : activeReferenceCenterTopic ? (
                <article className="custom-indicator-reference-detail-card">
                  <header className="custom-indicator-reference-detail-head">
                    <div className="custom-indicator-reference-detail-title-copy">
                      <span className="custom-indicator-reference-detail-kicker">
                        {activeReferenceCenterTopic.collectionLabel}
                      </span>
                      <h4>{primaryTitle}</h4>
                      <span
                        className={`custom-indicator-reference-availability-badge is-${activeReferenceCenterTopic.availability}`}
                      >
                        {
                          aiGuideCopy.availabilityLabels[
                            activeReferenceCenterTopic.availability
                          ]
                        }
                      </span>
                    </div>
                    {extraAliases.length ? (
                      <div className="custom-indicator-reference-detail-aliases">
                        <span>
                          {ui.customIndicatorReferenceCenterAliases}
                        </span>
                        <div className="custom-indicator-reference-chip-row">
                          {extraAliases.map((alias) => (
                            <span
                              key={alias}
                              className="custom-indicator-reference-chip"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </header>

                  <ReferenceInfoSection
                    label={ui.customIndicatorReferenceCenterFunctionExplanation}
                  >
                    <p>{activeReferenceCenterTopic.summary}</p>
                  </ReferenceInfoSection>

                  {isCurrentTopicUnavailable ? (
                    <ReferenceInfoSection
                      label={ui.customIndicatorRuleUnavailableStatus}
                      tone="unavailable"
                    >
                      <p>{activeReferenceCenterTopic.description}</p>
                      {activeReferenceCenterTopic.example ? (
                        <p className="custom-indicator-reference-unavailable-path">
                          {activeReferenceCenterTopic.example}
                        </p>
                      ) : null}
                    </ReferenceInfoSection>
                  ) : (
                    <section className="custom-indicator-reference-primary-stack">
                      <ReferenceCodePanel
                        label={ui.customIndicatorRuleStandardSyntax}
                        tone="formula"
                        code={activeReferenceCenterTopic.formula}
                        actionLabel={
                          copiedCodeTarget === "formula"
                            ? aiGuideCopy.referenceUi.copiedLabel
                            : aiGuideCopy.referenceUi.copySyntaxLabel
                        }
                        copied={copiedCodeTarget === "formula"}
                        onCopy={() =>
                          void handleCopyCode(
                            "formula",
                            activeReferenceCenterTopic.formula,
                          )
                        }
                      />
                      <ReferenceCodePanel
                        label={ui.customIndicatorRuleOneLineExample}
                        tone="example"
                        code={activeReferenceCenterTopic.example}
                        guide={activeReferenceCenterTopic.exampleGuide}
                        prose={activeReferenceCenterTopic.exampleKind === "prose"}
                        actionLabel={
                          copiedCodeTarget === "example"
                            ? aiGuideCopy.referenceUi.copiedLabel
                            : aiGuideCopy.referenceUi.copyExampleLabel
                        }
                        copied={copiedCodeTarget === "example"}
                        onCopy={() =>
                          void handleCopyCode(
                            "example",
                            activeReferenceCenterTopic.example,
                          )
                        }
                      />
                    </section>
                  )}

                  {hasSecondaryInfo ? (
                    <div className="custom-indicator-reference-secondary-grid">
                      {activeReferenceCenterTopic.useWhen ? (
                        <ReferenceInfoSection
                          label={ui.customIndicatorRuleWhenToUse}
                        >
                          <p>{activeReferenceCenterTopic.useWhen}</p>
                        </ReferenceInfoSection>
                      ) : null}

                      {activeReferenceCenterTopic.commonMistake ? (
                        <ReferenceInfoSection
                          label={ui.customIndicatorRuleCommonMistake}
                          tone="watchout"
                        >
                          <p>{activeReferenceCenterTopic.commonMistake}</p>
                        </ReferenceInfoSection>
                      ) : null}
                    </div>
                  ) : null}
                  {activeReferenceCenterRelatedTopics.length ? (
                    <section className="custom-indicator-reference-related-row">
                      <span className="custom-indicator-reference-detail-label">
                        {ui.customIndicatorReferenceCenterRelated}
                      </span>
                      <div className="custom-indicator-reference-chip-row">
                        {activeReferenceCenterRelatedTopics.map((topic) => (
                          <Button
                            key={topic.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectTopic(topic.id)}
                          >
                            {topic.aliases[0] ?? topic.title}
                          </Button>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </article>
              ) : (
                <section className="custom-indicator-reference-detail-empty">
                  <p>{referenceSelectionHint}</p>
                </section>
              )}
            </div>
          }
        />
      </StandardModalFrame>
    </ReferenceShell>
  );
};
