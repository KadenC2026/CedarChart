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
  gir_attribute?: string;
  hass_attribute?: string;
  communication_requirement?: string;
  equivalent_subjects?: string[];
  title: string;
  description?: string;
  total_units?: number;
  prerequisites?: string;
  corequisites?: string;
  schedule?: string;
  offered_fall?: boolean;
  offered_IAP?: boolean;
  offered_spring?: boolean;
  offered_summer?: boolean;
  level?: "U" | "G";
  rating?: number;
  enrollment_number?: number;
  in_class_hours?: number;
  out_of_class_hours?: number;
  is_historical?: boolean;
  not_offered_year?: string;
  url?: string;
};

export type PlannedCourse = {
  courseId: string;
  title: string;
  units?: number;
  term: number;
};

export type PriorityTier = "required" | "preferred";

/** A subject the student wants to take, ranked by position in the list. */
export type PriorityCourse = {
  courseId: string;
  tier: PriorityTier;
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
  priorCredits: PriorCredit[];
  selectedCourseId: string | null;
  highlightedCourseIds: string[];
  targetCourseId: string | null;
  interestQuery: string;
  careerGoal: string;
  recommendations: InterestSearchResult[];
  plannedCourses: PlannedCourse[];
  hiddenMapCourseIds: string[];
  priorityCourses: PriorityCourse[];
  selectedRequirementId: string | null;
};

export type PriorCredit = { courseId: string; source: "prior" | "ase" };
export type RequirementThreshold = { type: "LT" | "GT" | "LTE" | "GTE"; cutoff: number; criterion: "subjects" | "units" };
export type Requirement = {
  "list-id"?: string;
  "short-title"?: string;
  "medium-title"?: string;
  "title-no-degree"?: string;
  title?: string;
  desc?: string;
  req?: string;
  "plain-string"?: boolean;
  reqs?: Requirement[];
  "connection-type"?: "all" | "any";
  threshold?: RequirementThreshold;
  "distinct-threshold"?: RequirementThreshold;
  "threshold-desc"?: string;
};
export type CatalogData = { courses: RemoteCourse[]; requirements: Record<string, Requirement>; importedAt: string };
