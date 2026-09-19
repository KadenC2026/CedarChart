import type { AppState, RemoteCourse, Requirement } from "./types";
import { earnedCourseIds, localId, requirementSubjects } from "./requirements";
import { referencesCourse } from "./progression";

export type NextCourseRecommendation = {
  course: RemoteCourse;
  score: number;
  relationship: "required-next" | "recommended-next" | "related-direction";
  reasons: string[];
};

const STOPWORDS = new Set([
  "and","the","for","with","from","into","this","that","using","course","introduction",
  "principles","topics","methods","applications","study","analysis","advanced","students",
]);

function tokens(text: string) {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !STOPWORDS.has(token)),
  );
}

function overlapScoreFromTokens(a: Set<string>, text: string) {
  const b = tokens(text);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function departmentOf(subjectId: string) {
  return subjectId.split(".")[0];
}

export function recommendNextCourses({
  current,
  catalog,
  requirements,
  state,
  interests = "",
  limit = 12,
}: {
  current: RemoteCourse;
  catalog: RemoteCourse[];
  requirements: Record<string, Requirement>;
  state: Pick<AppState, "completedCourseIds" | "priorCredits" | "plannedCourses" | "selectedRequirementId">;
  interests?: string;
  limit?: number;
}): NextCourseRecommendation[] {
  const earned = earnedCourseIds(state);
  const planned = new Set(state.plannedCourses.map((course) => localId(course.courseId)));
  const excluded = new Set([...earned, ...planned, current.subject_id, ...(current.equivalent_subjects ?? [])]);

  const selectedRequirement = state.selectedRequirementId
    ? requirements[state.selectedRequirementId]
    : undefined;
  const requirementSet = new Set(selectedRequirement ? requirementSubjects(selectedRequirement) : []);

  const currentTokens = tokens([current.title, current.description ?? ""].join(" "));
  const interestTokens = tokens(interests);
  const currentDepartment = departmentOf(current.subject_id);

  return catalog
    .filter((candidate) => !excluded.has(candidate.subject_id))
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];

      const directUnlock = referencesCourse(candidate.prerequisites, current);
      if (directUnlock) {
        score += 45;
        reasons.push("This course explicitly builds on your current course.");
      }

      if (requirementSet.has(candidate.subject_id)) {
        score += 38;
        reasons.push("It appears in your selected major/minor requirements.");
      }

      if (departmentOf(candidate.subject_id) === currentDepartment) {
        score += 12;
        reasons.push("It continues within the same department.");
      }

      const candidateText = [candidate.title, candidate.description ?? ""].join(" ");
      const similarity = overlapScoreFromTokens(currentTokens, candidateText);
      if (similarity > 0) {
        score += similarity * 28;
        if (similarity >= 0.18) {
          reasons.push("Its topics are closely related to what you are studying now.");
        }
      }

      if (interestTokens.size) {
        const candidateTokens = tokens(candidateText);
        let interestOverlap = 0;
        for (const token of interestTokens) {
          if (candidateTokens.has(token)) interestOverlap += 1;
        }
        if (interestOverlap) {
          score += Math.min(24, interestOverlap * 8);
          reasons.push("It matches your stated interests.");
        }
      }

      const relationship: NextCourseRecommendation["relationship"] =
        directUnlock
          ? "required-next"
          : requirementSet.has(candidate.subject_id) || similarity >= 0.12
            ? "recommended-next"
            : "related-direction";

      return { course: candidate, score, relationship, reasons };
    })
    .filter((recommendation) => recommendation.score >= 10)
    .sort((a, b) => b.score - a.score || a.course.subject_id.localeCompare(b.course.subject_id, undefined, { numeric: true }))
    .slice(0, limit);
}
