import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { courses, courseById } from "../../data/mitCatalog";
import type { PrerequisiteRule } from "../../domain/types";
import { useApp } from "../../state/AppContext";

function referencedCourseIds(rule: PrerequisiteRule): string[] {
  if (rule.type === "course") return [rule.courseId];
  if (rule.type === "all" || rule.type === "any") {
    return rule.children.flatMap(referencedCourseIds);
  }
  return [];
}

export default function CatalogPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");

  const visibleCourses = useMemo(() => {
    const normalized = query.toLowerCase();
    return courses.filter((course) => {
      const matchesDepartment = department === "All" || course.department === department;
      const matchesQuery =
        !normalized ||
        course.localCourseId.toLowerCase().includes(normalized) ||
        course.title.toLowerCase().includes(normalized);
      return matchesDepartment && matchesQuery;
    });
  }, [query, department]);

  const nodes: Node[] = visibleCourses.map((course, index) => ({
    id: course.id,
    position: { x: (index % 3) * 260, y: Math.floor(index / 3) * 150 },
    data: {
      label: (
        <div className="graph-node-content">
          <strong>{course.localCourseId}</strong>
          <span>{course.title}</span>
        </div>
      ),
    },
    className: [
      "course-node",
      state.highlightedCourseIds.includes(course.id) ? "highlighted" : "",
      state.completedCourseIds.includes(course.id) ? "completed" : "",
    ].join(" "),
  }));

  const visibleIds = new Set(visibleCourses.map((course) => course.id));
  const edges: Edge[] = courses.flatMap((course) =>
    referencedCourseIds(course.prerequisiteRule)
      .filter((prereqId) => visibleIds.has(prereqId) && visibleIds.has(course.id))
      .map((prereqId) => ({
        id: `${prereqId}->${course.id}`,
        source: prereqId,
        target: course.id,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
  );

  const selected = state.selectedCourseId ? courseById.get(state.selectedCourseId) : undefined;

  return (
    <section className="page explore-page">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Explore the catalog</div>
          <h1>See how courses connect.</h1>
        </div>
        <div className="filter-bar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search number or title"
          />
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option>All</option>
            <option>EECS</option>
            <option>Mathematics</option>
          </select>
        </div>
      </div>

      <div className="explore-layout">
        <div className="graph-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => dispatch({ type: "SELECT_COURSE", courseId: node.id })}
          >
            <Background gap={22} />
            <Controls />
          </ReactFlow>
        </div>

        <aside className="details-panel">
          {selected ? (
            <>
              <div className="course-number">{selected.localCourseId}</div>
              <h2>{selected.title}</h2>
              <p>{selected.description}</p>
              <dl>
                <dt>Department</dt><dd>{selected.department}</dd>
                <dt>Units</dt><dd>{selected.units ?? "See catalog"}</dd>
                <dt>Data status</dt><dd>{selected.dataStatus.replace("_", " ")}</dd>
              </dl>
              <button
                className="primary-button"
                onClick={() => {
                  dispatch({ type: "OPEN_PATHWAY", courseId: selected.id });
                  navigate(`/course/${encodeURIComponent(selected.id)}`);
                }}
              >
                See pathway
              </button>
              <a className="source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                Open MIT catalog ↗
              </a>
            </>
          ) : (
            <div className="empty-panel">
              <h2>Select a course</h2>
              <p>Click a node to inspect its description and prerequisite pathway.</p>
            </div>
          )}
        </aside>
      </div>

      <div className="list-view">
        <h2>Course list</h2>
        {visibleCourses.map((course) => (
          <button
            className="list-row"
            key={course.id}
            onClick={() => dispatch({ type: "SELECT_COURSE", courseId: course.id })}
          >
            <strong>{course.localCourseId}</strong>
            <span>{course.title}</span>
            <span>{course.department}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
