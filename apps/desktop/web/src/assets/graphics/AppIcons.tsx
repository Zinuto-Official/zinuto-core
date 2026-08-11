// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentType, SVGProps } from "react";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoldIcon,
  CalendarIcon,
  ChartCandlestickIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  CloudIcon,
  Code2Icon,
  CircleHelp,
  CircleIcon,
  DatabaseIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileCheck2Icon,
  FlagIcon,
  FolderCheckIcon,
  FolderOpenIcon,
  Globe2Icon,
  HeartIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HighlighterIcon,
  ItalicIcon,
  Link2Icon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  QuoteIcon,
  RotateCcwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  StarIcon,
  Table2Icon,
  Trash2Icon,
  TypeIcon,
  UnderlineIcon,
  XIcon,
} from "lucide-react";
import {
  APP_ICON_CONFIG,
  DRAW_TOOL_ICON_FALLBACK,
  DRAW_TOOL_ICON_PATHS,
  type AppIconName,
  type DrawToolIconName,
  type IconVariant,
  type SvgIconConfig,
} from "@/assets/graphics/iconRegistry";
type SvgIconProps = Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">;
type VendorIconProps = SVGProps<SVGSVGElement>;

export type VendorIconName =
  | "alertTriangle"
  | "arrowRight"
  | "bold"
  | "calendar"
  | "chartCandlestick"
  | "check"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "chevronUp"
  | "circleAlert"
  | "circleCheck"
  | "clock"
  | "cloud"
  | "code2"
  | "circle"
  | "circleHelp"
  | "database"
  | "download"
  | "eye"
  | "eyeOff"
  | "fileCheck"
  | "flag"
  | "folderCheck"
  | "folderOpen"
  | "globe2"
  | "heading1"
  | "heading2"
  | "heading3"
  | "highlight"
  | "heart"
  | "italic"
  | "link2"
  | "list"
  | "listChecks"
  | "listOrdered"
  | "loaderCircle"
  | "minus"
  | "pencil"
  | "plus"
  | "quote"
  | "rotateCcw"
  | "settings2"
  | "shield"
  | "star"
  | "table"
  | "trash2"
  | "type"
  | "underline"
  | "x";

const DEFAULT_SVG_CONFIG: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const TOOL_SVG_CONFIG: SVGProps<SVGSVGElement> = {
  ...DEFAULT_SVG_CONFIG,
  className: "tool-icon-svg",
};

const ICON_STYLE_CONFIG: Record<IconVariant, SVGProps<SVGSVGElement>> = {
  default: DEFAULT_SVG_CONFIG,
  tool: TOOL_SVG_CONFIG,
};

const mergeClassName = (...names: Array<string | undefined>) => {
  const normalized = names.filter(Boolean);
  return normalized.length ? normalized.join(" ") : undefined;
};

const VENDOR_ICON_COMPONENTS: Record<
  VendorIconName,
  ComponentType<VendorIconProps>
> = {
  alertTriangle: AlertTriangleIcon,
  arrowRight: ArrowRightIcon,
  bold: BoldIcon,
  calendar: CalendarIcon,
  chartCandlestick: ChartCandlestickIcon,
  check: CheckIcon,
  chevronDown: ChevronDownIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  chevronUp: ChevronUpIcon,
  circleAlert: CircleAlertIcon,
  circleCheck: CircleCheckIcon,
  clock: ClockIcon,
  cloud: CloudIcon,
  code2: Code2Icon,
  circle: CircleIcon,
  circleHelp: CircleHelp,
  database: DatabaseIcon,
  download: DownloadIcon,
  eye: EyeIcon,
  eyeOff: EyeOffIcon,
  fileCheck: FileCheck2Icon,
  flag: FlagIcon,
  folderCheck: FolderCheckIcon,
  folderOpen: FolderOpenIcon,
  globe2: Globe2Icon,
  heart: HeartIcon,
  heading1: Heading1Icon,
  heading2: Heading2Icon,
  heading3: Heading3Icon,
  highlight: HighlighterIcon,
  italic: ItalicIcon,
  link2: Link2Icon,
  list: ListIcon,
  listChecks: ListChecksIcon,
  listOrdered: ListOrderedIcon,
  loaderCircle: LoaderCircleIcon,
  minus: MinusIcon,
  pencil: PencilIcon,
  plus: PlusIcon,
  quote: QuoteIcon,
  rotateCcw: RotateCcwIcon,
  settings2: Settings2Icon,
  shield: ShieldCheckIcon,
  star: StarIcon,
  table: Table2Icon,
  trash2: Trash2Icon,
  type: TypeIcon,
  underline: UnderlineIcon,
  x: XIcon,
};

const renderIcon = (
  config: SvgIconConfig,
  props: SvgIconProps,
  iconName?: string,
) => {
  const { className, ...restProps } = props;
  const baseConfig = ICON_STYLE_CONFIG[config.variant ?? "default"];
  return (
    <svg
      {...baseConfig}
      {...restProps}
      data-icon-name={iconName}
      viewBox={config.viewBox ?? baseConfig.viewBox}
      className={mergeClassName(baseConfig.className, className)}
    >
      {config.paths}
    </svg>
  );
};

export const AppIcon = ({
  name,
  ...props
}: { name: AppIconName } & SvgIconProps) =>
  renderIcon(APP_ICON_CONFIG[name], props, name);

const isDrawToolKey = (
  tool: string,
): tool is keyof typeof DRAW_TOOL_ICON_PATHS =>
  Object.prototype.hasOwnProperty.call(DRAW_TOOL_ICON_PATHS, tool);

export const DrawToolIcon = ({
  tool,
  ...props
}: { tool: DrawToolIconName } & SvgIconProps) => {
  const normalizedTool = String(tool);
  const iconPaths = isDrawToolKey(normalizedTool)
    ? DRAW_TOOL_ICON_PATHS[normalizedTool]
    : DRAW_TOOL_ICON_FALLBACK;
  return renderIcon({ variant: "tool", paths: iconPaths }, props);
};

export const VendorIcon = ({
  name,
  ...props
}: { name: VendorIconName } & VendorIconProps) => {
  const IconComponent = VENDOR_ICON_COMPONENTS[name];
  return (
    <IconComponent
      {...props}
      data-vendor-icon-name={name}
      aria-hidden={props["aria-hidden"] ?? true}
    />
  );
};

export type { AppIconName };
