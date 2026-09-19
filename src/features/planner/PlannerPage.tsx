import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RemoteCourse } from "../../domain/types";
import { useApp } from "../../state/AppContext";

const terms = [
  "Year 1 · Fall", "Year 1 · IAP", "Year 1 · Spring",
  "Year 2 · Fall", "Year 2 · IAP", "Year 2 · Spring",
  "Year 3 · Fall", "Year 3 · IAP", "Year 3 · Spring",
  "Year 4 · Fall", "Year 4 · IAP", "Year 4 · Spring",
];

type RequirementMeta = Record<string, string | number | boolean | null | undefined>;

export default function PlannerPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<RemoteCourse[]>([]);
  const [requirements, setRequirements] = useState<Record<string, RequirementMeta>>({});
  const [requirementProgress, setRequirementProgress] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeTerm, setActiveTerm] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/catalog").then((response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json();
      }),
      fetch("/api/requirements").then((response) => response.ok ? response.json() : {}),
    ])
      .then(([courses, reqs]) => {
        setCatalog(Array.isArray(courses) ? courses : []);
        setRequirements(reqs && typeof reqs === "object" ? reqs : {});
      })
      .catch(() => setCatalogError("The MIT catalog could not be loaded."))
      .finally(() => setLoadingCatalog(false));
  }, []);

  useEffect(() => {
    if (!state.selectedRequirementId) {
      setRequirementProgress(null);
      return;
    }

    const courseIds = Array.from(new Set([
      ...state.completedCourseIds.map((id) => id.replace(/^mit:/, "")),
      ...state.plannedCourses.map((course) => course.courseId),
    ]));

    const params = new URLSearchParams({
      listId: state.selectedRequirementId,
      courses: courseIds.join(","),
    });

    fetch("/api/requirement-progress?" + params.toString())
      .then((response) => response.ok ? response.json() : null)
      .then(setRequirementProgress)
      .catch(() => setRequirementProgress(null));
  }, [state.selectedRequirementId, state.plannedCourses, state.completedCourseIds]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return catalog
      .filter((course) =>
        course.subject_id.toLowerCase().includes(normalized) ||
        course.title.toLowerCase().includes(normalized) ||
        (course.description ?? "").toLowerCase().includes(normalized),
      )
      .slice(0, 30);
  }, [catalog, query]);

  const requirementOptions = useMemo(() =>
    Object.entries(requirements)
      .map(([id, meta]) => ({
        id,
        label: String(
          meta["medium-title"] ??
          meta["title-no-degree"] ??
          meta.title ??
          meta["short-title"] ??
          id
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  [requirements]);

  function addCourse(course: RemoteCourse) {
    dispatch({
      type: "ADD_PLANNED_COURSE",
      course: {
        courseId: course.subject_id,
        title: course.title,
        units: course.total_units,
        term: activeTerm,
      },
    });
  }

  function openProgression(courseId: string) {
    const id = "mit:" + courseId;
    dispatch({ type: "OPEN_PATHWAY", courseId: id });
    navigate("/course/" + encodeURIComponent(id));
  }

  return (
    <section className="page planner-page">
      <div className="planner-heading">
        <div className="eyebrow">Your MIT road</div>
        <h1>Plan your classes. Open a progression when a course matters.</h1>
        <p className="lede">
          Search the current MIT catalog, place subjects into a four-year plan,
          track a major or minor, and open a generated course progression without editing the graph itself.
        </p>
      </div>

      <div className="planner-tools">
        <div className="catalog-search-panel">
          <label htmlFor="course-search">Add a course</label>
          <input
            id="course-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search 6.3900, linear algebra, climate…"
          />
          <select value={activeTerm} onChange={(event) => setActiveTerm(Number(event.target.value))}>
            {terms.map((term, index) => <option value={index} key={term}>{term}</option>)}
          </select>

          {loadingCatalog && <p className="supporting">Loading MIT catalog…</p>}
          {catalogError && <p className="error-note">{catalogError}</p>}
          <div className="catalog-results">
            {matches.map((course) => (
              <div className="catalog-result" key={course.subject_id}>
                <button className="course-result-main" onClick={() => openProgression(course.subject_id)}>
                  <strong>{course.subject_id}</strong>
                  <span>{course.title}</span>
                  <small>{course.total_units ? String(course.total_units) + " units" : ""}</small>
                </button>
                <button className="add-course-button" onClick={() => addCourse(course)}>+ Add</button>
              </div>
            ))}
          </div>
        </div>

        <aside className="requirements-panel">
          <label htmlFor="requirement-select">Track a major or minor</label>
          <select
            id="requirement-select"
            value={state.selectedRequirementId ?? ""}
            onChange={(event) => dispatch({ type: "SET_REQUIREMENT", requirementId: event.target.value || null })}
          >
            <option value="">Choose requirements…</option>
            {requirementOptions.map((option) => (
              <option value={option.id} key={option.id}>{option.label}</option>
            ))}
          </select>

          {requirementProgress && (
            <div className="requirement-summary">
              <strong>{requirementProgress.title ?? requirementProgress["medium-title"] ?? "Requirement progress"}</strong>
              {typeof requirementProgress.percent_fulfilled === "number" && (
                <>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: String(Math.min(100, requirementProgress.percent_fulfilled)) + "%" }}
                    />
                  </div>
                  <span>{Math.round(requirementProgress.percent_fulfilled)}% fulfilled</span>
                </>
              )}
              <small>Calculated from this road using FireRoad requirement data.</small>
            </div>
          )}
        </aside>
      </div>

      <div className="road-grid">
        {terms.map((term, termIndex) => {
          const planned = state.plannedCourses.filter((course) => course.term === termIndex);
          const units = planned.reduce((sum, course) => sum + (course.units ?? 0), 0);
          return (
            <article className="term-card" key={term}>
              <div className="term-heading">
                <h2>{term}</h2>
                <span>{units} units</span>
              </div>
              <div className="term-courses">
                {planned.map((course) => (
                  <div className="planned-course" key={course.courseId}>
                    <button onClick={() => openProgression(course.courseId)}>
                      <strong>{course.courseId}</strong>
                      <span>{course.title}</span>
                    </button>
                    <button
                      className="remove-course"
                      aria-label={"Remove " + course.courseId}
                      onClick={() => dispatch({ type: "REMOVE_PLANNED_COURSE", courseId: course.courseId, term: termIndex })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!planned.length && (
                  <button className="empty-term" onClick={() => setActiveTerm(termIndex)}>
                    + Add a course
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
