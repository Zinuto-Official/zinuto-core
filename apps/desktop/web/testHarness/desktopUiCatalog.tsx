// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

import { APP_PORTAL_ROOT_ID } from "../src/ui/primitives/portalContainer";
import { Button } from "../src/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../src/ui/primitives/card";
import { Checkbox } from "../src/ui/primitives/checkbox";
import { Input } from "../src/ui/primitives/input";
import { SegmentedControl } from "../src/ui/primitives/segmented-control";
import { Slider } from "../src/ui/primitives/slider";
import { Switch } from "../src/ui/primitives/switch";
import { Textarea } from "../src/ui/primitives/textarea";
import { ThemeToggle } from "../src/ui/primitives/theme-toggle";
import { ThemeProvider } from "../src/ui/theme/ThemeProvider";
import type { ThemeMode } from "../src/ui/theme/themeTokens";
import { buildGlobalVisualCssVariables } from "../src/ui/theme/visualColors";
import "../src/styles/index.css";

const resolveTheme = (): Exclude<ThemeMode, "system"> =>
  new URLSearchParams(window.location.search).get("theme") === "dark"
    ? "dark"
    : "light";

const DesktopUiCatalog = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveTheme);
  const theme = themeMode === "system" ? resolveTheme() : themeMode;
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [segment, setSegment] = useState("one");
  const [sliderValue, setSliderValue] = useState("42");
  const style = useMemo(
    () => ({
      ...buildGlobalVisualCssVariables(theme, "RED_UP_GREEN_DOWN", "INSTITUTIONAL"),
      minHeight: "100vh",
    }),
    [theme],
  );

  return (
    <ThemeProvider mode={themeMode} resolvedMode={theme}>
      <main
        className={`app-root theme-${theme} price-scheme-red-up font-size-standard p-8`}
        style={style}
      >
        <div className="mx-auto grid max-w-[960px] gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Zinuto Core UI catalog</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-3">
                <Button>Primary action</Button>
                <Button variant="secondary">Secondary action</Button>
                <Button variant="ghost">Quiet action</Button>
                <Button variant="destructive">Destructive action</Button>
              </div>
              <Input aria-label="Example input" placeholder="Example input" />
              <Textarea aria-label="Example notes" placeholder="Example notes" rows={4} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Local controls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={checked}
                  onChange={(event) => setChecked(event.currentTarget.checked)}
                />
                <span>Keep local workspace history</span>
              </label>
              <div className="flex items-center justify-between gap-4">
                <span>Enable local diagnostics</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
              <div className="grid gap-2">
                <span>Theme transition</span>
                <ThemeToggle
                  value={themeMode}
                  onChange={setThemeMode}
                  labels={{
                    light: "Light mode",
                    dark: "Dark mode",
                    system: "System mode",
                  }}
                />
              </div>
              <SegmentedControl
                value={segment}
                onChange={setSegment}
                options={[
                  { value: "one", label: "One" },
                  { value: "two", label: "Two" },
                  { value: "three", label: "Three" },
                ]}
              />
              <Slider
                aria-label="Example value"
                value={sliderValue}
                onChange={(event) => setSliderValue(event.currentTarget.value)}
                min={0}
                max={100}
              />
            </CardContent>
          </Card>
        </div>
        <div id={APP_PORTAL_ROOT_ID} className="app-portal-root" />
      </main>
    </ThemeProvider>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <DesktopUiCatalog />,
);
