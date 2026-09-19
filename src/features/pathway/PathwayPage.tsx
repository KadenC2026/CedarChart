import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { courseById } from "../../data/mitCatalog";
import { evaluatePrerequisite } from "../../domain/prerequisites";
import type { PrerequisiteRule } from "../../domain/types";
import { useApp } from "../../state/AppContext";

function RuleTree({
  rule,
  completed,
  toggle,
}: {
  rule: PrerequisiteRule;
  completed: Set<string>;
  toggle: (courseId: string) => void;
}) {
  if (rule.type === "course") {
    const course = courseById.get(rule.courseId);
    const done = completed.has(rule.courseId);
    return (
      <div className={`path-course ${done ? "done" : ""}`}>
        <div>
          <strong>{course?.localCourseId ?? rule.courseId}</strong>
          <span>{course?.title ?? "Course"}</span>
        </div>
        <button onClick={() => toggle(rule.courseId)}>
          {done ? "Completed ✓" : "Mark complete"}
        </button>
      </div>
    );
  }

  if (rule.type === "permission" || rule.type === "unknown") {
    return (
      <div className="review-rule">
        <strong>{rule.type === "permission" ? "Permission required" : "Needs review"}</strong>
        <span>{rule.text}</span>
      </div>
    );
  }

  return (
    <div className="rule-group">
      <div className={`rule-label ${rule.type}`}>{rule.type === "all" ? "AND" : "OR"}</div>
      <div className="rule-children">
        {rule.children.length === 0 ? (
          <div className="no-prereq">No listed prerequisites.</div>
        ) : (
          rule.children.map((child, index) => (
            <RuleTree key={index} rule={child} completed={completed} toggle={toggle} />
          ))
        )}
      </div>
    </div>
  );
}

export default function PathwayPage() {
  const { courseId } = useParams();
  const { state, dispatch } = useApp();
  const decoded = courseId ? decodeURIComponent(courseId) : "";
  const target = courseById.get(decoded);
  const completed = useMemo(() => new Set(state.completedCourseIds), [state.completedCourseIds]);

  if (!target) {
    return (
      <section className="page">
        <h1>Course not found</h1>
        <Link to="/explore">Return to catalog</Link>
      </section>
    );
  }

  const evaluation = evaluatePrerequisite(target.prerequisiteRule, completed);

  return (
    <section className="page pathway-page">
      <Link className="back-link" to="/explore">← Back to catalog</Link>
      <div className="target-card">
        <div className="eyebrow">Destination course</div>
        <div className="course-number">{target.localCourseId}</div>
        <h1>{target.title}</h1>
        <p>{target.description}</p>
        <div className={`status-banner ${evaluation.status}`}>
          {evaluation.status === "satisfied" && "Listed prerequisites satisfied"}
          {evaluation.status === "missing" && "You still have listed prerequisites to complete"}
          {evaluation.status === "needs_review" && "Some requirements need manual review"}
        </div>
      </div>

      <div className="pathway-grid">
        <div className="pathway-visual">
          <h2>Prerequisite structure</h2>
          <RuleTree
            rule={target.prerequisiteRule}
            completed={completed}
            toggle={(id) => dispatch({ type: "TOGGLE_COMPLETED", courseId: id })}
          />
        </div>

        <aside className="checklist-card">
          <h2>Remaining checklist</h2>
          {evaluation.missingCourseIds.length ? (
            evaluation.missingCourseIds.map((id) => {
              const course = courseById.get(id);
              return (
                <label className="check-row" key={id}>
                  <input
                    type="checkbox"
                    checked={completed.has(id)}
                    onChange={() => dispatch({ type: "TOGGLE_COMPLETED", courseId: id })}
                  />
                  <span>
                    <strong>{course?.localCourseId ?? id}</strong> {course?.title}
                  </span>
                </label>
              );
            })
          ) : (
            <p>{evaluation.status === "satisfied" ? "No missing listed course prerequisites." : evaluation.explanation}</p>
          )}
          <a className="source-link" href={target.sourceUrl} target="_blank" rel="noreferrer">
            Verify in MIT catalog ↗
          </a>
        </aside>
      </div>
    </section>
  );
}
