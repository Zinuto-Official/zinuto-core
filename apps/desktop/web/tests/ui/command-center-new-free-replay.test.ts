// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { launchFreeReplayFromCommandCenter } from "../../src/workspaces/command-center/strategyLaunchBehavior";

test("command center opens an active free replay without resetting it", () => {
  const calls: string[] = [];

  launchFreeReplayFromCommandCenter({
    canResumeTrainerSession: true,
    hasActiveTrainerSession: true,
    onSelectPage: (page) => calls.push(`navigate:${page}`),
    onResumeTrainerSession: () => calls.push("resume"),
  });

  assert.deepEqual(calls, ["navigate:TRAINER"]);
});

test("command center resumes an existing free replay from prep", () => {
  const calls: string[] = [];

  launchFreeReplayFromCommandCenter({
    canResumeTrainerSession: true,
    hasActiveTrainerSession: false,
    onSelectPage: (page) => calls.push(`navigate:${page}`),
    onResumeTrainerSession: () => calls.push("resume"),
  });

  assert.deepEqual(calls, ["resume"]);
});

test("command center opens free replay prep when no session exists", () => {
  const calls: string[] = [];

  launchFreeReplayFromCommandCenter({
    canResumeTrainerSession: false,
    hasActiveTrainerSession: false,
    onSelectPage: (page) => calls.push(`navigate:${page}`),
    onResumeTrainerSession: () => calls.push("resume"),
  });

  assert.deepEqual(calls, ["navigate:TRAINER"]);
});
