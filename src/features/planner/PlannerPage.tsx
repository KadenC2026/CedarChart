import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RemoteCourse } from "../../domain/types";
import { useCatalog } from "../../data/catalog";
import { earnedCourseIds, evaluateRequirement, isArchivedRequirement, localId, requirementLabel } from "../../domain/requirements";
import RequirementChecklist from "./RequirementChecklist";
import PriorCreditPanel from "./PriorCreditPanel";
import { plannerTerms as terms } from "../../domain/terms";
import { useApp } from "../../state/AppContext";


export default function PlannerPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { data, error: catalogError, retry } = useCatalog();
  const catalog = data?.courses ?? [];
  const requirements = data?.requirements ?? {};
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const [activeTerm, setActiveTerm] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const earned = earnedCourseIds(state);
  const planned = new Set(state.plannedCourses.map(c => localId(c.courseId)));
  const catalogMap = useMemo(() => new Map(catalog.map(c => [c.subject_id, c])), [catalog]);
  const selectedRequirement = state.selectedRequirementId ? requirements[state.selectedRequirementId] : undefined;
  const progress = selectedRequirement ? evaluateRequirement(selectedRequirement, earned, catalogMap) : null;
  const projected = selectedRequirement ? evaluateRequirement(selectedRequirement, new Set([...earned, ...planned]), catalogMap) : null;

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return catalog;
    return catalog
      .filter((course) =>
        course.subject_id.toLowerCase().includes(normalized) ||
        course.title.toLowerCase().includes(normalized) ||
        (course.description ?? "").toLowerCase().includes(normalized),
      );
  }, [catalog, query]);

  const requirementOptions = useMemo(() =>
    Object.entries(requirements)
      .filter(([id, meta]) => (id.startsWith("major") || id.startsWith("minor")) && (showArchived || !isArchivedRequirement(meta)))
      .map(([id, meta]) => ({ id, label: requirementLabel(meta) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  [requirements, showArchived]);

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
    <section className="planner-page planner-workspace-page">
      <div className="planner-compact-header">
        <div>
          <div className="eyebrow">Your MIT road</div>
          <h1>Plan your classes</h1>
        </div>
        <p>Search courses, track requirements, and build your four-year road without leaving this workspace.</p>
      </div>

      <div className="planner-dashboard">
        <aside className="catalog-search-panel planner-pane planner-catalog-pane">
          <div className="pane-heading">
            <strong>Course catalog</strong>
            <span>Add to {terms[activeTerm]}</span>
          </div>
          <label htmlFor="course-search">Add a course</label>
          <input
            id="course-search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setLimit(30); }}
            placeholder="Search 6.3900, linear algebra, climate…"
          />
          <select aria-label="Term to add courses to" value={activeTerm} onChange={(event) => setActiveTerm(Number(event.target.value))}>
            {terms.map((term, index) => <option value={index} key={term}>{term}</option>)}
          </select>

          {!data && !catalogError && <p className="supporting">Loading MIT catalog…</p>}
          {catalogError && <p className="error-note">{catalogError} <button onClick={retry}>Retry</button></p>}
          {data && <p className="data-note">{catalog.length.toLocaleString()} imported subjects · {matches.length.toLocaleString()} matches · Updated {new Date(data.importedAt).toLocaleDateString()}</p>}
          <div className="catalog-results">
            {matches.slice(0, limit).map((course) => (
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
          {matches.length > limit && <button className="text-button" onClick={() => setLimit(n => n + 30)}>Show more subjects</button>}
          {data && !matches.length && <p>No subjects match your search.</p>}
        </aside>

        <main className="planner-pane planner-road-pane">
          <div className="road-pane-heading">
            <div>
              <strong>Four-year road</strong>
              <span>Click an empty term to make it the add destination</span>
            </div>
            <span>{state.plannedCourses.length} planned course{state.plannedCourses.length === 1 ? "" : "s"}</span>
          </div>
          <div className="road-grid compact-road-grid">
            {terms.map((term, termIndex) => {
              const planned = state.plannedCourses.filter((course) => course.term === termIndex);
              const units = planned.reduce((sum, course) => sum + (course.units ?? 0), 0);
              return (
                <article className={`term-card ${activeTerm === termIndex ? "active-term" : ""}`} key={term}>
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
                        <label className="planned-completed" title="Mark completed"><input type="checkbox" aria-label={`Completed ${course.courseId}`} checked={earned.has(localId(course.courseId))}
                          disabled={state.priorCredits.some(c => localId(c.courseId) === localId(course.courseId))}
                          onChange={() => dispatch({ type: "TOGGLE_COMPLETED", courseId: `mit:${localId(course.courseId)}` })} /></label>
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
        </main>

        <aside className="planner-pane planner-right-pane">
          <div className="requirements-panel">
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

          <label className="check-row archived-toggle"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show older programs</label>
          {selectedRequirement && progress && projected && <>
            <div className="requirement-summary" aria-live="polite">
              <strong>{requirementLabel(selectedRequirement)}</strong>
              <div className="progress-track" role="progressbar" aria-label="Completed requirements" aria-valuenow={Math.round(progress.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-fill" style={{ width: `${progress.fraction * 100}%` }} />
              </div>
              <span>{Math.round(progress.fraction * 100)}% completed · {Math.round(projected.fraction * 100)}% including planned</span>
              <small>Planning estimate from imported requirements. Checked subjects and prior credit count as completed; scheduled classes count only as planned.</small>
              {progress.review && <small>Some electives or special rules require advisor review and are not automatically marked complete.</small>}
            </div>
            <div className="requirements-checklist"><RequirementChecklist requirement={selectedRequirement} catalog={catalogMap} earned={earned} planned={planned} /></div>
          </>}
          {state.selectedRequirementId && data && !selectedRequirement && <p className="error-note">This saved program is no longer available. Choose a program above.</p>}

          </div>
          <div className="planner-credit-wrap">
            <PriorCreditPanel catalog={catalog} />
          </div>
        </aside>
      </div>
    </section>
  );
}
