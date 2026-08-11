// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/workspaces/command-center.css";

import { Button } from "@/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/primitives/card";
import { useI18n } from "@/frontend-kernel/i18n";
import { AppIcon } from "@/assets/graphics";
import { NotesColorDot } from "@/workspaces/notes/NotesPagePrimitives";
import { WorkspaceFrameShell, WorkspacePageShell } from "@/ui/components";
import type { TrainingCommandCenterPageProps } from "@/workspaces/command-center/trainingCommandCenterTypes";

const renderInlineMetricItems = (
  items: Array<{ id: string; value: string; label: string }>,
  fallbackText: string,
  dividerText: string,
) => (
  <div
    className="training-command-center-inline-metric-row"
    aria-label={fallbackText}
  >
    <span className="sr-only">{fallbackText}</span>
    {items.map((item, index) => (
      <span key={item.id} className="training-command-center-inline-metric-item">
        {index > 0 ? (
          <span
            aria-hidden="true"
            className="training-command-center-inline-metric-divider"
          >
            {dividerText}
          </span>
        ) : null}
        <strong
          className="training-command-center-inline-metric-value"
          data-i18n-slot="metricValue"
        >
          {item.value}
        </strong>
        <span
          className="training-command-center-inline-metric-label"
          data-i18n-slot="metricLabel"
        >
          {item.label}
        </span>
      </span>
    ))}
  </div>
);

export const TrainingCommandCenterPage = ({
  eyebrow,
  title,
  heroSection,
  utilitySection,
}: TrainingCommandCenterPageProps) => {
  const { t } = useI18n();
  const slashDivider = t("app.joiner.slash");
  const hasRecentActivitiesEmptyHint =
    utilitySection.recentActivities.emptyHintText.trim().length > 0;
  return (
    <WorkspacePageShell
      template="overview"
      className="training-command-center-page"
      bodyClassName="training-command-center-page-body"
    >
      <WorkspaceFrameShell className="training-command-center-shell">
        <header
          className="training-command-center-header training-command-center-region training-command-center-region-header"
        >
          <div className="training-command-center-header-copy">
            <div className="training-command-center-page-copy">
              <span className="training-command-center-eyebrow">{eyebrow}</span>
              <h1 className="training-command-center-title">{title}</h1>
            </div>
          </div>
        </header>

        <section
          className="training-command-center-section training-command-center-region training-command-center-region-hero"
        >
          <div className="training-command-center-section-scroll">
            <div className="training-command-center-hero-grid">
              {heroSection.cards.map((card) => (
                <Card
                  key={card.id}
                  className={`training-command-center-mode-card is-${card.id}`}
                  data-onboarding-target={
                    card.id === "strategy"
                      ? "MODE_FREE_REPLAY"
                      : card.id === "flash"
                        ? "MODE_LIGHTNING"
                        : "MODE_SURVIVAL"
                  }
                >
                  <CardHeader className="training-command-center-mode-head">
                    <div className="training-command-center-mode-visual">
                      <span className="training-command-center-mode-visual-icon">
                        <AppIcon name={card.iconName} />
                      </span>
                    </div>
                    <div className="training-command-center-mode-copy">
                      <CardTitle
                        data-i18n-slot="cardTitle"
                        data-i18n-critical="true"
                      >
                        {card.title}
                      </CardTitle>
                      <CardDescription data-i18n-slot="cardDescription">
                        {card.summary}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="training-command-center-mode-body">
                    <div className="training-command-center-mode-metric-shell">
                      <div className="training-command-center-mode-metric">
                        <span
                          className="training-command-center-mode-metric-label"
                          data-i18n-slot="metricLabel"
                        >
                          {card.metricLabel}
                        </span>
                        {card.metricItems?.length
                          ? renderInlineMetricItems(
                              card.metricItems,
                              card.metricValue,
                              slashDivider,
                            )
                          : (
                          <span
                            className="training-command-center-mode-metric-value"
                            data-i18n-slot="metricValue"
                          >
                            {card.metricValue}
                          </span>
                            )}
                        {card.metricSupport ? (
                          <span
                            className="training-command-center-mode-metric-support"
                            data-i18n-slot="metricSupport"
                          >
                            {card.metricSupport}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="training-command-center-mode-actions">
                      <Button
                        type="button"
                        variant={card.primaryAction.tone === "primary" ? "default" : "outline"}
                        size="lg"
                        className={`training-command-center-cta is-${card.primaryAction.tone} is-${card.id}`}
                        onClick={card.primaryAction.onClick}
                        disabled={card.primaryAction.disabled}
                      >
                        <span
                          className="training-command-center-cta-icon"
                          aria-hidden="true"
                        >
                          <AppIcon name={card.primaryAction.iconName ?? card.iconName} />
                        </span>
                        <span
                          className="training-command-center-cta-label"
                          data-i18n-slot="buttonLabel"
                          data-i18n-critical="true"
                        >
                          {card.primaryAction.label}
                        </span>
                      </Button>
                      {card.secondaryAction ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          className={`training-command-center-cta is-secondary is-${card.id}`}
                          onClick={card.secondaryAction.onClick}
                          disabled={card.secondaryAction.disabled}
                        >
                          {card.secondaryAction.iconName ? (
                            <span
                              className="training-command-center-cta-icon"
                              aria-hidden="true"
                            >
                              <AppIcon name={card.secondaryAction.iconName} />
                            </span>
                          ) : null}
                          <span
                            className="training-command-center-cta-label"
                            data-i18n-slot="buttonLabel"
                          >
                            {card.secondaryAction.label}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          className="training-command-center-section training-command-center-region training-command-center-region-utility"
        >
          <div className="training-command-center-section-scroll">
            <div className="training-command-center-utility-grid">
              <Card className="training-command-center-data-card">
                <CardHeader>
                  <div className="training-command-center-data-icon">
                    <AppIcon name="navData" />
                  </div>
                  <div>
                    <CardTitle
                      data-i18n-slot="cardTitle"
                      data-i18n-critical="true"
                    >
                      {utilitySection.dataCenter.title}
                    </CardTitle>
                    <CardDescription data-i18n-slot="cardDescription">
                      {utilitySection.dataCenter.subtitle}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="training-command-center-data-body">
                  <div className="training-command-center-data-summary">
                    <span
                      className="training-command-center-mode-metric-label"
                      data-i18n-slot="metricLabel"
                    >
                      {utilitySection.dataCenter.summaryLabel}
                    </span>
                    {utilitySection.dataCenter.summaryItems?.length ? (
                      renderInlineMetricItems(
                        utilitySection.dataCenter.summaryItems,
                        utilitySection.dataCenter.summary,
                        slashDivider,
                      )
                    ) : (
                      <div
                        className="training-command-center-data-highlight"
                        data-i18n-slot="bodyCopy"
                      >
                        {utilitySection.dataCenter.summary}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="training-command-center-compact-action training-command-center-data-link"
                    onClick={utilitySection.dataCenter.onOpen}
                  >
                    <AppIcon name="actionChevronRight" />
                    <span data-i18n-slot="buttonLabel" data-i18n-critical="true">
                      {utilitySection.dataCenter.actionLabel}
                    </span>
                  </Button>
                </CardContent>
              </Card>

              <Card className="training-command-center-recent-card">
                <CardHeader className="training-command-center-recent-head">
                  <div className="training-command-center-recent-head-copy">
                    <CardTitle
                      data-i18n-slot="cardTitle"
                      data-i18n-critical="true"
                    >
                      {utilitySection.recentActivities.title}
                    </CardTitle>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="training-command-center-compact-action"
                    onClick={utilitySection.recentActivities.onOpenMore}
                  >
                    <span data-i18n-slot="buttonLabel">
                      {utilitySection.recentActivities.moreActionLabel}
                    </span>
                  </Button>
                </CardHeader>
                <CardContent className="training-command-center-recent-list">
                  {utilitySection.recentActivities.items.length ? (
                    utilitySection.recentActivities.items.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="training-command-center-recent-item"
                        onClick={item.onOpen}
                      >
                        <div className="training-command-center-recent-item-copy">
                          <h3 data-i18n-slot="cardTitle">{item.title}</h3>
                          <div className="training-command-center-recent-item-meta">
                            {item.typeLabel ? (
                              <span className="training-command-center-recent-item-kind">
                                {item.typeLabel}
                              </span>
                            ) : null}
                            {item.colorTokens?.length ? (
                              <span className="training-command-center-recent-item-colors">
                                {item.colorTokens.map((colorToken) => (
                                  <NotesColorDot
                                    key={colorToken}
                                    colorToken={colorToken}
                                  />
                                ))}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span
                          className="training-command-center-recent-item-time"
                          data-i18n-slot="bodyCopy"
                        >
                          {item.timeLabel}
                        </span>
                      </Button>
                    ))
                  ) : (
                    <div className="training-command-center-empty training-command-center-recent-empty">
                      <div className="training-command-center-empty-graphic">
                        <AppIcon name="navNotes" />
                      </div>
                      <strong data-i18n-slot="cardTitle" data-i18n-critical="true">
                        {utilitySection.recentActivities.emptyText}
                      </strong>
                      {hasRecentActivitiesEmptyHint ? (
                        <span data-i18n-slot="bodyCopy">
                          {utilitySection.recentActivities.emptyHintText}
                        </span>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </WorkspaceFrameShell>
    </WorkspacePageShell>
  );
};

export default TrainingCommandCenterPage;
