import { FormEvent, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
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
import { useApp } from "../../state/AppContext";
import { recommendNextCourses, type NextCourseRecommendation } from "../../domain/nextCourses";
import { requirementLabel } from "../../domain/requirements";
import {
  buildCourseFamilies,
  familySearchText,
  type CourseFamily,
} from "../../domain/courseFamilies";

const plannerTerms = [
  "Year 1 · Fall", "Year 1 · IAP", "Year 1 · Spring",
  "Year 2 · Fall", "Year 2 · IAP", "Year 2 · Spring",
  "Year 3 · Fall", "Year 3 · IAP", "Year 3 · Spring",
  "Year 4 · Fall", "Year 4 · IAP", "Year 4 · Spring",
];

type GraphData = {
  nodes: Node[];
  edges: Edge[];
  familyByNodeId: Map<string, CourseFamily>;
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

function familyReferencesFamily(dependent: CourseFamily, prerequisite: CourseFamily) {
  return dependent.members.some((dependentCourse) =>
    prerequisite.members.some((prereqCourse) =>
      referencesCourse(dependentCourse.prerequisites, prereqCourse),
    ),
  );
}

function buildPrerequisiteGraph(target: CourseFamily, families: CourseFamily[]): GraphData {
  const discovered = new Map<string, { family: CourseFamily; depth: number }>();
  const edgeKeys = new Set<string>();
  const edges: Edge[] = [];
  const queue: Array<{ family: CourseFamily; depth: number }> = [{ family: target, depth: 0 }];
  discovered.set(target.id, { family: target, depth: 0 });

  let cursor = 0;
  const maxNodes = 70;

  while (cursor < queue.length && discovered.size < maxNodes) {
    const current = queue[cursor++];
    const prereqs = families.filter(
      (candidate) =>
        candidate.id !== current.family.id &&
        familyReferencesFamily(current.family, candidate),
    );

    for (const prereq of prereqs) {
      if (discovered.size >= maxNodes) break;
      const nextDepth = current.depth + 1;
      const previous = discovered.get(prereq.id);
      if (!previous || nextDepth > previous.depth) {
        discovered.set(prereq.id, { family: prereq, depth: nextDepth });
      }

      const edgeKey = prereq.id + "->" + current.family.id;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({
          id: edgeKey,
          source: prereq.id,
          target: current.family.id,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      }

      if (!previous) queue.push({ family: prereq, depth: nextDepth });
    }
  }

  const layers = new Map<number, CourseFamily[]>();
  for (const { family, depth } of discovered.values()) {
    layers.set(depth, [...(layers.get(depth) ?? []), family]);
  }

  const nodes: Node[] = [];
  const familyByNodeId = new Map<string, CourseFamily>();
  const horizontalGap = 300;
  const verticalGap = 122;

  for (const [depth, layerFamilies] of [...layers.entries()].sort((a, b) => b[0] - a[0])) {
    layerFamilies.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const totalHeight = Math.max(0, (layerFamilies.length - 1) * verticalGap);

    layerFamilies.forEach((family, index) => {
      const y = index * verticalGap - totalHeight / 2;
      const x = -depth * horizontalGap;
      const isTarget = family.id === target.id;
      nodes.push({
        id: family.id,
        position: { x, y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        className: "course-map-node" + (isTarget ? " course-map-target" : ""),
        data: {
          label: (
            <div className="course-map-node-content">
              <strong>{family.label}</strong>
              <span>{family.title}</span>
              {family.members.length > 1 && (
                <small>{family.members.length} variants merged</small>
              )}
            </div>
          ),
        },
      });
      familyByNodeId.set(family.id, family);
    });
  }

  return { nodes, edges, familyByNodeId };
}

export default function CourseMapPage() {
  const { data, error, retry } = useCatalog();
  const { state, dispatch } = useApp();
  const catalog = data?.courses ?? [];
  const { families, familyByCourseId } = useMemo(
    () => buildCourseFamilies(catalog),
    [catalog],
  );
  const [query, setQuery] = useState("");
  const [targetFamilyId, setTargetFamilyId] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [scheduleTerm, setScheduleTerm] = useState(0);
  const [nextCourseInterests, setNextCourseInterests] = useState("");
  const [nextCourseResults, setNextCourseResults] = useState<Array<NextCourseRecommendation & { explanation?: string; method?: string }>>([]);
  const [nextCourseLoading, setNextCourseLoading] = useState(false);
  const normalized = query.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!normalized || targetFamilyId) return [];
    return families
      .filter((family) => familySearchText(family).includes(normalized))
      .slice(0, 8);
  }, [families, normalized, targetFamilyId]);

  const target = targetFamilyId
    ? families.find((family) => family.id === targetFamilyId)
    : undefined;

  const graph = useMemo(
    () => (target ? buildPrerequisiteGraph(target, families) : null),
    [target, families],
  );

  const selected =
    selectedFamilyId && graph
      ? graph.familyByNodeId.get(selectedFamilyId)
      : undefined;

  function chooseFamily(family: CourseFamily) {
    setQuery(family.label);
    setTargetFamilyId(family.id);
    setSelectedFamilyId(family.id);
    setNextCourseResults([]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!families.length) return;

    const exactCourse = catalog.find(
      (course) => course.subject_id.toLowerCase() === normalized,
    );
    const exactFamily = exactCourse
      ? familyByCourseId.get(exactCourse.subject_id)
      : families.find((family) => family.label.toLowerCase() === normalized);

    const fallback = families.find((family) =>
      familySearchText(family).includes(normalized),
    );

    const family = exactFamily ?? fallback;
    if (family) chooseFamily(family);
  }

  function resetSearch() {
    setTargetFamilyId(null);
    setSelectedFamilyId(null);
    setQuery("");
    setNextCourseResults([]);
  }

  function addSelectedToSchedule() {
    if (!selected) return;
    const course = selected.primary;
    dispatch({
      type: "ADD_PLANNED_COURSE",
      course: {
        courseId: course.subject_id,
        title: course.title,
        units: course.total_units,
        term: scheduleTerm,
      },
    });
  }

  function isSelectedScheduled() {
    if (!selected) return false;
    return state.plannedCourses.some(
      (course) =>
        selected.members.some((member) => member.subject_id === course.courseId) &&
        course.term === scheduleTerm,
    );
  }

  async function findLogicalNextCourses() {
    if (!selected || !data) return;
    setNextCourseLoading(true);

    const deterministic = recommendNextCourses({
      current: selected.primary,
      catalog,
      requirements: data.requirements,
      state,
      interests: nextCourseInterests,
      limit: 15,
    });

    const selectedRequirement = state.selectedRequirementId
      ? data.requirements[state.selectedRequirementId]
      : undefined;

    try {
      const response = await fetch("/api/next-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCourse: {
            subjectId: selected.primary.subject_id,
            title: selected.primary.title,
            description: selected.primary.description,
          },
          interests: nextCourseInterests,
          majorLabel: selectedRequirement ? requirementLabel(selectedRequirement) : "",
          candidates: deterministic.map((item) => ({
            subjectId: item.course.subject_id,
            title: item.course.title,
            description: item.course.description,
            relationship: item.relationship,
            deterministicScore: item.score,
            deterministicReasons: item.reasons,
          })),
        }),
      });

      if (!response.ok) throw new Error("AI ranking unavailable");
      const payload = await response.json();
      const rankedIds = Array.isArray(payload.results) ? payload.results : [];
      const byId = new Map(deterministic.map((item) => [item.course.subject_id, item]));

      const ranked = rankedIds
        .map((item: { subjectId: string; explanation?: string; method?: string }) => {
          const base = byId.get(item.subjectId);
          return base ? { ...base, explanation: item.explanation, method: item.method } : null;
        })
        .filter(Boolean) as Array<NextCourseRecommendation & { explanation?: string; method?: string }>;

      const seen = new Set(ranked.map((item) => item.course.subject_id));
      setNextCourseResults([
        ...ranked,
        ...deterministic
          .filter((item) => !seen.has(item.course.subject_id))
          .slice(0, Math.max(0, 8 - ranked.length)),
      ]);
    } catch {
      setNextCourseResults(deterministic.slice(0, 8));
    } finally {
      setNextCourseLoading(false);
    }
  }

  function addRecommendationToSchedule(course: RemoteCourse) {
    dispatch({
      type: "ADD_PLANNED_COURSE",
      course: {
        courseId: course.subject_id,
        title: course.title,
        units: course.total_units,
        term: scheduleTerm,
      },
    });
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
        <nav className="course-map-index-nav" aria-label="Cedar pages">
          <NavLink to="/planner">Plan</NavLink>
          <NavLink to="/">Discover</NavLink>
          <NavLink to="/map">Map</NavLink>
        </nav>
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
              {suggestions.map((family) => (
                <button key={family.id} onClick={() => chooseFamily(family)}>
                  <strong>{family.label}</strong>
                  <span>
                    {family.title}
                    {family.members.length > 1
                      ? " · " + family.members.map((course) => course.subject_id).join(", ")
                      : ""}
                  </span>
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
      <nav className="course-map-index-nav" aria-label="Cedar pages">
          <NavLink to="/planner">Plan</NavLink>
          <NavLink to="/">Discover</NavLink>
          <NavLink to="/map">Map</NavLink>
        </nav>
      <div className="course-map-floating-search">
        <button className="course-map-mini-brand" onClick={resetSearch}>cedar</button>
        <form onSubmit={submit}>
          <input
            aria-label="Search another MIT course"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setTargetFamilyId(null)}
            placeholder="Search a class"
          />
          <button type="submit" aria-label="Search">⌕</button>
        </form>
      </div>

      <div className="course-map-canvas">
        <ReactFlow
          key={target.id}
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
          onNodeClick={(_, node) => setSelectedFamilyId(node.id)}
        >
          <Background gap={28} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {selected && (
        <aside className="course-map-info-card">
          <button className="course-map-close" onClick={() => setSelectedFamilyId(null)} aria-label="Close details">×</button>
          <div className="course-map-info-number">{selected.label}</div>
          <h2>{selected.title}</h2>

          {selected.members.length > 1 && (
            <div className="course-family-variants">
              <span>Combined variants</span>
              <div>
                {selected.members.map((course) => (
                  <span className="course-family-chip" key={course.subject_id}>
                    {course.subject_id}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p>{selected.primary.description || "No description available."}</p>

          <div className="course-map-info-grid">
            <div><span>Units</span><strong>{selected.primary.total_units ?? "—"}</strong></div>
            <div><span>Offered</span><strong>{offeringText(selected.primary)}</strong></div>
            <div><span>In class</span><strong>{selected.primary.in_class_hours != null ? selected.primary.in_class_hours + " hrs/wk" : "—"}</strong></div>
            <div><span>Outside class</span><strong>{selected.primary.out_of_class_hours != null ? selected.primary.out_of_class_hours + " hrs/wk" : "—"}</strong></div>
          </div>

          <div className="course-map-schedule">
            <label htmlFor="course-map-term">Add to schedule</label>
            <div>
              <select
                id="course-map-term"
                value={scheduleTerm}
                onChange={(event) => setScheduleTerm(Number(event.target.value))}
              >
                {plannerTerms.map((term, index) => (
                  <option value={index} key={term}>{term}</option>
                ))}
              </select>
              <button
                className="primary-button"
                onClick={addSelectedToSchedule}
                disabled={isSelectedScheduled()}
              >
                {isSelectedScheduled() ? "Added ✓" : "+ Add"}
              </button>
            </div>
          </div>


          <div className="course-next-panel">
            <div className="course-next-heading">
              <div>
                <span>Where can I go from here?</span>
                <small>Recommendations are not prerequisite requirements.</small>
              </div>
            </div>
            <input
              value={nextCourseInterests}
              onChange={(event) => setNextCourseInterests(event.target.value)}
              placeholder="Optional: pure math, ML, finance, applied math…"
            />
            <button
              className="secondary-button course-next-find"
              onClick={findLogicalNextCourses}
              disabled={nextCourseLoading}
            >
              {nextCourseLoading ? "Finding logical next courses…" : "Recommend next courses"}
            </button>

            {nextCourseResults.length > 0 && (
              <div className="course-next-results">
                {nextCourseResults.map((recommendation) => {
                  const alreadyPlanned = state.plannedCourses.some(
                    (planned) => planned.courseId === recommendation.course.subject_id && planned.term === scheduleTerm,
                  );
                  return (
                    <article className="course-next-card" key={recommendation.course.subject_id}>
                      <div className="course-next-card-top">
                        <div>
                          <strong>{recommendation.course.subject_id}</strong>
                          <span>{recommendation.course.title}</span>
                        </div>
                        <span className={"course-next-badge " + recommendation.relationship}>
                          {recommendation.relationship === "required-next"
                            ? "Builds directly"
                            : recommendation.relationship === "recommended-next"
                              ? "Recommended next"
                              : "Related direction"}
                        </span>
                      </div>
                      <p>
                        {recommendation.explanation ??
                          recommendation.reasons[0] ??
                          "Logical continuation based on your current course and academic plan."}
                      </p>
                      {recommendation.reasons.length > 1 && (
                        <ul>
                          {recommendation.reasons.slice(1, 3).map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      )}
                      <button
                        className="text-button"
                        disabled={alreadyPlanned}
                        onClick={() => addRecommendationToSchedule(recommendation.course)}
                      >
                        {alreadyPlanned ? "Added to selected term ✓" : "+ Add to selected term"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="course-map-rule">
            <span>Prerequisites</span>
            <p>{selected.primary.prerequisites || "No listed prerequisites."}</p>
          </div>

          {selected.primary.corequisites && (
            <div className="course-map-rule">
              <span>Corequisites</span>
              <p>{selected.primary.corequisites}</p>
            </div>
          )}

          {selected.members.length > 1 && (
            <div className="course-map-rule">
              <span>Variant note</span>
              <p>
                Cedar displays these as one course family in the map. Individual catalog
                versions can still differ in units, offering terms, or exact prerequisite wording.
              </p>
            </div>
          )}

          {selected.primary.url && (
            <a href={selected.primary.url} target="_blank" rel="noreferrer">
              Open official catalog ↗
            </a>
          )}
        </aside>
      )}

      <div className="course-map-legend">
        <strong>{target.label}</strong>
        <span>{graph.nodes.length} course families in prerequisite map</span>
      </div>
    </section>
  );
}
