// SPDX-License-Identifier: GPL-3.0-only

export const SPECIAL_TRAINING_RISK_COMMAND_QUEUE_MAX = 200;

export type SpecialTrainingRiskOrderIntentPayload = {
  inputMode: "LOT" | "AMOUNT" | "RATIO";
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
  priceMode: "CUR_CLOSE" | "NEXT_OPEN";
  nextOpenDelayBars?: number;
};

export type SpecialTrainingRiskCommandIntent =
  | {
      action: "NEXT_BAR";
    }
  | {
      action: "BUY_AND_ADVANCE";
      order: SpecialTrainingRiskOrderIntentPayload;
    }
  | {
      action: "SELL_AND_ADVANCE";
      order: SpecialTrainingRiskOrderIntentPayload;
    }
  | {
      action: "UNDO";
    };

export type SpecialTrainingRiskCommandQueueResult = {
  continueDraining: boolean;
};

export type SpecialTrainingRiskCommandQueueExecutor = (
  intent: SpecialTrainingRiskCommandIntent,
) => Promise<SpecialTrainingRiskCommandQueueResult>;

type QueuedRiskCommand = {
  intent: SpecialTrainingRiskCommandIntent;
  resolve: () => void;
};

type MakeSpecialTrainingRiskInputQueueOptions = {
  execute: SpecialTrainingRiskCommandQueueExecutor;
  onError: (error: unknown) => void;
  maxSize?: number;
};

export type SpecialTrainingRiskCommandQueue = {
  enqueue: (intent: SpecialTrainingRiskCommandIntent) => Promise<void>;
  clear: () => void;
  isActive: () => boolean;
  size: () => number;
};

export const makeSpecialTrainingRiskInputQueue = ({
  execute,
  onError,
  maxSize = SPECIAL_TRAINING_RISK_COMMAND_QUEUE_MAX,
}: MakeSpecialTrainingRiskInputQueueOptions): SpecialTrainingRiskCommandQueue => {
  const queue: QueuedRiskCommand[] = [];
  let isDraining = false;

  const resolvePendingCommands = () => {
    while (queue.length > 0) {
      queue.shift()?.resolve();
    }
  };

  const drain = async () => {
    if (isDraining) {
      return;
    }
    isDraining = true;
    try {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) {
          continue;
        }
        try {
          const result = await execute(item.intent);
          item.resolve();
          if (!result.continueDraining) {
            resolvePendingCommands();
            break;
          }
        } catch (error) {
          item.resolve();
          resolvePendingCommands();
          onError(error);
          break;
        }
      }
    } finally {
      isDraining = false;
      if (queue.length > 0) {
        void drain();
      }
    }
  };

  return {
    enqueue: (intent) =>
      new Promise<void>((resolve) => {
        if (queue.length >= maxSize) {
          onError(new Error("SPECIAL_TRAINING_RISK_COMMAND_QUEUE_FULL"));
          resolve();
          return;
        }
        queue.push({ intent, resolve });
        void drain();
      }),
    clear: resolvePendingCommands,
    isActive: () => isDraining || queue.length > 0,
    size: () => queue.length,
  };
};
