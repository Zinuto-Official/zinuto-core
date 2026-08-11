// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";

export const SUPPORTED_SCAFFOLDS = [
  "desktop-page",
  "desktop-workspace",
  "desktop-component",
  "local-api-route",
  "quality-check",
];

const PUBLIC_LOCALES = ["en", "zh-CN", "ja", "ko", "es"];

const upperFirst = (value) => value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

const splitName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);

export const toKebabCase = (value) =>
  splitName(value)
    .map((part) => part.toLowerCase())
    .join("-");

export const toPascalCase = (value) =>
  splitName(value)
    .map((part) => upperFirst(part.toLowerCase()))
    .join("");

export const toCamelCase = (value) => {
  const pascal = toPascalCase(value);
  return pascal ? `${pascal[0].toLowerCase()}${pascal.slice(1)}` : "";
};

const assertName = (name) => {
  const pascal = toPascalCase(name);
  if (!pascal || !/^[A-Z][A-Za-z0-9]*$/u.test(pascal)) {
    throw new Error("Missing or invalid --name. Use an ASCII feature name, for example --name RiskSummary.");
  }
  return {
    kebab: toKebabCase(name),
    pascal,
    camel: toCamelCase(name),
  };
};

const assertOwner = (owner, allowed, scaffold) => {
  const normalizedOwner = String(owner ?? allowed[0]).trim();
  if (!allowed.includes(normalizedOwner)) {
    throw new Error(
      `${scaffold} --owner must be one of: ${allowed.join(", ")}.`,
    );
  }
  return normalizedOwner;
};

const text = (lines) => `${lines.join("\n")}\n`;

const desktopComponentPath = ({ owner, names }) => {
  if (owner === "ui") {
    return `apps/desktop/web/src/ui/components/${names.kebab}/${names.pascal}.tsx`;
  }
  if (owner === "workspace") {
    return `apps/desktop/web/src/workspaces/${names.kebab}/${names.pascal}.tsx`;
  }
  return `apps/desktop/web/src/domains/${names.kebab}/${names.pascal}.tsx`;
};

const buildDesktopComponent = ({ names, owner }) => ({
  path: desktopComponentPath({ names, owner }),
  content: text([
    'import type { ReactNode } from "react";',
    "",
    `export type ${names.pascal}Props = {`,
    "  children?: ReactNode;",
    "};",
    "",
    `export const ${names.pascal} = ({ children }: ${names.pascal}Props) => (`,
    `  <section className="${names.kebab}" data-component="${names.kebab}">`,
    "    {children}",
    "  </section>",
    ");",
  ]),
});

const buildDesktopTest = ({ names, folder = "ui" }) => ({
  path: `apps/desktop/web/tests/${folder}/${names.kebab}.test.tsx`,
  content: text([
    'import assert from "node:assert/strict";',
    'import test from "node:test";',
    "",
    `test("${names.kebab} scaffold keeps owner and test wiring explicit", () => {`,
    `  assert.equal("${names.pascal}".length > 0, true);`,
    "});",
  ]),
});

const buildI18nSeed = ({ names }) => ({
  path: `tools/gen/generated-copy/${names.kebab}.json`,
  content: `${JSON.stringify(
    Object.fromEntries(
      PUBLIC_LOCALES.map((locale) => [
        locale,
        {
          title: `${names.pascal} title`,
          description: `${names.pascal} description`,
        },
      ]),
    ),
    null,
    2,
  )}\n`,
});

const buildScaffoldMetadata = ({ names, options, files }) => {
  const sourceFiles = files
    .map((file) => file.path)
    .filter((filePath) => !/\/tests?\//u.test(filePath) && !/\.test\./u.test(filePath))
    .filter((filePath) => !filePath.startsWith("tools/gen/generated-copy/"));
  const testFiles = files
    .map((file) => file.path)
    .filter((filePath) => /\/tests?\//u.test(filePath) || /\.test\./u.test(filePath));
  const ownerRoots = {
    "desktop-page": options.owner === "domain"
      ? `apps/desktop/web/src/domains/${names.kebab}`
      : `apps/desktop/web/src/workspaces/${names.kebab}`,
    "desktop-workspace": `apps/desktop/web/src/workspaces/${names.kebab}`,
    "desktop-component": path.dirname(desktopComponentPath({ names, owner: options.owner ?? "domain" })),
    "local-api-route": `apps/desktop/local-api/src/application/${names.kebab}`,
    "quality-check": "tools/quality",
  };
  const verifyFiles = files
    .map((file) => file.path)
    .filter((filePath) => !filePath.startsWith("tools/gen/generated-copy/"));
  return {
    defaultLineBudget: 120,
    i18nStrategy: sourceFiles.some((filePath) => filePath.endsWith(".tsx")) ? "five-locale seed" : "none",
    nextCommands: verifyFiles.length > 0
      ? [`npm run check:fast -- --files ${verifyFiles.join(" ")}`]
      : [],
    ownerRoot: ownerRoots[options.scaffold] ?? "",
    sourceFiles,
    testFiles,
    verifyFiles,
  };
};

const scaffoldBuilders = {
  "desktop-page": ({ names, options }) => {
    const owner = assertOwner(options.owner, ["workspace", "domain"], "desktop-page");
    const root =
      owner === "domain"
        ? `apps/desktop/web/src/domains/${names.kebab}`
        : `apps/desktop/web/src/workspaces/${names.kebab}`;
    return [
      {
        path: `${root}/${names.pascal}Page.tsx`,
        content: text([
          'import { WorkspacePageShell } from "@/ui/components";',
          "",
          `export type ${names.pascal}PageProps = {`,
          "  isActive: boolean;",
          "};",
          "",
          `export const ${names.pascal}Page = ({ isActive }: ${names.pascal}PageProps) => (`,
          '  <WorkspacePageShell isActive={isActive}>',
          `    <section className="${names.kebab}-page" data-page="${names.kebab}" />`,
          "  </WorkspacePageShell>",
          ");",
        ]),
      },
      buildDesktopTest({ names, folder: "ui" }),
      buildI18nSeed({ names }),
    ];
  },
  "desktop-workspace": ({ names }) => [
    {
      path: `apps/desktop/web/src/workspaces/${names.kebab}/${names.pascal}WorkspacePage.tsx`,
      content: text([
        'import { WorkspacePageShell } from "@/ui/components";',
        `import { build${names.pascal}WorkspaceModel } from "./${names.camel}WorkspaceModel";`,
        "",
        `export type ${names.pascal}WorkspacePageProps = {`,
        "  isActive: boolean;",
        "};",
        "",
        `export const ${names.pascal}WorkspacePage = ({ isActive }: ${names.pascal}WorkspacePageProps) => {`,
        `  const model = build${names.pascal}WorkspaceModel();`,
        "  return (",
        "    <WorkspacePageShell isActive={isActive}>",
        `      <section className="${names.kebab}-workspace" data-workspace={model.id} />`,
        "    </WorkspacePageShell>",
        "  );",
        "};",
      ]),
    },
    {
      path: `apps/desktop/web/src/workspaces/${names.kebab}/${names.camel}WorkspaceModel.ts`,
      content: text([
        `export const ${names.camel}WorkspaceId = "${names.kebab}";`,
        "",
        `export const build${names.pascal}WorkspaceModel = () => ({`,
        `  id: ${names.camel}WorkspaceId,`,
        "});",
      ]),
    },
    buildDesktopTest({ names, folder: "ui" }),
    buildI18nSeed({ names }),
  ],
  "desktop-component": ({ names, options }) => {
    const owner = assertOwner(options.owner, ["domain", "workspace", "ui"], "desktop-component");
    return [
      buildDesktopComponent({ names, owner }),
      buildDesktopTest({ names, folder: "ui" }),
      buildI18nSeed({ names }),
    ];
  },
  "local-api-route": ({ names }) => [
    {
      path: `apps/desktop/local-api/src/application/${names.kebab}/${names.camel}Handler.ts`,
      content: text([
        `export type ${names.pascal}Request = {`,
        "  readonly requestId: string;",
        "};",
        "",
        `export type ${names.pascal}Result = {`,
        '  readonly status: "READY";',
        "};",
        "",
        `export const handle${names.pascal} = (_request: ${names.pascal}Request): ${names.pascal}Result => ({`,
        '  status: "READY",',
        "});",
      ]),
    },
    {
      path: `apps/desktop/local-api/src/http/${names.camel}Controller.ts`,
      content: text([
        `import { handle${names.pascal} } from "../application/${names.kebab}/${names.camel}Handler";`,
        "",
        `export const ${names.camel}Controller = {`,
        `  handle: handle${names.pascal},`,
        "};",
      ]),
    },
    {
      path: `apps/desktop/local-api/src/http/${names.camel}Routes.ts`,
      content: text([
        `import { ${names.camel}Controller } from "./${names.camel}Controller";`,
        "",
        `export const ${names.camel}Routes = [`,
        "  {",
        `    id: "${names.kebab}",`,
        `    controller: ${names.camel}Controller,`,
        "  },",
        "];",
      ]),
    },
    {
      path: `apps/desktop/local-api/src/http/apiSchemas/${names.camel}Schemas.ts`,
      content: text([
        `export const ${names.camel}SchemaId = "${names.kebab}";`,
      ]),
    },
    {
      path: `apps/desktop/local-api/tests/app/${names.kebab}.test.ts`,
      content: text([
        'import assert from "node:assert/strict";',
        'import test from "node:test";',
        "",
        `test("${names.kebab} handler keeps the application owner explicit", () => {`,
        `  assert.equal("${names.camel}".length > 0, true);`,
        "});",
      ]),
    },
  ],
  "quality-check": ({ names }) => [
    {
      path: `tools/quality/check-${names.kebab}.mjs`,
      content: text([
        "#!/usr/bin/env node",
        "",
        `const CHECK_PREFIX = "[check-${names.kebab}]";`,
        "",
        `console.log(\`${"${CHECK_PREFIX}"} OK\`);`,
      ]),
    },
    {
      path: `tools/quality/check-${names.kebab}.test.mjs`,
      content: text([
        'import assert from "node:assert/strict";',
        'import test from "node:test";',
        "",
        `test("check-${names.kebab} scaffold has a stable id", () => {`,
        `  assert.equal("check-${names.kebab}".startsWith("check-"), true);`,
        "});",
      ]),
    },
  ],
};

export const parseScaffoldArgs = (argv) => {
  const [scaffold, ...rest] = argv;
  const options = {
    scaffold,
    root: process.cwd(),
    force: false,
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
};

export const resolveScaffoldFiles = (options) => {
  if (!SUPPORTED_SCAFFOLDS.includes(options.scaffold)) {
    throw new Error(`Unknown scaffold "${options.scaffold ?? ""}". Supported: ${SUPPORTED_SCAFFOLDS.join(", ")}.`);
  }
  const names = assertName(options.name);
  return scaffoldBuilders[options.scaffold]({ names, options });
};

export const resolveScaffoldPlan = (options) => {
  if (!SUPPORTED_SCAFFOLDS.includes(options.scaffold)) {
    throw new Error(`Unknown scaffold "${options.scaffold ?? ""}". Supported: ${SUPPORTED_SCAFFOLDS.join(", ")}.`);
  }
  const names = assertName(options.name);
  const files = scaffoldBuilders[options.scaffold]({ names, options });
  const metadata = buildScaffoldMetadata({ names, options, files });
  return { files, metadata };
};

export const writeScaffoldFiles = (files, options) => {
  const root = path.resolve(options.root);
  const written = [];
  for (const file of files) {
    const absolutePath = path.resolve(root, file.path);
    if (!absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Refusing to write outside root: ${file.path}`);
    }
    if (!options.force && fs.existsSync(absolutePath)) {
      throw new Error(`Refusing to overwrite existing file: ${file.path}`);
    }
    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, file.content, "utf8");
    }
    written.push(file.path);
  }
  return written;
};

export const formatScaffoldSummary = (files, options) => {
  const action = options.dryRun ? "would create" : "created";
  return [`[gen] ${action} ${files.length} ${options.scaffold} file(s):`, ...files.map((file) => `- ${file.path}`)].join("\n");
};
