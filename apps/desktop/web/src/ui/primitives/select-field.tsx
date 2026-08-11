// SPDX-License-Identifier: GPL-3.0-only

import {
  forwardRef,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { cn } from "@/ui/cn";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/ui/primitives/select";

export type SelectFieldOption = {
  value: string;
  label: ReactNode;
  textValue?: string;
  disabled?: boolean;
  groupId?: string;
};

export type SelectFieldGroup = {
  id: string;
  label: ReactNode;
};

type SelectFieldWidth = "fill" | "fit";
type SelectFieldContentWidth = "trigger" | "min-trigger" | "content";

type SelectFieldProps = Omit<
  ComponentPropsWithoutRef<typeof SelectTrigger>,
  "children" | "defaultValue" | "onChange" | "value"
> & {
  options: readonly SelectFieldOption[];
  groups?: readonly SelectFieldGroup[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSelectedValueConfirm?: (value: string) => void;
  placeholder?: ReactNode;
  emptyLabel?: ReactNode;
  density?: "compact" | "default" | "large";
  width?: SelectFieldWidth;
  contentWidth?: SelectFieldContentWidth;
  contentClassName?: string;
  openWhenEmpty?: boolean;
  align?: "start" | "center" | "end";
};

const buildTokenMaps = (options: readonly SelectFieldOption[]) => {
  const tokenByValue = new Map<string, string>();
  const valueByToken = new Map<string, string>();

  options.forEach((option, index) => {
    const token = `option-${index}`;
    valueByToken.set(token, option.value);
    if (!tokenByValue.has(option.value)) {
      tokenByValue.set(option.value, token);
    }
  });

  return { tokenByValue, valueByToken };
};

const encodeValue = (
  value: string | undefined,
  tokenByValue: Map<string, string>,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return tokenByValue.get(value);
};

const contentWidthClassName = (contentWidth: SelectFieldContentWidth) => {
  if (contentWidth === "trigger") {
    return "w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]";
  }
  if (contentWidth === "content") {
    return "w-max min-w-[var(--radix-select-trigger-width)]";
  }
  return "w-[var(--radix-select-trigger-width)] min-w-[max(var(--radix-select-trigger-width),15rem)]";
};

export const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(
  (
    {
      id,
      className,
      contentClassName,
      align = "center",
      contentWidth = "trigger",
      openWhenEmpty = false,
      title,
      options,
      groups = [],
      value,
      defaultValue,
      onValueChange,
      onSelectedValueConfirm,
      disabled,
      placeholder,
      emptyLabel,
      density = "default",
      width = "fill",
      "aria-label": ariaLabel,
      ...triggerProps
    },
    ref,
  ) => {
    const [uncontrolledValue, setUncontrolledValue] = useState<
      string | undefined
    >(() => defaultValue);
    const isControlled = value !== undefined;
    const selectedValue = isControlled ? value : uncontrolledValue;
    const { tokenByValue, valueByToken } = useMemo(
      () => buildTokenMaps(options),
      [options],
    );
    const groupLabelById = useMemo(
      () => new Map(groups.map((group) => [group.id, group.label])),
      [groups],
    );
    const selectedOption =
      selectedValue === undefined
        ? null
        : (options.find((option) => option.value === selectedValue) ?? null);
    const isInvalidValue =
      selectedValue !== undefined &&
      selectedValue !== "" &&
      selectedOption === null;
    const encodedValue = encodeValue(selectedValue, tokenByValue);
    const displayPlaceholder = isInvalidValue ? selectedValue : placeholder;
    const isDisabled = disabled || (!openWhenEmpty && options.length === 0);

    const renderedOptions: ReactNode[] = [];
    let lastGroupId: string | undefined;
    options.forEach((option, index) => {
      if (option.groupId && option.groupId !== lastGroupId) {
        const groupLabel = groupLabelById.get(option.groupId);
        if (groupLabel) {
          renderedOptions.push(
            <SelectLabel key={`group-${option.groupId}-${index}`}>
              {groupLabel}
            </SelectLabel>,
          );
        }
      }
      lastGroupId = option.groupId;
      renderedOptions.push(
        <SelectItem
          key={`${valueByToken.get(`option-${index}`) ?? option.value}-${index}`}
          value={`option-${index}`}
          disabled={option.disabled}
          onPointerUp={() => {
            if (!option.disabled && option.value === selectedValue) {
              onSelectedValueConfirm?.(option.value);
            }
          }}
          onKeyDown={(event) => {
            if (
              !option.disabled &&
              option.value === selectedValue &&
              (event.key === "Enter" || event.key === " ")
            ) {
              onSelectedValueConfirm?.(option.value);
            }
          }}
          textValue={
            option.textValue ??
            (typeof option.label === "string" ? option.label : option.value)
          }
        >
          {option.label}
        </SelectItem>,
      );
    });

    return (
      <Select
        // Keep the Radix root controlled for its whole lifetime. Async page
        // state can legitimately move a field from no selection to a concrete
        // value; passing `undefined` first makes Radix warn about an
        // uncontrolled-to-controlled transition.
        value={encodedValue ?? ""}
        disabled={isDisabled}
        onValueChange={(nextToken) => {
          const nextValue = valueByToken.get(nextToken);
          if (nextValue === undefined) {
            return;
          }
          if (!isControlled) {
            setUncontrolledValue(nextValue);
          }
          onValueChange?.(nextValue);
        }}
      >
        <SelectTrigger
          {...triggerProps}
          ref={ref}
          id={id}
          title={title}
          aria-label={ariaLabel}
          data-invalid-value={isInvalidValue ? "true" : undefined}
          density={density}
          className={cn(
            width === "fill" ? "w-full" : "w-fit",
            "min-w-0",
            className,
          )}
        >
          <SelectValue placeholder={displayPlaceholder} />
        </SelectTrigger>
        <SelectContent
          align={align}
          className={cn(contentWidthClassName(contentWidth), contentClassName)}
        >
          {renderedOptions.length ? (
            <SelectGroup>{renderedOptions}</SelectGroup>
          ) : (
            <div className="px-3 py-2 text-r2 text-[color:var(--text-subtle)]">
              {emptyLabel ?? placeholder}
            </div>
          )}
        </SelectContent>
      </Select>
    );
  },
);

SelectField.displayName = "SelectField";
