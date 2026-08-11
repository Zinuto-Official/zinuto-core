// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/workspaces/challenge-stats.css";

import TrainingStatsPage, {
  type TrainingStatsPageProps,
} from "@/workspaces/challenge-stats/TrainingStatsPage";

export type ChallengeStatsPageProps = Omit<
  TrainingStatsPageProps,
  "viewMode"
>;

export const ChallengeStatsPage = ({
  challengeInitialProfitability = "ALL",
  ...props
}: ChallengeStatsPageProps) => (
  <TrainingStatsPage
    {...props}
    viewMode="challenge"
    challengeInitialProfitability={challengeInitialProfitability}
  />
);

export default ChallengeStatsPage;
