// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import { AppModal, StandardModalFrame } from "@/ui/components";
import {
  TrainerMarketPresetInlinePanel,
  type TrainerMarketPresetEditorModel,
} from "@/workspaces/trainer/TrainerMarketPresetInlinePanel";
import { useI18n } from "@/frontend-kernel/i18n";

type StrategyBacktestEnvironmentModalProps = {
  open: boolean;
  editor: TrainerMarketPresetEditorModel;
  onCancel: () => void;
  onSave: () => void;
};

export const StrategyBacktestEnvironmentModal = ({
  open,
  editor,
  onCancel,
  onSave,
}: StrategyBacktestEnvironmentModalProps) => {
  const { t } = useI18n();
  return (
    <AppModal
      open={open}
      onClose={onCancel}
      preset="form"
      className="strategy-backtest-environment-modal"
      showCloseButton
      accessibilityTitle={t("trainer.strategyBacktest.environment")}
    >
      <StandardModalFrame
        variant="form"
        title={t("trainer.strategyBacktest.environment")}
        bodyClassName="strategy-backtest-environment-modal-body"
        actions={
          <>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("appText.cancel")}
            </Button>
            <Button type="button" variant="default" onClick={onSave}>
              {t("trainer.strategyBacktest.environmentSaveReturn")}
            </Button>
          </>
        }
      >
        <div className="strategy-backtest-environment-modal-grid">
          <TrainerMarketPresetInlinePanel
            mode="LONG"
            editor={editor}
            className="strategy-backtest-environment-modal-panel"
          />
          <TrainerMarketPresetInlinePanel
            mode="SHORT"
            editor={editor}
            className="strategy-backtest-environment-modal-panel"
          />
        </div>
      </StandardModalFrame>
    </AppModal>
  );
};
