import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type {
  AppState,
  InterestSearchResult,
  PlannedCourse,
  PriorCredit,
  PriorityCourse,
  PriorityTier,
  StudentYear,
} from "../domain/types";
import { useAuth } from "../auth/AuthContext";
import { firebaseDb } from "../auth/firebase";

type Action =
  | { type: "SELECT_COURSE"; courseId: string }
  | { type: "SHOW_ON_MAP"; courseId: string }
  | { type: "OPEN_PATHWAY"; courseId: string }
  | { type: "TOGGLE_COMPLETED"; courseId: string }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_CAREER_GOAL"; careerGoal: string }
  | { type: "SET_BACKGROUND_EXPERIENCE"; backgroundExperience: string }
  | { type: "SET_STUDENT_YEAR"; studentYear: StudentYear }
  | { type: "SET_RECOMMENDATIONS"; results: InterestSearchResult[] }
  | { type: "ADD_PLANNED_COURSE"; course: PlannedCourse }
  | { type: "REMOVE_PLANNED_COURSE"; courseId: string; term: number }
  | { type: "REPLACE_PLANNED_COURSE"; courseId: string; term: number; replacement: PlannedCourse }
  | { type: "MOVE_PLANNED_COURSE"; courseId: string; fromTerm: number; toTerm: number }
  | { type: "SET_MAP_COURSE_VISIBILITY"; courseIds: string[]; visible: boolean }
  | { type: "SET_REQUIREMENT"; requirementId: string | null }
  | { type: "SET_PRIOR_CREDIT"; credit: PriorCredit }
  | { type: "REMOVE_PRIOR_CREDIT"; courseId: string }
  | { type: "TOGGLE_INSTRUCTOR_PERMISSION"; courseId: string }
  | { type: "TOGGLE_INSTRUCTOR_PERMISSION_CHOICE"; choiceId: string }
  | { type: "TOGGLE_INSTRUCTOR_PERMISSION_PREREQUISITE"; prerequisiteId: string }
  | { type: "ADD_PRIORITY_COURSE"; course: PriorityCourse }
  | { type: "REMOVE_PRIORITY_COURSE"; courseId: string }
  | { type: "MOVE_PRIORITY_COURSE"; courseId: string; direction: -1 | 1 }
  | { type: "SET_PRIORITY_TIER"; courseId: string; tier: PriorityTier }
  | { type: "CLEAR_PRIORITY_COURSES" }
  | { type: "REPLACE_STATE"; state: AppState }
  | { type: "RESET" };

const initialState: AppState = {
  completedCourseIds: [],
  priorCredits: [],
  instructorPermissionCourseIds: [],
  instructorPermissionChoiceIds: [],
  instructorPermissionPrerequisiteIds: [],
  selectedCourseId: null,
  highlightedCourseIds: [],
  targetCourseId: null,
  interestQuery: "",
  careerGoal: "",
  backgroundExperience: "",
  recommendations: [],
  plannedCourses: [],
  hiddenMapCourseIds: [],
  priorityCourses: [],
  selectedRequirementId: null,
  studentYear: "unspecified",
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
    case "SET_CAREER_GOAL":
      return { ...state, careerGoal: action.careerGoal };
    case "SET_BACKGROUND_EXPERIENCE":
      return { ...state, backgroundExperience: action.backgroundExperience };
    case "SET_STUDENT_YEAR":
      return { ...state, studentYear: action.studentYear };
    case "SET_RECOMMENDATIONS":
      return { ...state, recommendations: action.results, highlightedCourseIds: action.results.map((r) => r.courseId) };
    case "ADD_PLANNED_COURSE": {
      const exists = state.plannedCourses.some(
        (course) => course.courseId === action.course.courseId && course.term === action.course.term,
      );
      return exists ? state : {
        ...state,
        plannedCourses: [...state.plannedCourses, action.course],
        hiddenMapCourseIds: state.hiddenMapCourseIds.filter((id) => id !== action.course.courseId),
      };
    }
    case "REMOVE_PLANNED_COURSE": {
      const plannedCourses = state.plannedCourses.filter(
        (course) => !(course.courseId === action.courseId && course.term === action.term),
      );
      return {
        ...state,
        plannedCourses,
        hiddenMapCourseIds: plannedCourses.some((course) => course.courseId === action.courseId)
          ? state.hiddenMapCourseIds
          : state.hiddenMapCourseIds.filter((id) => id !== action.courseId),
      };
    }
    case "REPLACE_PLANNED_COURSE": {
      const original = state.plannedCourses.find(
        (course) => course.courseId === action.courseId && course.term === action.term,
      );
      if (!original || original.courseId === action.replacement.courseId) return state;
      if (state.plannedCourses.some(
        (course) => course.courseId === action.replacement.courseId && course.term === action.term,
      )) return state;
      const plannedCourses = state.plannedCourses.map((course) =>
        course === original ? action.replacement : course,
      );
      const originalStillPlanned = plannedCourses.some((course) => course.courseId === original.courseId);
      return {
        ...state,
        plannedCourses,
        hiddenMapCourseIds: state.hiddenMapCourseIds
          .filter((id) => id !== action.replacement.courseId)
          .filter((id) => originalStillPlanned || id !== original.courseId),
      };
    }
    case "MOVE_PLANNED_COURSE":
      return {
        ...state,
        plannedCourses: state.plannedCourses.map((course) =>
          course.courseId === action.courseId && course.term === action.fromTerm
            ? { ...course, term: action.toTerm }
            : course,
        ),
      };
    case "SET_MAP_COURSE_VISIBILITY": {
      const affected = new Set(action.courseIds);
      return {
        ...state,
        hiddenMapCourseIds: action.visible
          ? state.hiddenMapCourseIds.filter((id) => !affected.has(id))
          : [...new Set([...state.hiddenMapCourseIds, ...action.courseIds])],
      };
    }
    case "SET_REQUIREMENT":
      return { ...state, selectedRequirementId: action.requirementId };
    case "SET_PRIOR_CREDIT":
      return { ...state, priorCredits: [...state.priorCredits.filter(c => c.courseId !== action.credit.courseId), action.credit] };
    case "REMOVE_PRIOR_CREDIT":
      return { ...state, priorCredits: state.priorCredits.filter(c => c.courseId !== action.courseId) };
    case "TOGGLE_INSTRUCTOR_PERMISSION": {
      const recorded = state.instructorPermissionCourseIds.includes(action.courseId);
      return {
        ...state,
        instructorPermissionCourseIds: recorded
          ? state.instructorPermissionCourseIds.filter((id) => id !== action.courseId)
          : [...state.instructorPermissionCourseIds, action.courseId],
      };
    }
    case "TOGGLE_INSTRUCTOR_PERMISSION_CHOICE": {
      const recorded = state.instructorPermissionChoiceIds.includes(action.choiceId);
      return {
        ...state,
        instructorPermissionChoiceIds: recorded
          ? state.instructorPermissionChoiceIds.filter((id) => id !== action.choiceId)
          : [...state.instructorPermissionChoiceIds, action.choiceId],
      };
    }
    case "TOGGLE_INSTRUCTOR_PERMISSION_PREREQUISITE": {
      const recorded = state.instructorPermissionPrerequisiteIds.includes(action.prerequisiteId);
      return {
        ...state,
        instructorPermissionPrerequisiteIds: recorded
          ? state.instructorPermissionPrerequisiteIds.filter((id) => id !== action.prerequisiteId)
          : [...state.instructorPermissionPrerequisiteIds, action.prerequisiteId],
      };
    }
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
    case "REPLACE_STATE":
      return action.state;
    case "RESET":
      return initialState;
  }
}

export type SyncStatus = "local" | "loading" | "saving" | "synced" | "error";

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  syncStatus: SyncStatus;
} | null>(null);
const STORAGE_KEY = "cedar-state";
const LEGACY_STORAGE_KEY = "cedarchart-state";
const USER_CACHE_PREFIX = "cedar-user-state:";

function restoredState(value: unknown): AppState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return initialState;
  return { ...initialState, ...(value as Partial<AppState>) };
}

function readCachedUserState(key: string) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? restoredState(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState, (base) => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      return saved ? restoredState(JSON.parse(saved)) : base;
    } catch {
      return base;
    }
  });
  const [cloudReadyUid, setCloudReadyUid] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const stateRef = useRef(state);
  const previousUidRef = useRef<string | null | undefined>(undefined);
  const guestStateRef = useRef(state);
  const restoringGuestRef = useRef(false);
  stateRef.current = state;

  useEffect(() => {
    if (authLoading) return;
    const uid = user?.uid ?? null;
    if (!uid) {
      setCloudReadyUid(null);
      setSyncStatus("local");
      if (previousUidRef.current) {
        restoringGuestRef.current = true;
        dispatch({ type: "REPLACE_STATE", state: guestStateRef.current });
      }
      previousUidRef.current = null;
      return;
    }

    previousUidRef.current = uid;
    const signedInUid = uid;
    const cloudDb = firebaseDb;
    setCloudReadyUid(null);
    setSyncStatus("loading");
    let cancelled = false;

    async function loadCloudState() {
      if (!cloudDb) return;
      try {
        const reference = doc(cloudDb, "users", signedInUid);
        const snapshot = await getDoc(reference);
        if (cancelled) return;
        if (snapshot.exists() && snapshot.data().state) {
          dispatch({ type: "REPLACE_STATE", state: restoredState(snapshot.data().state) });
        } else {
          await setDoc(reference, { state: stateRef.current, updatedAt: serverTimestamp() }, { merge: true });
        }
        if (!cancelled) {
          setCloudReadyUid(uid);
          setSyncStatus("synced");
        }
      } catch {
        if (cancelled) return;
        const cached = readCachedUserState(`${USER_CACHE_PREFIX}${signedInUid}`);
        if (cached) dispatch({ type: "REPLACE_STATE", state: cached });
        setSyncStatus("error");
      }
    }

    void loadCloudState();
    return () => { cancelled = true; };
  }, [authLoading, user?.uid]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      if (restoringGuestRef.current) {
        restoringGuestRef.current = false;
        return;
      }
      guestStateRef.current = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    localStorage.setItem(`${USER_CACHE_PREFIX}${user.uid}`, JSON.stringify(state));
  }, [authLoading, state, user]);

  useEffect(() => {
    const cloudDb = firebaseDb;
    if (!cloudDb || !user || cloudReadyUid !== user.uid) return;
    const uid = user.uid;
    setSyncStatus("saving");
    const timeout = window.setTimeout(() => {
      setDoc(doc(cloudDb, "users", uid), { state, updatedAt: serverTimestamp() }, { merge: true })
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [cloudReadyUid, state, user]);

  return <AppContext.Provider value={{ state, dispatch, syncStatus }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}
