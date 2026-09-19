import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { RemoteCourse } from "../../domain/types";
import { useApp } from "../../state/AppContext";

function mentionsCourse(text: string | undefined, subjectId: string) {
  if (!text) return false;
  const escaped = subjectId.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^A-Za-z0-9.])" + escaped + "([^A-Za-z0-9.]|$)").test(text);
}

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
  const [target, setTarget] = useState<RemoteCourse | null>(null);
  const [catalog, setCatalog] = useState<RemoteCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMoreAfter, setShowMoreAfter] = useState(false);

  useEffect(() => {
    if (!subjectId) return;
    setLoading(true);
    Promise.all([
      fetch("/api/course?id=" + encodeURIComponent(subjectId)).then((r) => {
        if (!r.ok) throw new Error("course");
        return r.json();
      }),
      fetch("/api/catalog").then((r) => r.ok ? r.json() : []),
    ])
      .then(([course, all]) => {
        setTarget(course);
        setCatalog(Array.isArray(all) ? all : []);
      })
      .catch(() => setTarget(null))
      .finally(() => setLoading(false));
  }, [subjectId]);

  const prerequisiteCourses = useMemo(() => {
    if (!target?.prerequisites) return [];
    return catalog
      .filter((course) => course.subject_id !== subjectId && mentionsCourse(target.prerequisites, course.subject_id))
      .sort((a, b) => a.subject_id.localeCompare(b.subject_id))
      .slice(0, 12);
  }, [target, catalog, subjectId]);

  const downstreamCourses = useMemo(() => {
    return catalog
      .filter((course) => course.subject_id !== subjectId && mentionsCourse(course.prerequisites, subjectId))
      .sort((a, b) => a.subject_id.localeCompare(b.subject_id));
  }, [catalog, subjectId]);

  if (loading) {
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

  const before = prerequisiteCourses;
  const after = showMoreAfter ? downstreamCourses.slice(0, 12) : downstreamCourses.slice(0, 6);

  const nodes: Node[] = [
    ...before.map((course, index) => ({
      id: "before:" + course.subject_id,
      position: { x: 0, y: index * 110 },
      data: { label: <div className="progression-node"><strong>{course.subject_id}</strong><span>{course.title}</span></div> },
      className: "progression-course prerequisite-course",
    })),
    {
      id: "target",
      position: { x: 360, y: Math.max(80, ((Math.max(before.length, after.length) - 1) * 110) / 2) },
      data: { label: <div className="progression-node"><strong>{target.subject_id}</strong><span>{target.title}</span></div> },
      className: "progression-course target-course",
    },
    ...after.map((course, index) => ({
      id: "after:" + course.subject_id,
      position: { x: 720, y: index * 110 },
      data: { label: <div className="progression-node"><strong>{course.subject_id}</strong><span>{course.title}</span></div> },
      className: "progression-course downstream-course",
    })),
  ];

  const edges: Edge[] = [
    ...before.map((course) => ({
      id: "edge-before-" + course.subject_id,
      source: "before:" + course.subject_id,
      target: "target",
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
    ...after.map((course) => ({
      id: "edge-after-" + course.subject_id,
      source: "target",
      target: "after:" + course.subject_id,
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  ];

  const completed = state.completedCourseIds.includes("mit:" + target.subject_id);

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
            onClick={() => dispatch({ type: "TOGGLE_COMPLETED", courseId: "mit:" + target.subject_id })}
          >
            {completed ? "Completed ✓" : "Mark completed"}
          </button>
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
          <strong>Can lead to</strong>
          <span>Courses whose prerequisite text references this subject</span>
        </div>
      </div>

      <div className="progression-graph">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          minZoom={0.45}
          maxZoom={1.5}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
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
                {downstreamCourses.slice(0, showMoreAfter ? 30 : 8).map((course) => (
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
