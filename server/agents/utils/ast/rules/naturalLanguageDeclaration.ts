import type { ASTIssue, ASTRule, RuleContext } from "../types.js";

const RULE_NAME = "natural-language-declaration";

const BAD_DECLARATION_PATTERN =
  /^(\s*)(?:the|a|an)\s+([A-Za-z_$][\w$]*)\s*=/gm;

export const naturalLanguageDeclarationRule: ASTRule = {
  name: RULE_NAME,
  description:
    "Fix accidental English articles before variable declarations, such as `the items = ...`.",

  check(code: string, fileName: string, _context: RuleContext): ASTIssue[] {
    const issues: ASTIssue[] = [];
    const lines = code.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const match = /^(\s*)(?:the|a|an)\s+([A-Za-z_$][\w$]*)\s*=/.exec(
        lines[index],
      );

      if (!match) continue;

      issues.push({
        type: "syntax",
        rule: RULE_NAME,
        file: fileName,
        line: index + 1,
        column: match[1].length + 1,
        message: `Accidental article before variable declaration "${match[2]}"`,
        fixDescription: "Replace the article with const",
      });
    }

    return issues;
  },

  fix(
    code: string,
    _fileName: string,
    issues: ASTIssue[],
    _context: RuleContext,
  ): string {
    if (issues.length === 0) return code;
    return code.replace(BAD_DECLARATION_PATTERN, "$1const $2 =");
  },
};
