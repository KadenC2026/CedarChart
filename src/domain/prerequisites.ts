import type { EvaluationResult, PrerequisiteRule } from "./types";

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
