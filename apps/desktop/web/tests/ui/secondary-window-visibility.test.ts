// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const hostSource = readSource("src/api/desktopSecondaryWindows.ts");
const focusRuntimeSource = readSource(
  "src/api/desktopSecondaryWindowFocusRuntime.ts",
);
const listenerRuntimeSource = readSource(
  "src/api/desktopSecondaryWindowListeners.ts",
);
const rootSource = readSource(
  "src/app-shell/secondaryWindows/DesktopSecondaryWindowRoot.tsx",
);
const onboardingTourSource = readSource(
  "src/app-shell/onboarding/DesktopOnboardingTour.tsx",
);

test("secondary shell readiness never exposes normal loading", () => {
  const shellListenerStart = listenerRuntimeSource.indexOf(
    "const ensureShellReadyListener",
  );
  const routeListenerStart = listenerRuntimeSource.indexOf(
    "const ensureRouteReadyListener",
  );
  assert.ok(shellListenerStart >= 0);
  assert.ok(routeListenerStart > shellListenerStart);

  const shellListenerSource = listenerRuntimeSource.slice(
    shellListenerStart,
    routeListenerStart,
  );
  assert.doesNotMatch(
    shellListenerSource,
    /dependencies\.focusPending/u,
  );
  assert.doesNotMatch(hostSource, /scheduleDesktopSecondaryShellReadyDeadline/u);
  assert.doesNotMatch(hostSource, /desktopSecondaryWindowContentFirstFocusKinds/u);
});

test("duplicate state-ready requests preserve current content readiness", () => {
  const readyListenerStart = listenerRuntimeSource.indexOf(
    "const ensureReadyListener",
  );
  const actionListenerStart = listenerRuntimeSource.indexOf(
    "const ensureActionListener",
  );
  assert.ok(readyListenerStart >= 0);
  assert.ok(actionListenerStart > readyListenerStart);
  const readyListenerSource = listenerRuntimeSource.slice(
    readyListenerStart,
    actionListenerStart,
  );
  assert.doesNotMatch(
    readyListenerSource,
    /contentReadyRevisionByKind\.delete/u,
  );
  assert.doesNotMatch(
    readyListenerSource,
    /routeReadyKinds\.delete/u,
  );
});

test("new and hidden reusable windows wait for matching content revision", () => {
  assert.match(hostSource, /visible: false/u);
  assert.match(
    focusRuntimeSource,
    /CONTENT_FIRST_VISIBILITY_DEADLINE_MS = 10_500/u,
  );

  const openWindowStart = hostSource.indexOf(
    "export const openDesktopSecondaryWindow",
  );
  const existingWindowStart = hostSource.indexOf(
    "if (existingWindow) {",
    openWindowStart,
  );
  const createWindowStart = hostSource.indexOf(
    "const webviewWindow = new webviewWindowModule.WebviewWindow",
    existingWindowStart,
  );
  assert.ok(openWindowStart >= 0);
  assert.ok(existingWindowStart > openWindowStart);
  assert.ok(createWindowStart > existingWindowStart);

  const existingWindowSource = hostSource.slice(
    existingWindowStart,
    createWindowStart,
  );
  const visibilityRead = existingWindowSource.indexOf(
    "const wasVisible = await existingWindow.isVisible()",
  );
  const visibleFastPath = existingWindowSource.indexOf("if (wasVisible)");
  const hiddenDeadline = existingWindowSource.indexOf(
    "desktopSecondaryWindowFocusRuntime.scheduleContentFirstVisibilityDeadline(",
  );
  const matchingRevision = existingWindowSource.indexOf(
    "desktopSecondaryWindowContentReadyRevisionByKind.get(kind)",
  );
  const hiddenFocus = existingWindowSource.indexOf(
    "await desktopSecondaryWindowFocusRuntime.focusPending(kind)",
  );
  assert.ok(visibilityRead >= 0);
  assert.ok(visibleFastPath > visibilityRead);
  assert.ok(hiddenDeadline > visibleFastPath);
  assert.ok(matchingRevision > hiddenDeadline);
  assert.ok(hiddenFocus > matchingRevision);

  const createWindowSource = hostSource.slice(createWindowStart);
  const createdHidden = createWindowSource.indexOf("visible: false");
  const contentDeadline = createWindowSource.indexOf(
    "desktopSecondaryWindowFocusRuntime.scheduleContentFirstVisibilityDeadline(",
  );
  assert.ok(createdHidden >= 0);
  assert.ok(contentDeadline > createdHidden);
});

test("a same-instance state revision cannot cancel secondary-window creation", () => {
  const openWindowStart = hostSource.indexOf(
    "export const openDesktopSecondaryWindow",
  );
  const existingWindowStart = hostSource.indexOf(
    "if (existingWindow) {",
    openWindowStart,
  );
  assert.ok(openWindowStart >= 0);
  assert.ok(existingWindowStart > openWindowStart);

  const openingSource = hostSource.slice(
    openWindowStart,
    existingWindowStart,
  );
  assert.match(
    openingSource,
    /currentState\.instanceId !== openedState\.instanceId/u,
  );
  assert.match(
    openingSource,
    /currentState\.revision !== state\.revision[\s\S]*state = currentState/u,
  );
  assert.doesNotMatch(
    openingSource,
    /if \(!desktopSecondaryWindowStateStore\.isCurrentState\(state\)\) \{\s*return/u,
  );
});

test("onboarding actions follow the current visual-context revision", () => {
  const actionSubscriptionStart = onboardingTourSource.indexOf(
    "api.subscribeDesktopSecondaryWindowActions",
  );
  assert.ok(actionSubscriptionStart >= 0);
  const renderStart = onboardingTourSource.indexOf(
    "if (status !== \"ACTIVE\")",
    actionSubscriptionStart,
  );
  assert.ok(renderStart > actionSubscriptionStart);
  const actionSubscriptionSource = onboardingTourSource.slice(
    actionSubscriptionStart,
    renderStart,
  );
  assert.match(
    actionSubscriptionSource,
    /const currentRevision = api\.getDesktopSecondaryWindowCurrentRevision\(\s*"ONBOARDING_TOUR",?\s*\);/u,
  );
  assert.match(
    actionSubscriptionSource,
    /api\.isCurrentDesktopSecondaryWindowAction\(\s*message,\s*currentRevision,?\s*\)/u,
  );
  assert.match(
    actionSubscriptionSource,
    /onboardingWindowRevisionRef\.current = currentRevision;/u,
  );
});

test("content readiness is emitted after commit without hidden-window scheduling", () => {
  const signalStart = rootSource.indexOf(
    "const SecondaryWindowContentReadySignal",
  );
  const rootStart = rootSource.indexOf(
    "export const DesktopSecondaryWindowRoot",
  );
  assert.ok(signalStart >= 0);
  assert.ok(rootStart > signalStart);

  const signalSource = rootSource.slice(signalStart, rootStart);
  assert.match(
    signalSource,
    /useEffect\(\(\) => \{[\s\S]*notifyDesktopSecondaryWindowContentReady/u,
  );
  assert.doesNotMatch(signalSource, /window\.requestAnimationFrame\(/u);
  assert.doesNotMatch(signalSource, /window\.setTimeout\(/u);

  const suspenseStart = rootSource.indexOf("<Suspense fallback={contentFallback}>");
  const routeRender = rootSource.indexOf("<RouteComponent", suspenseStart);
  const readySignal = rootSource.indexOf(
    "<SecondaryWindowContentReadySignal",
    routeRender,
  );
  const suspenseEnd = rootSource.indexOf("</Suspense>", readySignal);
  assert.ok(suspenseStart >= 0);
  assert.ok(routeRender > suspenseStart);
  assert.ok(readySignal > routeRender);
  assert.ok(suspenseEnd > readySignal);
});

test("only matching content-ready revisions can focus a pending window", () => {
  const contentListenerStart = listenerRuntimeSource.indexOf(
    "const ensureContentReadyListener",
  );
  const nextListenerStart = listenerRuntimeSource.indexOf(
    "const dispose",
  );
  assert.ok(contentListenerStart >= 0);
  assert.ok(nextListenerStart > contentListenerStart);

  const contentListenerSource = listenerRuntimeSource.slice(
    contentListenerStart,
    nextListenerStart,
  );
  assert.match(
    contentListenerSource,
    /revision !== null &&[\s\S]*revision === currentRevision[\s\S]*dependencies\.focusPending/u,
  );
});

test("visibility deadlines and tray hiding cancel stale pending reveals", () => {
  const deadlineStart = focusRuntimeSource.indexOf(
    "const scheduleContentFirstVisibilityDeadline",
  );
  const focusStart = focusRuntimeSource.indexOf(
    "const trackOwnerCenterTask",
  );
  assert.ok(deadlineStart >= 0);
  assert.ok(focusStart > deadlineStart);
  const deadlineSource = focusRuntimeSource.slice(deadlineStart, focusStart);
  assert.match(deadlineSource, /expectedRevision: number/u);
  assert.match(
    deadlineSource,
    /currentRevision !== expectedRevision[\s\S]*scheduleContentFirstVisibilityDeadline\(kind, currentRevision\)/u,
  );

  assert.match(
    focusRuntimeSource,
    /ownerCenterTasks\.get\(kind\)[\s\S]*if \(!pendingKinds\.has\(kind\)\) \{[\s\S]*return;/u,
  );

  const visualContextStart = hostSource.indexOf(
    "export const setDesktopSecondaryWindowVisualContext",
  );
  const currentRevisionStart = hostSource.indexOf(
    "export const getDesktopSecondaryWindowCurrentRevision",
    visualContextStart,
  );
  const visualContextSource = hostSource.slice(
    visualContextStart,
    currentRevisionStart,
  );
  assert.match(
    visualContextSource,
    /desktopSecondaryWindowFocusRuntime\.hasPending\(state\.kind\)[\s\S]*desktopSecondaryWindowFocusRuntime\.scheduleContentFirstVisibilityDeadline\([\s\S]*state\.revision/u,
  );

  const trayStart = hostSource.indexOf(
    "export const hideDesktopAppToTray",
  );
  const quitStart = hostSource.indexOf(
    "export const quitDesktopApp",
    trayStart,
  );
  assert.ok(trayStart >= 0);
  assert.ok(quitStart > trayStart);
  const traySource = hostSource.slice(trayStart, quitStart);
  const clearPending = traySource.indexOf(
    "desktopSecondaryWindowFocusRuntime.clearPending(kind)",
  );
  const visibilityRead = traySource.indexOf(
    "const isVisible = await existingWindow.isVisible()",
  );
  assert.ok(clearPending >= 0);
  assert.ok(visibilityRead > clearPending);
});
