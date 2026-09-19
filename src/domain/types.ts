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

export type RemoteCourse = {
  subject_id: string;
  title: string;
  description?: string;
  total_units?: number;
  prerequisites?: string;
  corequisites?: string;
  offered_fall?: boolean;
  offered_IAP?: boolean;
  offered_spring?: boolean;
  offered_summer?: boolean;
  level?: "U" | "G";
  rating?: number;
  in_class_hours?: number;
  out_of_class_hours?: number;
};

export type PlannedCourse = {
  courseId: string;
  title: string;
  units?: number;
  term: number;
};

export type InterestSearchResult = {
  courseId: string;
  relevanceExplanation: string;
  supportingCatalogText: string;
  recommendationMethod: "AI" | "curated" | "keyword";
  title?: string;
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
  plannedCourses: PlannedCourse[];
  selectedRequirementId: string | null;
};
