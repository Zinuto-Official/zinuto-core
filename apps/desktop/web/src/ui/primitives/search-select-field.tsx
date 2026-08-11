// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { cn } from "@/ui/cn";
import { Input } from "@/ui/primitives/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/primitives/select";
import type { SelectFieldOption } from "@/ui/primitives/select-field";

type SearchSelectFieldContentWidth = "trigger" | "min-trigger" | "content";

type SearchSelectFieldProps = Omit<
  ComponentPropsWithoutRef<typeof SelectTrigger>,
  "children" | "defaultValue" | "onChange" | "value"
> & {
  options: readonly SelectFieldOption[];
  value?: string;
  defaultValue?: string;
  onValueChange: (value: string) => void;
  placeholder?: ReactNode;
  searchPlaceholder: string;
  emptyLabel?: ReactNode;
  density?: "compact" | "default" | "large";
  width?: "fill" | "fit";
  contentWidth?: SearchSelectFieldContentWidth;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  maxVisibleOptions?: number;
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

const contentWidthClassName = (contentWidth: SearchSelectFieldContentWidth) => {
  if (contentWidth === "trigger") {
    return "w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]";
  }
  if (contentWidth === "content") {
    return "w-max min-w-[var(--radix-select-trigger-width)]";
  }
  return "w-[var(--radix-select-trigger-width)] min-w-[max(var(--radix-select-trigger-width),15rem)]";
};

export const SearchSelectField = ({
  id,
  className,
  contentClassName,
  align = "center",
  contentWidth = "trigger",
  title,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  density = "default",
  width = "fill",
  maxVisibleOptions = 500,
  "aria-label": ariaLabel,
  ...triggerProps
}: SearchSelectFieldProps) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { tokenByValue, valueByToken } = useMemo(
    () => buildTokenMaps(options),
    [options],
  );
  const isControlled = value !== undefined;
  const selectedValue = isControlled ? value : uncontrolledValue;
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
  const isDisabled = disabled || options.length === 0;

  const filteredOptions = useMemo(() => {
    const keyword = searchValue.trim().toUpperCase();
    const sourceOptions = keyword
      ? options.filter((option) => {
          const label =
            option.textValue ??
            (typeof option.label === "string" ? option.label : option.value);
          return (
            option.value.toUpperCase().includes(keyword) ||
            String(label).toUpperCase().includes(keyword)
          );
        })
      : options;
    return sourceOptions.slice(0, maxVisibleOptions);
  }, [maxVisibleOptions, options, searchValue]);

  const resolveFirstSelectableOption = useCallback(
    (rawSearchValue: string) => {
      const keyword = rawSearchValue.trim().toUpperCase();
      const sourceOptions = keyword
        ? options.filter((option) => {
            const label =
              option.textValue ??
              (typeof option.label === "string" ? option.label : option.value);
            return (
              option.value.toUpperCase().includes(keyword) ||
              String(label).toUpperCase().includes(keyword)
            );
          })
        : options;
      return (
        sourceOptions
          .slice(0, maxVisibleOptions)
          .find((option) => !option.disabled) ?? null
      );
    },
    [maxVisibleOptions, options],
  );

  const matchedOptionsCount = useMemo(() => {
    const keyword = searchValue.trim().toUpperCase();
    if (!keyword) {
      return options.length;
    }
    return options.reduce((count, option) => {
      const label =
        option.textValue ??
        (typeof option.label === "string" ? option.label : option.value);
      return option.value.toUpperCase().includes(keyword) ||
        String(label).toUpperCase().includes(keyword)
        ? count + 1
        : count;
    }, 0);
  }, [options, searchValue]);

  const commitValue = useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }
      onValueChange(nextValue);
      setSearchValue("");
      setOpen(false);
    },
    [isControlled, onValueChange],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setSearchValue("");
    }
    setOpen(nextOpen);
  }, []);

  const handleValueChange = useCallback(
    (nextToken: string) => {
      const nextValue = valueByToken.get(nextToken);
      if (nextValue === undefined) {
        return;
      }
      commitValue(nextValue);
    },
    [commitValue, valueByToken],
  );

  return (
    <Select
      value={encodedValue ?? ""}
      open={open}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      disabled={isDisabled}
    >
      <SelectTrigger
        {...triggerProps}
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
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === "Enter") {
            const currentSearchValue =
              searchInputRef.current?.value ?? searchValue;
            if (!currentSearchValue.trim()) {
              return;
            }
            const nextOption =
              resolveFirstSelectableOption(currentSearchValue);
            if (!nextOption) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            commitValue(nextOption.value);
          }
        }}
      >
        <div
          className="sticky top-[-4px] z-10 bg-[color:var(--ui-float-bg)] px-1 pb-1"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== "Escape") {
              event.stopPropagation();
            }
          }}
        >
          <Input
            ref={searchInputRef}
            type="text"
            density="compact"
            value={searchValue}
            maxLength={INPUT_LIMITS.searchQueryChars}
            onChange={(event) => setSearchValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                return;
              }
              if (event.key === "Enter") {
                event.stopPropagation();
                const nextOption = resolveFirstSelectableOption(
                  event.currentTarget.value,
                );
                if (nextOption) {
                  event.preventDefault();
                  commitValue(nextOption.value);
                }
                return;
              }
              event.stopPropagation();
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {filteredOptions.map((option) => {
          const token = tokenByValue.get(option.value);
          if (!token) {
            return null;
          }
          return (
            <SelectItem
              key={token}
              value={token}
              disabled={option.disabled}
              textValue={
                option.textValue ??
                (typeof option.label === "string" ? option.label : option.value)
              }
            >
              {option.label}
            </SelectItem>
          );
        })}
        {!matchedOptionsCount ? (
          <div className="px-3 py-2 text-r2 text-[color:var(--text-subtle)]">
            {emptyLabel ?? placeholder}
          </div>
        ) : null}
      </SelectContent>
    </Select>
  );
};
