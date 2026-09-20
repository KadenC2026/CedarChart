import type { EvaluationResult, PrerequisiteRule } from "./types";

export type CatalogPrerequisiteExpression =
  | { type: "token"; value: string }
  | { type: "all" | "any"; children: CatalogPrerequisiteExpression[] };

function tokenizeCatalogPrerequisites(value: string) {
  const normalized = value.replace(/\s+and\s+/gi, ",").replace(/\s+or\s+/gi, "/");
  const tokens: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const pair = normalized.slice(index, index + 2);
    if (pair === "''") {
      quoted = !quoted;
      current += pair;
      index += 1;
      continue;
    }
    const character = normalized[index];
    if (!quoted && ["(", ")", ",", "/"].includes(character)) {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(character);
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/** MIT catalog prerequisite strings use commas for AND and slashes for OR. */
export function parseCatalogPrerequisites(value: string): CatalogPrerequisiteExpression | null {
  const tokens = tokenizeCatalogPrerequisites(value);
  let cursor = 0;

  const parsePrimary = (): CatalogPrerequisiteExpression | null => {
    const token = tokens[cursor];
    if (!token) return null;
    if (token === "(") {
      cursor += 1;
      const expression = parseAny();
      if (tokens[cursor] === ")") cursor += 1;
      return expression;
    }
    if ([")", ",", "/"].includes(token)) return null;
    cursor += 1;
    return { type: "token", value: token };
  };

  const parseAll = (): CatalogPrerequisiteExpression | null => {
    const children: CatalogPrerequisiteExpression[] = [];
    const first = parsePrimary();
    if (first) children.push(first);
    while (tokens[cursor] === ",") {
      cursor += 1;
      const child = parsePrimary();
      if (child) children.push(child);
    }
    if (!children.length) return null;
    return children.length === 1 ? children[0] : { type: "all", children };
  };

  const parseAny = (): CatalogPrerequisiteExpression | null => {
    const children: CatalogPrerequisiteExpression[] = [];
    const first = parseAll();
    if (first) children.push(first);
    while (tokens[cursor] === "/") {
      cursor += 1;
      const child = parseAll();
      if (child) children.push(child);
    }
    if (!children.length) return null;
    return children.length === 1 ? children[0] : { type: "any", children };
  };

  return parseAny();
}

export function evaluatePrerequisite(
  rule: PrerequisiteRule,
  completedCourseIds: Set<string>,
): EvaluationResult {
  if (rule.type === "course") {
    const ok = completedCourseIds.has(rule.courseId);
    return {
      status: ok ? "satisfied" : "missing",
      missingCourseIds: ok ? [] : [rule.courseId],
      explanation: ok ? "Completed." : "Course still required.",
      supportingSourceUrls: [],
    };
  }

  if (rule.type === "permission") {
    return {
      status: "needs_review",
      missingCourseIds: [],
      explanation: rule.text,
      supportingSourceUrls: [],
    };
  }

  if (rule.type === "unknown") {
    return {
      status: "needs_review",
      missingCourseIds: [],
      explanation: rule.text,
      supportingSourceUrls: [],
    };
  }

  const children = rule.children.map((child) =>
    evaluatePrerequisite(child, completedCourseIds),
  );

  if (rule.type === "all") {
    const needsReview = children.some((child) => child.status === "needs_review");
    const missing = children.flatMap((child) => child.missingCourseIds);
    const satisfied = children.every((child) => child.status === "satisfied");
    return {
      status: satisfied ? "satisfied" : needsReview ? "needs_review" : "missing",
      missingCourseIds: [...new Set(missing)],
      explanation: satisfied
        ? "All prerequisite conditions are satisfied."
        : "Every branch in this group is required.",
      supportingSourceUrls: [],
    };
  }

  const satisfied = children.some((child) => child.status === "satisfied");
  if (satisfied) {
    return {
      status: "satisfied",
      missingCourseIds: [],
      explanation: "At least one alternative is satisfied.",
      supportingSourceUrls: [],
    };
  }

  const allNeedReview = children.every((child) => child.status === "needs_review");
  return {
    status: allNeedReview ? "needs_review" : "missing",
    missingCourseIds: [...new Set(children.flatMap((child) => child.missingCourseIds))],
    explanation: "Complete at least one alternative in this group.",
    supportingSourceUrls: [],
  };
}
