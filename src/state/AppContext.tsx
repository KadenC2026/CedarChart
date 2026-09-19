import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type {
  AppState,
  InterestSearchResult,
  PlannedCourse,
  PriorCredit,
  PriorityCourse,
  PriorityTier,
} from "../domain/types";

type Action =
  | { type: "SELECT_COURSE"; courseId: string }
  | { type: "SHOW_ON_MAP"; courseId: string }
  | { type: "OPEN_PATHWAY"; courseId: string }
  | { type: "TOGGLE_COMPLETED"; courseId: string }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_RECOMMENDATIONS"; results: InterestSearchResult[] }
  | { type: "ADD_PLANNED_COURSE"; course: PlannedCourse }
  | { type: "REMOVE_PLANNED_COURSE"; courseId: string; term: number }
  | { type: "MOVE_PLANNED_COURSE"; courseId: string; fromTerm: number; toTerm: number }
  | { type: "SET_REQUIREMENT"; requirementId: string | null }
  | { type: "SET_PRIOR_CREDIT"; credit: PriorCredit }
  | { type: "REMOVE_PRIOR_CREDIT"; courseId: string }
  | { type: "ADD_PRIORITY_COURSE"; course: PriorityCourse }
  | { type: "REMOVE_PRIORITY_COURSE"; courseId: string }
  | { type: "MOVE_PRIORITY_COURSE"; courseId: string; direction: -1 | 1 }
  | { type: "SET_PRIORITY_TIER"; courseId: string; tier: PriorityTier }
  | { type: "CLEAR_PRIORITY_COURSES" }
  | { type: "RESET" };

const initialState: AppState = {
  completedCourseIds: [],
  priorCredits: [],
  selectedCourseId: null,
  highlightedCourseIds: [],
  targetCourseId: null,
  interestQuery: "",
  recommendations: [],
  plannedCourses: [],
  priorityCourses: [],
  selectedRequirementId: null,
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SELECT_COURSE":
      return { ...state, selectedCourseId: action.courseId };
    case "SHOW_ON_MAP":
      return { ...state, selectedCourseId: action.courseId, highlightedCourseIds: [action.courseId] };
    case "OPEN_PATHWAY":
      return { ...state, selectedCourseId: action.courseId, targetCourseId: action.courseId };
    case "TOGGLE_COMPLETED": {
      const has = state.completedCourseIds.includes(action.courseId);
      return {
        ...state,
        completedCourseIds: has
          ? state.completedCourseIds.filter((id) => id !== action.courseId)
          : [...state.completedCourseIds, action.courseId],
      };
    }
    case "SET_QUERY":
      return { ...state, interestQuery: action.query };
    case "SET_RECOMMENDATIONS":
      return { ...state, recommendations: action.results, highlightedCourseIds: action.results.map((r) => r.courseId) };
    case "ADD_PLANNED_COURSE": {
      const exists = state.plannedCourses.some(
        (course) => course.courseId === action.course.courseId && course.term === action.course.term,
      );
      return exists ? state : { ...state, plannedCourses: [...state.plannedCourses, action.course] };
    }
    case "REMOVE_PLANNED_COURSE":
      return {
        ...state,
        plannedCourses: state.plannedCourses.filter(
          (course) => !(course.courseId === action.courseId && course.term === action.term),
        ),
      };
    case "MOVE_PLANNED_COURSE":
      return {
        ...state,
        plannedCourses: state.plannedCourses.map((course) =>
          course.courseId === action.courseId && course.term === action.fromTerm
            ? { ...course, term: action.toTerm }
            : course,
        ),
      };
    case "SET_REQUIREMENT":
      return { ...state, selectedRequirementId: action.requirementId };
    case "SET_PRIOR_CREDIT":
      return { ...state, priorCredits: [...state.priorCredits.filter(c => c.courseId !== action.credit.courseId), action.credit] };
    case "REMOVE_PRIOR_CREDIT":
      return { ...state, priorCredits: state.priorCredits.filter(c => c.courseId !== action.courseId) };
    case "ADD_PRIORITY_COURSE": {
      const exists = state.priorityCourses.some(c => c.courseId === action.course.courseId);
      return exists ? state : { ...state, priorityCourses: [...state.priorityCourses, action.course] };
    }
    case "REMOVE_PRIORITY_COURSE":
      return { ...state, priorityCourses: state.priorityCourses.filter(c => c.courseId !== action.courseId) };
    case "MOVE_PRIORITY_COURSE": {
      const index = state.priorityCourses.findIndex(c => c.courseId === action.courseId);
      const target = index + action.direction;
      if (index < 0 || target < 0 || target >= state.priorityCourses.length) return state;
      const priorityCourses = [...state.priorityCourses];
      [priorityCourses[index], priorityCourses[target]] = [priorityCourses[target], priorityCourses[index]];
      return { ...state, priorityCourses };
    }
    case "SET_PRIORITY_TIER":
      return {
        ...state,
        priorityCourses: state.priorityCourses.map(c =>
          c.courseId === action.courseId ? { ...c, tier: action.tier } : c,
        ),
      };
    case "CLEAR_PRIORITY_COURSES":
      return { ...state, priorityCourses: [] };
    case "RESET":
      return initialState;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (base) => {
    try {
      const saved = localStorage.getItem("cedarchart-state");
      return saved ? { ...base, ...JSON.parse(saved) } : base;
    } catch {
      return base;
    }
  });

  useEffect(() => {
    localStorage.setItem("cedarchart-state", JSON.stringify(state));
  }, [state]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}
