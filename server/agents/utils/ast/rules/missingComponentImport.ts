import path from "path";
import ts from "typescript";
import { parseCode, shouldProcessFile, walk } from "../parser.js";
import type { ASTIssue, ASTRule, RuleContext } from "../types.js";

const RULE_NAME = "missing-component-import";
const BUILTIN_JSX_NAMES = new Set(["Fragment", "React"]);

function stripExtension(filePath: string): string {
  return filePath.replace(/\.(tsx|ts|jsx|js)$/, "");
}

function normalizeImportPath(importPath: string): string {
  return importPath.replace(/\\/g, "/");
}

function buildRelativeImport(fromFile: string, toFile: string): string {
  const fromDir = path.posix.dirname(fromFile);
  const target = stripExtension(toFile);
  let relative = path.posix.relative(fromDir, target);
  if (!relative.startsWith(".")) {
    relative = `./${relative}`;
  }
  return normalizeImportPath(relative);
}

function getComponentFiles(allFiles: Record<string, string>): Map<string, string> {
  const componentFiles = new Map<string, string>();

  for (const filePath of Object.keys(allFiles)) {
    const match = /^\/components\/([A-Z][A-Za-z0-9_$]*)\.(tsx|jsx)$/.exec(
      filePath,
    );
    if (match) {
      componentFiles.set(match[1], filePath);
    }
  }

  return componentFiles;
}

function getUsedJsxNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  walk(sourceFile, (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName;
      if (ts.isIdentifier(tagName) && /^[A-Z]/.test(tagName.text)) {
        names.add(tagName.text);
      }
    }
  });

  return names;
}

function getDefinedNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  walk(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.name) names.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          names.add(element.name.text);
        }
      }
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        names.add(clause.namedBindings.name.text);
      }
    }

    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
  });

  return names;
}

function getImportInsertPosition(code: string): number {
  const importPattern = /^import[\s\S]*?;\s*$/gm;
  let lastImportEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(code)) !== null) {
    lastImportEnd = match.index + match[0].length;
  }

  return lastImportEnd;
}

export const missingComponentImportRule: ASTRule = {
  name: RULE_NAME,
  description:
    "Adds missing imports for generated local components referenced in JSX.",

  check(code: string, fileName: string, context: RuleContext): ASTIssue[] {
    if (!shouldProcessFile(fileName)) return [];

    const sourceFile = parseCode(code, fileName);
    const usedJsxNames = getUsedJsxNames(sourceFile);
    const definedNames = getDefinedNames(sourceFile);
    const componentFiles = getComponentFiles(context.allFiles);
    const issues: ASTIssue[] = [];

    for (const name of usedJsxNames) {
      if (BUILTIN_JSX_NAMES.has(name)) continue;
      if (definedNames.has(name)) continue;

      const componentFile = componentFiles.get(name);
      if (!componentFile || componentFile === fileName) continue;

      issues.push({
        type: "missing-import",
        rule: RULE_NAME,
        file: fileName,
        line: 1,
        column: 1,
        message: `Component "${name}" is used but not imported`,
        fixDescription: `Import ${name} from ${buildRelativeImport(
          fileName,
          componentFile,
        )}`,
      });
    }

    return issues;
  },

  fix(
    code: string,
    fileName: string,
    issues: ASTIssue[],
    context: RuleContext,
  ): string {
    if (issues.length === 0) return code;

    const componentFiles = getComponentFiles(context.allFiles);
    const importLines = issues
      .map((issue) => {
        const match = /Component "([^"]+)"/.exec(issue.message);
        const componentName = match?.[1];
        const componentFile = componentName
          ? componentFiles.get(componentName)
          : undefined;
        if (!componentName || !componentFile) return null;

        return `import ${componentName} from "${buildRelativeImport(
          fileName,
          componentFile,
        )}";`;
      })
      .filter((line): line is string => Boolean(line));

    if (importLines.length === 0) return code;

    const insertAt = getImportInsertPosition(code);
    const uniqueImportBlock = [...new Set(importLines)].join("\n");

    if (insertAt === 0) {
      return `${uniqueImportBlock}\n${code}`;
    }

    return `${code.slice(0, insertAt)}\n${uniqueImportBlock}${code.slice(
      insertAt,
    )}`;
  },
};
