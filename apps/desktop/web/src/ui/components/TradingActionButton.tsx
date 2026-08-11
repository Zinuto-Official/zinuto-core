// SPDX-License-Identifier: GPL-3.0-only

import { Button, type ButtonProps } from "@/ui/primitives/button"
import { cn } from "@/ui/cn"

export type TradingActionTone = "buy" | "sell" | "next" | "primary" | "ghost"

type TradingActionButtonProps = Omit<ButtonProps, "variant"> & {
  tone: TradingActionTone
}

const toneClassNameByTone: Record<TradingActionTone, string> = {
  buy: "ui-trading-action-button is-buy",
  sell: "ui-trading-action-button is-sell",
  next: "ui-trading-action-button is-next",
  primary: "ui-trading-action-button is-primary",
  ghost: "ui-trading-action-button is-ghost",
}

const variantByTone: Record<TradingActionTone, ButtonProps["variant"]> = {
  buy: "default",
  sell: "outline",
  next: "ghost",
  primary: "default",
  ghost: "ghost",
}

export const TradingActionButton = ({
  tone,
  size = "default",
  className,
  ...props
}: TradingActionButtonProps) => (
  <Button
    variant={variantByTone[tone]}
    size={size}
    data-tone={tone}
    className={cn(toneClassNameByTone[tone], className)}
    {...props}
  />
)
