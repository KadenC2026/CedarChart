import { FormEvent, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { RemoteCourse } from "../../domain/types";
import { useCatalog } from "../../data/catalog";
import { referencesCourse } from "../../domain/progression";

type GraphData = {
  nodes: Node[];
  edges: Edge[];
  courseByNodeId: Map<string, RemoteCourse>;
};

function offeringText(course: RemoteCourse) {
  const terms = [
    course.offered_fall && "Fall",
    course.offered_IAP && "IAP",
    course.offered_spring && "Spring",
    course.offered_summer && "Summer",
  ].filter(Boolean);
  return terms.length ? terms.join(", ") : "Check catalog";
}

function buildPrerequisiteGraph(target: RemoteCourse, catalog: RemoteCourse[]): GraphData {
  const byId = new Map(catalog.map((course) => [course.subject_id, course]));
  const discovered = new Map<string, { course: RemoteCourse; depth: number }>();
  const edgeKeys = new Set<string>();
  const edges: Edge[] = [];
  const queue: Array<{ course: RemoteCourse; depth: number }> = [{ course: target, depth: 0 }];
  discovered.set(target.subject_id, { course: target, depth: 0 });

  let cursor = 0;
  const maxNodes = 70;
  while (cursor < queue.length && discovered.size < maxNodes) {
    const current = queue[cursor++];
    if (!current.course.prerequisites) continue;

    const prereqs = catalog.filter(
      (candidate) =>
        candidate.subject_id !== current.course.subject_id &&
        referencesCourse(current.course.prerequisites, candidate),
    );

    for (const prereq of prereqs) {
      if (discovered.size >= maxNodes) break;
      const nextDepth = current.depth + 1;
      const previous = discovered.get(prereq.subject_id);
      if (!previous || nextDepth > previous.depth) {
        discovered.set(prereq.subject_id, { course: prereq, depth: nextDepth });
      }

      const edgeKey = prereq.subject_id + "->" + current.course.subject_id;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({
          id: edgeKey,
          source: prereq.subject_id,
          target: current.course.subject_id,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      }

      if (!previous) queue.push({ course: prereq, depth: nextDepth });
    }
  }

  const layers = new Map<number, RemoteCourse[]>();
  for (const { course, depth } of discovered.values()) {
    layers.set(depth, [...(layers.get(depth) ?? []), course]);
  }

  const nodes: Node[] = [];
  const courseByNodeId = new Map<string, RemoteCourse>();
  const horizontalGap = 290;
  const verticalGap = 118;

  for (const [depth, courses] of [...layers.entries()].sort((a, b) => b[0] - a[0])) {
    courses.sort((a, b) => a.subject_id.localeCompare(b.subject_id, undefined, { numeric: true }));
    const totalHeight = Math.max(0, (courses.length - 1) * verticalGap);
    courses.forEach((course, index) => {
      const y = index * verticalGap - totalHeight / 2;
      const x = -depth * horizontalGap;
      const isTarget = course.subject_id === target.subject_id;
      nodes.push({
        id: course.subject_id,
        position: { x, y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        className: "course-map-node" + (isTarget ? " course-map-target" : ""),
        data: {
          label: (
            <div className="course-map-node-content">
              <strong>{course.subject_id}</strong>
              <span>{course.title}</span>
            </div>
          ),
        },
      });
      courseByNodeId.set(course.subject_id, byId.get(course.subject_id) ?? course);
    });
  }

  return { nodes, edges, courseByNodeId };
}

export default function CourseMapPage() {
  const { data, error, retry } = useCatalog();
  const catalog = data?.courses ?? [];
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const normalized = query.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!normalized || targetId) return [];
    return catalog
      .filter(
        (course) =>
          course.subject_id.toLowerCase().includes(normalized) ||
          course.title.toLowerCase().includes(normalized),
      )
      .slice(0, 8);
  }, [catalog, normalized, targetId]);

  const target = targetId ? catalog.find((course) => course.subject_id === targetId) : undefined;
  const graph = useMemo(
    () => (target ? buildPrerequisiteGraph(target, catalog) : null),
    [target, catalog],
  );
  const selected = selectedId && graph ? graph.courseByNodeId.get(selectedId) : undefined;

  function chooseCourse(course: RemoteCourse) {
    setQuery(course.subject_id);
    setTargetId(course.subject_id);
    setSelectedId(course.subject_id);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!catalog.length) return;
    const exact = catalog.find(
      (course) => course.subject_id.toLowerCase() === normalized,
    );
    const fallback = catalog.find(
      (course) =>
        course.subject_id.toLowerCase().includes(normalized) ||
        course.title.toLowerCase().includes(normalized),
    );
    const course = exact ?? fallback;
    if (course) chooseCourse(course);
  }

  function resetSearch() {
    setTargetId(null);
    setSelectedId(null);
    setQuery("");
  }

  if (error) {
    return (
      <section className="course-map-loading">
        <p>{error}</p>
        <button onClick={retry}>Retry</button>
      </section>
    );
  }

  if (!data) {
    return <section className="course-map-loading">Loading MIT course data…</section>;
  }

  if (!target || !graph) {
    return (
      <section className="course-map-home">
        <div className="course-map-home-inner">
          <div className="course-map-wordmark">cedar</div>
          <form className="course-map-search-home" onSubmit={submit}>
            <span className="course-map-search-icon">⌕</span>
            <input
              autoFocus
              aria-label="Search MIT course"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a class, e.g. 6.1040"
            />
          </form>
          <p>Search any MIT subject to explore its prerequisite map.</p>
          {suggestions.length > 0 && (
            <div className="course-map-suggestions">
              {suggestions.map((course) => (
                <button key={course.subject_id} onClick={() => chooseCourse(course)}>
                  <strong>{course.subject_id}</strong>
                  <span>{course.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="course-map-shell">
      <div className="course-map-floating-search">
        <button className="course-map-mini-brand" onClick={resetSearch}>cedar</button>
        <form onSubmit={submit}>
          <input
            aria-label="Search another MIT course"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setTargetId(null)}
            placeholder="Search a class"
          />
          <button type="submit" aria-label="Search">⌕</button>
        </form>
      </div>

      <div className="course-map-canvas">
        <ReactFlow
          key={target.subject_id}
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag
          panOnScroll
          zoomOnScroll
          zoomOnPinch
          minZoom={0.08}
          maxZoom={2.2}
          onNodeClick={(_, node) => setSelectedId(node.id)}
        >
          <Background gap={28} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {selected && (
        <aside className="course-map-info-card">
          <button className="course-map-close" onClick={() => setSelectedId(null)} aria-label="Close details">×</button>
          <div className="course-map-info-number">{selected.subject_id}</div>
          <h2>{selected.title}</h2>
          <p>{selected.description || "No description available."}</p>
          <div className="course-map-info-grid">
            <div><span>Units</span><strong>{selected.total_units ?? "—"}</strong></div>
            <div><span>Offered</span><strong>{offeringText(selected)}</strong></div>
            <div><span>In class</span><strong>{selected.in_class_hours != null ? selected.in_class_hours + " hrs/wk" : "—"}</strong></div>
            <div><span>Outside class</span><strong>{selected.out_of_class_hours != null ? selected.out_of_class_hours + " hrs/wk" : "—"}</strong></div>
          </div>
          <div className="course-map-rule">
            <span>Prerequisites</span>
            <p>{selected.prerequisites || "No listed prerequisites."}</p>
          </div>
          {selected.corequisites && (
            <div className="course-map-rule">
              <span>Corequisites</span>
              <p>{selected.corequisites}</p>
            </div>
          )}
          {selected.url && <a href={selected.url} target="_blank" rel="noreferrer">Open official catalog ↗</a>}
        </aside>
      )}

      <div className="course-map-legend">
        <strong>{target.subject_id}</strong>
        <span>{graph.nodes.length} courses in prerequisite map</span>
      </div>
    </section>
  );
}
