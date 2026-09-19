export type PrerequisiteRule =
  | { type: "course"; courseId: string }
  | { type: "all"; children: PrerequisiteRule[] }
  | { type: "any"; children: PrerequisiteRule[] }
  | { type: "permission"; text: string }
  | { type: "unknown"; text: string };

export type Course = {
  id: string;
  schoolId: string;
  localCourseId: string;
  aliases: string[];
  title: string;
  description: string;
  department: string;
  units?: string;
  offerings?: string[];
  prerequisiteRule: PrerequisiteRule;
  corequisiteRule?: PrerequisiteRule;
  sourceUrl: string;
  catalogYear: string;
  verifiedAt: string;
  dataStatus: "verified" | "illustrative" | "needs_review";
};

export type InterestSearchResult = {
  courseId: string;
  relevanceExplanation: string;
  supportingCatalogText: string;
  recommendationMethod: "AI" | "curated" | "keyword";
};

export type EvaluationResult = {
  status: "satisfied" | "missing" | "needs_review";
  missingCourseIds: string[];
  explanation: string;
  supportingSourceUrls: string[];
};

export type AppState = {
  completedCourseIds: string[];
  selectedCourseId: string | null;
  highlightedCourseIds: string[];
  targetCourseId: string | null;
  interestQuery: string;
  recommendations: InterestSearchResult[];
};
