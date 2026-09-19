import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type { AppState, InterestSearchResult } from "../domain/types";

type Action =
  | { type: "SELECT_COURSE"; courseId: string }
  | { type: "SHOW_ON_MAP"; courseId: string }
  | { type: "OPEN_PATHWAY"; courseId: string }
  | { type: "TOGGLE_COMPLETED"; courseId: string }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_RECOMMENDATIONS"; results: InterestSearchResult[] }
  | { type: "RESET" };

const initialState: AppState = {
  completedCourseIds: [],
  selectedCourseId: null,
  highlightedCourseIds: [],
  targetCourseId: null,
  interestQuery: "",
  recommendations: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SELECT_COURSE":
      return { ...state, selectedCourseId: action.courseId };
    case "SHOW_ON_MAP":
      return {
        ...state,
        selectedCourseId: action.courseId,
        highlightedCourseIds: [action.courseId],
      };
    case "OPEN_PATHWAY":
      return {
        ...state,
        selectedCourseId: action.courseId,
        targetCourseId: action.courseId,
      };
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
      return {
        ...state,
        recommendations: action.results,
        highlightedCourseIds: action.results.map((result) => result.courseId),
      };
    case "RESET":
      return initialState;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    reducer,
    initialState,
    (base) => {
      try {
        const saved = localStorage.getItem("cedarchart-state");
        return saved ? { ...base, ...JSON.parse(saved) } : base;
      } catch {
        return base;
      }
    },
  );

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
