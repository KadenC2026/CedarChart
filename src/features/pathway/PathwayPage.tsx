import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { RemoteCourse } from "../../domain/types";
import { useCatalog } from "../../data/catalog";
import { earnedCourseIds, localId } from "../../domain/requirements";
import { progressionGroups, referencesCourse } from "../../domain/progression";
import { plannerTerms, termLabel } from "../../domain/terms";
import { useApp } from "../../state/AppContext";

function offeringText(course: RemoteCourse) {
  const terms = [
    course.offered_fall && "Fall",
    course.offered_IAP && "IAP",
    course.offered_spring && "Spring",
    course.offered_summer && "Summer",
  ].filter(Boolean);
  return terms.length ? terms.join(", ") : "Check catalog";
}

export default function PathwayPage() {
  const { courseId } = useParams();
  const { state, dispatch } = useApp();
  const subjectId = decodeURIComponent(courseId ?? "").replace(/^mit:/, "");
  const { data, error, retry } = useCatalog();
  const navigate = useNavigate();
  const catalog = data?.courses ?? [];
  const target = catalog.find(c => c.subject_id === subjectId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [branchPage, setBranchPage] = useState(0);
  const [showMoreAfter, setShowMoreAfter] = useState(false);
  const [pickedCourseId, setPickedCourseId] = useState<string | null>(null);
  const [addTerm, setAddTerm] = useState(0);
  useEffect(() => { setExpanded(new Set()); setShowMoreAfter(false); setBranchPage(0); setPickedCourseId(null); }, [subjectId]);
  function toggleGroup(id: string) {
    setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const prerequisiteCourses = useMemo(() => {
    if (!target?.prerequisites) return [];
    return catalog
      .filter((course) => course.subject_id !== subjectId && referencesCourse(target.prerequisites, course))
      .sort((a, b) => a.subject_id.localeCompare(b.subject_id));
  }, [target, catalog, subjectId]);

  const downstreamCourses = useMemo(() => {
    return catalog
      .filter((course) => course.subject_id !== subjectId && target && referencesCourse(course.prerequisites, target))
      .sort((a, b) => a.subject_id.localeCompare(b.subject_id));
  }, [catalog, subjectId, target]);

  const groups = useMemo(() => progressionGroups(downstreamCourses, data?.requirements ?? {}), [downstreamCourses, data]);

  if (error) return <section className="page"><p className="error-note">{error}</p><button onClick={retry}>Retry</button></section>;
  if (!data) {
    return <section className="page"><p>Building course progression…</p></section>;
  }

  if (!target) {
    return (
      <section className="page">
        <h1>Course not found</h1>
        <Link to="/planner">Return to planner</Link>
      </section>
    );
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const addEdge = (source: string, target: string) => edges.push({ id: `${source}->${target}`, source, target, markerEnd: { type: MarkerType.ArrowClosed } });
  const courseNode = (course: RemoteCourse, id: string, x: number, y: number, className: string): Node => ({
    id, position: { x, y }, sourcePosition: Position.Right, targetPosition: Position.Left,
    data: { courseId: course.subject_id, label: <div className="progression-node"><strong>{course.subject_id}</strong><span>{course.title}</span></div> },
    className: `progression-course ${className}`,
  });
  let row = 0;
  const visibleGroups = expanded.size ? groups.filter(group => expanded.has(group.id)) : groups.slice(branchPage * 6, branchPage * 6 + 6);
  for (const group of visibleGroups) {
    const isExpanded = expanded.has(group.id);
    const height = isExpanded ? Math.max(140, group.courses.length * 110) : 150;
    const id = `major:${group.id}`;
    nodes.push({ id, position: { x: 660, y: row + height / 2 - 50 }, sourcePosition: Position.Right, targetPosition: Position.Left,
      data: { label: <button className="major-node-button nodrag" aria-expanded={isExpanded} onClick={() => toggleGroup(group.id)}>
        <strong>{group.label}</strong><span>{group.courses.length} connected subjects · {isExpanded ? "Collapse −" : "Expand +"}</span></button> },
      className: "progression-major" });
    addEdge("target", id);
    if (isExpanded) group.courses.forEach((course, index) => {
      const courseId = `${id}:${course.subject_id}`;
      nodes.push(courseNode(course, courseId, 1060, row + index * 110, "downstream-course"));
      addEdge(id, courseId);
    });
    row += height + 30;
  }
  const center = Math.max(0, row / 2 - 50);
  nodes.push(courseNode(target, "target", 320, center, "target-course"));
  prerequisiteCourses.forEach((course, index) => {
    const id = `before:${course.subject_id}`;
    nodes.push(courseNode(course, id, 0, Math.max(0, center - prerequisiteCourses.length * 55) + index * 110, "prerequisite-course"));
    addEdge(id, "target");
  });
  const completed = earnedCourseIds(state).has(target.subject_id);
  const priorCredit = state.priorCredits.find(c => c.courseId === `mit:${target.subject_id}`);
  const picked = pickedCourseId ? catalog.find(course => course.subject_id === pickedCourseId) : undefined;

  function plannedTermsFor(course: RemoteCourse) {
    return state.plannedCourses
      .filter(planned => localId(planned.courseId) === course.subject_id)
      .map(planned => termLabel(planned.term));
  }

  function addToPlan(course: RemoteCourse) {
    dispatch({
      type: "ADD_PLANNED_COURSE",
      course: { courseId: course.subject_id, title: course.title, units: course.total_units, term: addTerm },
    });
  }

  function termPicker(id: string) {
    return (
      <select
        id={id}
        value={addTerm}
        onChange={event => setAddTerm(Number(event.target.value))}
        aria-label="Term to add this course to"
      >
        {plannerTerms.map((term, index) => <option value={index} key={term}>{term}</option>)}
      </select>
    );
  }

  const targetPlannedTerms = plannedTermsFor(target);

  return (
    <section className="page progression-page">
      <Link className="back-link" to="/planner">← Back to planner</Link>

      <div className="progression-header">
        <div>
          <div className="eyebrow">Course progression</div>
          <div className="course-number">{target.subject_id}</div>
          <h1>{target.title}</h1>
          <p className="lede">{target.description}</p>
        </div>
        <div className="course-actions-stack">
          <button
            className={completed ? "secondary-button completed-button" : "secondary-button"}
            disabled={Boolean(priorCredit)}
            onClick={() => dispatch({ type: "TOGGLE_COMPLETED", courseId: "mit:" + target.subject_id })}
          >
            {priorCredit ? priorCredit.source === "ase" ? "Passed ASE ✓" : "Prior credit ✓" : completed ? "Completed ✓" : "Mark completed"}
          </button>
          <div className="plan-add-row">
            {termPicker("pathway-add-term")}
            <button className="secondary-button" onClick={() => addToPlan(target)}>+ Add to plan</button>
          </div>
          {targetPlannedTerms.length > 0 && (
            <small className="data-note">Planned: {targetPlannedTerms.join(", ")}</small>
          )}
          <a className="primary-button link-button" href={target.url ?? "https://catalog.mit.edu/"} target="_blank" rel="noreferrer">
            Official catalog ↗
          </a>
        </div>
      </div>

      <div className="course-facts">
        <div><span>Units</span><strong>{target.total_units ?? "—"}</strong></div>
        <div><span>Typically offered</span><strong>{offeringText(target)}</strong></div>
        <div><span>Level</span><strong>{target.level === "G" ? "Graduate" : target.level === "U" ? "Undergraduate" : "—"}</strong></div>
        <div><span>Rating</span><strong>{typeof target.rating === "number" ? target.rating.toFixed(1) + "/7" : "—"}</strong></div>
      </div>

      <div className="progression-explainer">
        <div>
          <strong>Comes before</strong>
          <span>Courses named in the catalog prerequisite rule</span>
        </div>
        <div>
          <strong>This course</strong>
          <span>Your selected destination</span>
        </div>
        <div>
          <strong>Choose a major</strong>
          <span>Expand a program to see connected subjects</span>
        </div>
      </div>

      <p className="data-note">Click a major to expand its subjects, then click a subject to add it to your plan or follow its progression (double-click opens it directly). Branches include subjects in the program’s department and its listed requirements; other subjects are grouped by department. Connections include GIR references and do not imply all prerequisites are satisfied.</p>
      <div className="major-chips">{groups.map(group => <button className="chip" key={group.id} aria-expanded={expanded.has(group.id)} onClick={() => toggleGroup(group.id)}>{group.label} {expanded.has(group.id) ? "−" : "+"}</button>)}</div>
      {groups.length > 6 && <div className="branch-pagination">
        {expanded.size ? <button className="secondary-button" onClick={() => setExpanded(new Set())}>Back to all branches</button> : <>
          <button className="secondary-button" disabled={branchPage === 0} onClick={() => setBranchPage(n => n - 1)}>Previous branches</button>
          <span>Branches {branchPage * 6 + 1}–{Math.min(groups.length, branchPage * 6 + 6)} of {groups.length}</span>
          <button className="secondary-button" disabled={(branchPage + 1) * 6 >= groups.length} onClick={() => setBranchPage(n => n + 1)}>Next branches</button>
        </>}
      </div>}
      <div className="progression-graph">
        <ReactFlow
          key={subjectId + branchPage + [...expanded].sort().join(",")}
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          onNodeClick={(_, node) => {
            const clicked = typeof node.data.courseId === "string" ? node.data.courseId : null;
            if (clicked) setPickedCourseId(clicked);
          }}
          onNodeDoubleClick={(_, node) => {
            const clicked = typeof node.data.courseId === "string" ? node.data.courseId : null;
            if (clicked && node.id !== "target") navigate("/course/" + encodeURIComponent("mit:" + clicked));
          }}
          minZoom={0.03}
          maxZoom={1.5}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>

        {picked && (
          <aside className="graph-action-card">
            <button className="graph-action-close" aria-label="Dismiss selected course" onClick={() => setPickedCourseId(null)}>×</button>
            <div className="course-number">{picked.subject_id}</div>
            <strong>{picked.title}</strong>
            <span className="data-note">
              {picked.total_units ? picked.total_units + " units · " : ""}{offeringText(picked)}
            </span>
            <div className="plan-add-row">
              {termPicker("graph-add-term")}
              <button className="add-course-button" onClick={() => addToPlan(picked)}>+ Add to plan</button>
            </div>
            {plannedTermsFor(picked).length > 0 && (
              <span className="data-note">Already planned: {plannedTermsFor(picked).join(", ")}</span>
            )}
            {picked.subject_id !== target.subject_id && (
              <button
                className="text-button"
                onClick={() => navigate("/course/" + encodeURIComponent("mit:" + picked.subject_id))}
              >
                Open progression →
              </button>
            )}
          </aside>
        )}
      </div>

      <div className="progression-details">
        <article className="detail-card">
          <h2>Prerequisite rule</h2>
          <p>{target.prerequisites || "No prerequisite text is listed in the current FireRoad catalog record."}</p>
          {target.corequisites && (
            <>
              <h3>Corequisites</h3>
              <p>{target.corequisites}</p>
            </>
          )}
          <p className="data-note">
            The diagram visualizes course references, but the exact catalog rule above remains the source of truth for AND/OR,
            permission, GIR, and other non-course conditions.
          </p>
        </article>

        <article className="detail-card">
          <h2>What this course unlocks</h2>
          {downstreamCourses.length ? (
            <>
              <p>{downstreamCourses.length} current catalog course{downstreamCourses.length === 1 ? "" : "s"} reference {target.subject_id} in their prerequisite text.</p>
              <div className="downstream-list">
                {downstreamCourses.slice(0, showMoreAfter ? undefined : 8).map((course) => (
                  <Link to={"/course/" + encodeURIComponent("mit:" + course.subject_id)} key={course.subject_id}>
                    <strong>{course.subject_id}</strong> {course.title}
                  </Link>
                ))}
              </div>
              {downstreamCourses.length > 8 && (
                <button className="text-button" onClick={() => setShowMoreAfter((value) => !value)}>
                  {showMoreAfter ? "Show fewer" : "Show more"}
                </button>
              )}
            </>
          ) : (
            <p>No current catalog course directly references this course in its prerequisite text.</p>
          )}
        </article>
      </div>
    </section>
  );
}
