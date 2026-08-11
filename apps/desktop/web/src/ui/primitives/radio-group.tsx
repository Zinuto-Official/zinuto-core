// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

import { cn } from "@/ui/cn";

type RadioGroupContextValue = {
  disabled?: boolean;
  name?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(
  null,
);

type RadioGroupProps = Omit<React.ComponentProps<"div">, "onChange"> & {
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  value?: string;
};

export const RadioGroup = ({
  className,
  defaultValue,
  disabled,
  name,
  onValueChange,
  orientation = "vertical",
  value,
  ...props
}: RadioGroupProps) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? "",
  );
  const resolvedValue = value ?? uncontrolledValue;
  const generatedName = React.useId();
  const groupName = name ?? `radio-${generatedName}`;

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  const contextValue = React.useMemo(
    () => ({
      disabled,
      name: groupName,
      onValueChange: handleValueChange,
      value: resolvedValue,
    }),
    [disabled, groupName, handleValueChange, resolvedValue],
  );

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <div
        role="radiogroup"
        data-slot="radio-group"
        data-orientation={orientation}
        className={cn("ui-radio-group", className)}
        {...props}
      />
    </RadioGroupContext.Provider>
  );
};

type RadioItemProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "checked" | "defaultChecked" | "name" | "onChange" | "type" | "value"
> & {
  label?: React.ReactNode;
  value: string;
};

export const RadioItem = React.forwardRef<HTMLInputElement, RadioItemProps>(
  ({ children, className, disabled, label, value, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    const checked = context?.value === value;
    const isDisabled = Boolean(context?.disabled || disabled);

    return (
      <label
        data-slot="radio-option"
        data-checked={checked ? "true" : undefined}
        data-disabled={isDisabled ? "true" : undefined}
        className={cn("ui-radio-option", className)}
      >
        <input
          {...props}
          ref={ref}
          type="radio"
          data-slot="radio-item"
          name={context?.name}
          value={value}
          checked={checked}
          disabled={isDisabled}
          onChange={(event) => {
            if (event.target.checked) {
              context?.onValueChange?.(value);
            }
          }}
        />
        <span data-slot="radio-label">{label ?? children}</span>
      </label>
    );
  },
);

RadioItem.displayName = "RadioItem";
