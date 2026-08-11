// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

import { cn } from "@/ui/cn";

type SliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  density?: "compact" | "default" | "large";
};

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      defaultValue,
      density = "default",
      max = 100,
      min = 0,
      onChange,
      value,
      ...props
    },
    ref,
  ) => {
    const minNumber = toNumber(min, 0);
    const maxNumber = toNumber(max, 100);
    const [uncontrolledValue, setUncontrolledValue] = React.useState(
      toNumber(defaultValue, minNumber),
    );
    const resolvedValue = toNumber(value ?? uncontrolledValue, minNumber);
    const denominator = Math.max(1, maxNumber - minNumber);
    const fillPercent = Math.min(
      100,
      Math.max(0, ((resolvedValue - minNumber) / denominator) * 100),
    );

    return (
      <input
        {...props}
        ref={ref}
        type="range"
        data-slot="slider"
        data-density={density}
        className={cn("ui-slider", className)}
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        style={{
          "--ui-slider-fill": `${fillPercent}%`,
          ...props.style,
        } as React.CSSProperties}
        onChange={(event) => {
          if (value === undefined) {
            setUncontrolledValue(toNumber(event.target.value, minNumber));
          }
          onChange?.(event);
        }}
      />
    );
  },
);

Slider.displayName = "Slider";
