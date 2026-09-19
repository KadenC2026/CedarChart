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

function overlapScore(a: string, b: string) {
  const aa = tokens(a);
  const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  const overlap = [...aa].filter((token) => bb.has(token)).length;
  return overlap / Math.max(aa.size, bb.size);
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

  const currentText = [current.title, current.description ?? ""].join(" ");
  const interestTokens = tokens(interests);

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

      if (departmentOf(candidate.subject_id) === departmentOf(current.subject_id)) {
        score += 12;
        reasons.push("It continues within the same department.");
      }

      const similarity = overlapScore(
        currentText,
        [candidate.title, candidate.description ?? ""].join(" "),
      );
      if (similarity > 0) {
        score += similarity * 28;
        if (similarity >= 0.18) reasons.push("Its topics are closely related to what you are studying now.");
      }

      if (interestTokens.size) {
        const candidateTokens = tokens([candidate.title, candidate.description ?? ""].join(" "));
        const interestOverlap = [...interestTokens].filter((token) => candidateTokens.has(token)).length;
        if (interestOverlap) {
          score += Math.min(24, interestOverlap * 8);
          reasons.push("It matches your stated interests.");
        }
      }

      const downstreamCount = catalog.filter((later) => referencesCourse(later.prerequisites, candidate)).length;
      if (downstreamCount > 0) {
        score += Math.min(12, downstreamCount * 1.5);
        if (downstreamCount >= 3) reasons.push("It keeps several later-course options open.");
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
