import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BaseEdge,
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  useNodesState,
} from "@xyflow/react";
import type { RemoteCourse } from "../../domain/types";
import { useCatalog } from "../../data/catalog";
import { courseWebsiteFor } from "../../data/courseSites";
import { referencesCourse } from "../../domain/progression";
import {
  parseCatalogPrerequisites,
  type CatalogPrerequisiteExpression,
} from "../../domain/prerequisites";
import { useApp } from "../../state/AppContext";
import { recommendNextCourses, type NextCourseRecommendation } from "../../domain/nextCourses";
import { localId, requirementLabel } from "../../domain/requirements";
import {
  buildCourseFamilies,
  searchFamilies,
  type CourseFamily,
} from "../../domain/courseFamilies";
import {
  activeFilterCount,
  departmentOptions,
  emptyFilters,
  matchesFilters,
  type CourseFilters,
} from "../../domain/courseSearch";
import { plannerTerms, termLabel } from "../../domain/terms";
import { requestCourseRecommendations } from "../../domain/aiCourseSearch";
import CourseFilterMenu from "../../components/CourseFilterMenu";

type GraphData = {
  nodes: Node[];
  edges: Edge[];
  familyByNodeId: Map<string, CourseFamily>;
  logicByNodeId: Map<string, LogicNodeData>;
};

type LogicNodeData = {
  kind: "all" | "any";
  optionFamilies: CourseFamily[];
};

type RoutedEdgeData = {
  channelX?: number;
  routeY?: number;
  sourceExitX?: number;
  sourceOffset?: number;
  targetEntryX?: number;
  targetOffset?: number;
};

type RoutedEdge = Edge<RoutedEdgeData, "routed">;

function roundedPath(points: Array<{ x: number; y: number }>, cornerRadius = 14) {
  const cleaned = points.filter((point, index) =>
    index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
  );
  const first = cleaned[0];
  let path = `M ${first.x} ${first.y}`;

  for (let index = 1; index < cleaned.length - 1; index += 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const next = cleaned[index + 1];
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const radius = Math.min(cornerRadius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + ((previous.x - current.x) / incoming) * radius,
      y: current.y + ((previous.y - current.y) / incoming) * radius,
    };
    const after = {
      x: current.x + ((next.x - current.x) / outgoing) * radius,
      y: current.y + ((next.y - current.y) / outgoing) * radius,
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }

  const last = cleaned[cleaned.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function PrerequisiteEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps<RoutedEdge>) {
  const routedSourceY = sourceY + (data?.sourceOffset ?? 0);
  const routedTargetY = targetY + (data?.targetOffset ?? 0);
  const points = data?.routeY == null
    ? [
        { x: sourceX, y: routedSourceY },
        { x: data?.channelX ?? (sourceX + targetX) / 2, y: routedSourceY },
        { x: data?.channelX ?? (sourceX + targetX) / 2, y: routedTargetY },
        { x: targetX, y: routedTargetY },
      ]
    : [
        { x: sourceX, y: routedSourceY },
        { x: data.sourceExitX ?? sourceX + 28, y: routedSourceY },
        { x: data.sourceExitX ?? sourceX + 28, y: data.routeY },
        { x: data.targetEntryX ?? targetX - 28, y: data.routeY },
        { x: data.targetEntryX ?? targetX - 28, y: routedTargetY },
        { x: targetX, y: routedTargetY },
      ];
  const edgePath = roundedPath(points);

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />;
}

const edgeTypes = { routed: PrerequisiteEdge };

function offeringText(course: RemoteCourse) {
  const terms = [
    course.offered_fall && "Fall",
    course.offered_IAP && "IAP",
    course.offered_spring && "Spring",
    course.offered_summer && "Summer",
  ].filter(Boolean);
  return terms.length ? terms.join(", ") : "Check catalog";
}

function CourseSuggestionList({
  families,
  source,
  onChoose,
  compact = false,
}: {
  families: CourseFamily[];
  source: "ai" | "catalog";
  onChoose: (family: CourseFamily) => void;
  compact?: boolean;
}) {
  if (!families.length) return null;
  return (
    <div
      className={`course-map-suggestions${compact ? " course-map-suggestions-floating" : ""}`}
      aria-label={source === "ai" ? "AI course suggestions" : "Catalog course matches"}
    >
      <div className="course-map-suggestions-heading">
        {source === "ai" ? "AI suggestions · choose a course" : "Catalog matches"}
      </div>
      {families.map((family) => (
        <button key={family.id} type="button" onClick={() => onChoose(family)}>
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
  );
}

function familyForPrerequisiteToken(token: string, families: CourseFamily[]) {
  return families.find((family) =>
    family.members.some((course) => referencesCourse(token, course)),
  );
}

function familiesInExpression(expression: CatalogPrerequisiteExpression, families: CourseFamily[]) {
  if (expression.type === "token") {
    const family = familyForPrerequisiteToken(expression.value, families);
    return family ? [family] : [];
  }
  const unique = new Map<string, CourseFamily>();
  for (const child of expression.children) {
    for (const family of familiesInExpression(child, families)) unique.set(family.id, family);
  }
  return [...unique.values()];
}

function buildPrerequisiteGraph(
  target: CourseFamily,
  families: CourseFamily[],
  selectedFamilyIds: Set<string>,
): GraphData {
  const discovered = new Map<string, CourseFamily>();
  const edgeKeys = new Set<string>();
  const edges: Edge[] = [];
  const logicByNodeId = new Map<string, LogicNodeData>();
  discovered.set(target.id, target);
  const maxNodes = 70;

  const addEdge = (source: string, edgeTarget: string, arrow = true) => {
    const edgeKey = `${source}->${edgeTarget}`;
    if (edgeKeys.has(edgeKey)) return;
    edgeKeys.add(edgeKey);
    edges.push({
      id: edgeKey,
      source,
      target: edgeTarget,
      ...(arrow ? { markerEnd: { type: MarkerType.ArrowClosed } } : {}),
    });
  };

  const discover = (family: CourseFamily) => {
    if (discovered.size + logicByNodeId.size >= maxNodes || discovered.has(family.id)) return;
    discovered.set(family.id, family);
  };

  const connectExpression = (
    expression: CatalogPrerequisiteExpression,
    edgeTarget: string,
    path: string,
    flattenAll: boolean,
  ) => {
    if (discovered.size + logicByNodeId.size >= maxNodes) return;
    if (expression.type === "token") {
      const family = familyForPrerequisiteToken(expression.value, families);
      if (!family || family.id === edgeTarget) return;
      discover(family);
      addEdge(family.id, edgeTarget, !logicByNodeId.has(edgeTarget));
      return;
    }

    if (expression.type === "all" && flattenAll) {
      expression.children.forEach((child, index) =>
        connectExpression(child, edgeTarget, `${path}.${index}`, true),
      );
      return;
    }

    if (expression.type === "any") {
      const branchFamilies = expression.children.map((child) => familiesInExpression(child, families));
      const uniqueFamilies = new Map(
        branchFamilies.flat().map((family) => [family.id, family]),
      );
      if (branchFamilies.every((branch) => branch.length > 0) && uniqueFamilies.size === 1) {
        const family = [...uniqueFamilies.values()][0];
        if (family.id !== edgeTarget) {
          discover(family);
          addEdge(family.id, edgeTarget, !logicByNodeId.has(edgeTarget));
        }
        return;
      }

      const allOptions = [...uniqueFamilies.values()];
      const selectedOptions = allOptions.filter((family) => selectedFamilyIds.has(family.id));
      if (selectedOptions.length > 0) {
        selectedOptions.forEach((family) => {
          discover(family);
          addEdge(family.id, edgeTarget, !logicByNodeId.has(edgeTarget));
        });
        return;
      }

      const logicId = `logic:${edgeTarget}:${path}:${expression.type}`;
      logicByNodeId.set(logicId, {
        kind: expression.type,
        optionFamilies: allOptions,
      });
      addEdge(logicId, edgeTarget, !logicByNodeId.has(edgeTarget));
      return;
    }

    const logicId = `logic:${edgeTarget}:${path}:${expression.type}`;
    logicByNodeId.set(logicId, {
      kind: expression.type,
      optionFamilies: [],
    });
    expression.children.forEach((child, index) =>
      connectExpression(child, logicId, `${path}.${index}`, false),
    );
    addEdge(logicId, edgeTarget, !logicByNodeId.has(edgeTarget));
  };

  // Only selected roots reveal prerequisites. A prerequisite that is also selected
  // is expanded by its own tree when the forest merges the selected roots.
  const expression = parseCatalogPrerequisites(target.primary.prerequisites ?? "");
  if (expression) connectExpression(expression, target.id, target.primary.subject_id, true);

  return {
    nodes: [],
    edges,
    familyByNodeId: new Map([...discovered].map(([id, family]) => [id, family])),
    logicByNodeId,
  };
}

export function buildPrerequisiteForest(
  targets: CourseFamily[],
  families: CourseFamily[],
): GraphData {
  const familyByNodeId = new Map<string, CourseFamily>();
  const logicByNodeId = new Map<string, LogicNodeData>();
  const edgeById = new Map<string, Edge>();
  const targetIds = new Set(targets.map((target) => target.id));

  // Merge overlapping trees by their real family IDs. A selected prerequisite and
  // its selected dependent therefore remain one connected graph instead of becoming
  // duplicate nodes in separate trees.
  for (const target of targets) {
    const tree = buildPrerequisiteGraph(target, families, targetIds);
    for (const [id, family] of tree.familyByNodeId) familyByNodeId.set(id, family);
    for (const [id, logic] of tree.logicByNodeId) logicByNodeId.set(id, logic);
    for (const edge of tree.edges) edgeById.set(`${edge.source}->${edge.target}`, edge);
  }

  const edges = [...edgeById.values()];
  const neighbors = new Map<string, Set<string>>();
  const allNodeIds = [...familyByNodeId.keys(), ...logicByNodeId.keys()];
  for (const id of allNodeIds) neighbors.set(id, new Set());
  for (const edge of edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const components: string[][] = [];
  const visited = new Set<string>();
  for (const id of allNodeIds) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
    components.push(component);
  }

  const targetOrder = new Map(targets.map((target, index) => [target.id, index]));
  components.sort((a, b) => {
    const order = (component: string[]) => Math.min(
      ...component.filter((id) => targetIds.has(id)).map((id) => targetOrder.get(id) ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );
    return order(a) - order(b);
  });

  const nodes: Node[] = [];
  const horizontalGap = 480;
  const verticalNodeGap = 58;
  const componentGap = 150;
  const logicNodeWidth = (id: string) => logicByNodeId.get(id)?.kind === "any" ? 260 : 44;
  let nextComponentY = 0;

  for (const component of components) {
    const ids = new Set(component);
    const componentEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const incomingCount = new Map(component.map((id) => [id, 0]));
    const outgoing = new Map(component.map((id) => [id, [] as string[]]));
    const rank = new Map(component.map((id) => [id, 0]));

    for (const edge of componentEdges) {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
      outgoing.get(edge.source)?.push(edge.target);
    }

    const queue = component
      .filter((id) => (incomingCount.get(id) ?? 0) === 0)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const source = queue[cursor];
      for (const dependent of outgoing.get(source) ?? []) {
        const rankStep = logicByNodeId.has(dependent) ? 0 : 1;
        rank.set(dependent, Math.max(rank.get(dependent) ?? 0, (rank.get(source) ?? 0) + rankStep));
        incomingCount.set(dependent, (incomingCount.get(dependent) ?? 1) - 1);
        if (incomingCount.get(dependent) === 0) queue.push(dependent);
      }
    }

    const logicDepth = (id: string): number => {
      const logicTargets = (outgoing.get(id) ?? []).filter((targetId) => logicByNodeId.has(targetId));
      return logicTargets.length ? 1 + Math.max(...logicTargets.map(logicDepth)) : 1;
    };
    const horizontalPosition = (id: string) => {
      const base = (rank.get(id) ?? 0) * horizontalGap;
      const logic = logicByNodeId.get(id);
      if (!logic) return base;
      return logic.kind === "any"
        ? base + horizontalGap - 300
        : base + horizontalGap - 92 - (logicDepth(id) - 1) * 64;
    };
    const layers = new Map<number, string[]>();
    for (const id of component) {
      const layer = horizontalPosition(id);
      layers.set(layer, [...(layers.get(layer) ?? []), id]);
    }
    for (const layer of layers.values()) {
      layer.sort((a, b) =>
        (familyByNodeId.get(a)?.label ?? logicByNodeId.get(a)?.kind ?? a)
          .localeCompare(familyByNodeId.get(b)?.label ?? logicByNodeId.get(b)?.kind ?? b, undefined, { numeric: true }),
      );
    }

    const estimatedNodeHeight = (id: string) => {
      const logic = logicByNodeId.get(id);
      if (!logic) return 82;
      if (logic.kind === "all") return 92;
      return 56 + Math.ceil(Math.max(1, logic.optionFamilies.length) / 2) * 54;
    };
    const layerHeight = (idsInLayer: string[]) =>
      idsInLayer.reduce((sum, id) => sum + estimatedNodeHeight(id), 0) +
      Math.max(0, idsInLayer.length - 1) * verticalNodeGap;
    const componentHeight = Math.max(
      90,
      ...[...layers.values()].map(layerHeight),
    );
    const longEdges = componentEdges.filter((edge) =>
      (rank.get(edge.target) ?? 0) - (rank.get(edge.source) ?? 0) > 1,
    );
    const routingBand = Math.max(componentGap, 70 + longEdges.length * 22);
    const componentTop = nextComponentY + routingBand;
    const nodePosition = new Map<string, { x: number; y: number }>();

    for (const [layer, layerIds] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
      const currentLayerHeight = layerHeight(layerIds);
      let currentY = componentTop + (componentHeight - currentLayerHeight) / 2;
      layerIds.forEach((id, index) => {
        const family = familyByNodeId.get(id);
        const logic = logicByNodeId.get(id);
        // Course cards keep their dependency rank but are gently staggered so the
        // graph reads as a connected map rather than a rigid spreadsheet grid.
        const horizontalStagger = family ? ((index % 3) - 1) * 30 : 0;
        const position = { x: layer + horizontalStagger, y: currentY };
        currentY += estimatedNodeHeight(id) + verticalNodeGap;
        nodePosition.set(id, position);
        nodes.push({
          id,
          position,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          className: family
            ? "course-map-node" + (targetIds.has(id) ? " course-map-target" : "")
            : `course-map-logic-node course-map-logic-${logic?.kind ?? "all"}`,
          data: {
            label: family ? (
              <div className="course-map-node-content">
                <strong>{family.label}</strong>
                <span>{family.title}</span>
                {family.members.length > 1 && <small>{family.members.length} variants merged</small>}
              </div>
            ) : logic?.kind === "any" ? (
              <div
                className="course-map-choice-content"
                aria-label="Unresolved OR prerequisite choices"
                title="Choose one prerequisite to satisfy this requirement"
              >
                <div className="course-map-choice-heading">
                  <strong>ONE OF</strong>
                </div>
                <div className="course-map-choice-options">
                  {logic.optionFamilies.map((option) => (
                    <button
                      className="nodrag nopan"
                      data-family-id={option.id}
                      key={option.id}
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <span>{option.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="course-map-logic-content"
                aria-label="All prerequisites in this group are required"
                title="All prerequisites in this group are required"
              >
                <strong>AND</strong>
              </div>
            ),
          },
        });
      });
    }

    const sortedEdges = [...componentEdges].sort((a, b) => a.id.localeCompare(b.id));
    const updateEdgeData = (edge: Edge, patch: RoutedEdgeData) => {
      edge.type = "routed";
      edge.data = { ...(edge.data ?? {}), ...patch };
    };
    const groupEdges = (keyFor: (edge: Edge) => string) => {
      const groups = new Map<string, Edge[]>();
      for (const edge of sortedEdges) {
        const key = keyFor(edge);
        groups.set(key, [...(groups.get(key) ?? []), edge]);
      }
      return groups.values();
    };
    const portOffset = (index: number, count: number) => {
      if (count === 1) return 0;
      const step = Math.min(12, 36 / (count - 1));
      return (index - (count - 1) / 2) * step;
    };

    for (const edgesFromSource of groupEdges((edge) => edge.source)) {
      const ordered = [...edgesFromSource].sort((a, b) =>
        (nodePosition.get(a.target)?.y ?? 0) - (nodePosition.get(b.target)?.y ?? 0) || a.id.localeCompare(b.id),
      );
      ordered.forEach((edge, index) => updateEdgeData(edge, {
        sourceOffset: portOffset(index, ordered.length),
      }));
    }
    for (const edgesToTarget of groupEdges((edge) => edge.target)) {
      const ordered = [...edgesToTarget].sort((a, b) =>
        (nodePosition.get(a.source)?.y ?? 0) - (nodePosition.get(b.source)?.y ?? 0) || a.id.localeCompare(b.id),
      );
      ordered.forEach((edge, index) => updateEdgeData(edge, {
        targetOffset: portOffset(index, ordered.length),
      }));
    }

    const adjacentEdges = sortedEdges.filter((edge) => !longEdges.includes(edge));
    for (const edgesInGap of (() => {
      const groups = new Map<string, Edge[]>();
      for (const edge of adjacentEdges) {
        const sourceX = nodePosition.get(edge.source)?.x ?? 0;
        const targetX = nodePosition.get(edge.target)?.x ?? 0;
        const key = `${sourceX}:${targetX}`;
        groups.set(key, [...(groups.get(key) ?? []), edge]);
      }
      return groups.values();
    })()) {
      edgesInGap.forEach((edge, index) => {
        const sourceX = nodePosition.get(edge.source)?.x ?? 0;
        const targetX = nodePosition.get(edge.target)?.x ?? sourceX + horizontalGap;
        const sourceWidth = logicByNodeId.has(edge.source) ? logicNodeWidth(edge.source) : 210;
        const sourceRight = sourceX + sourceWidth;
        const gapWidth = Math.max(8, targetX - sourceRight);
        updateEdgeData(edge, { channelX: sourceRight + ((index + 1) * gapWidth) / (edgesInGap.length + 1) });
      });
    }

    const longIndex = new Map(longEdges.map((edge, index) => [edge.id, index]));
    for (const edgesAfterLayer of groupEdges((edge) => String(nodePosition.get(edge.source)?.x ?? 0))) {
      const longInGroup = edgesAfterLayer.filter((edge) => longIndex.has(edge.id));
      longInGroup.forEach((edge, index) => {
        const sourceX = nodePosition.get(edge.source)?.x ?? 0;
        const sourceWidth = logicByNodeId.has(edge.source) ? logicNodeWidth(edge.source) : 210;
        const available = Math.max(12, Math.min(56, horizontalGap - sourceWidth - 16));
        updateEdgeData(edge, { sourceExitX: sourceX + sourceWidth + 8 + ((index + 1) * available) / (longInGroup.length + 1) });
      });
    }
    for (const edgesBeforeLayer of groupEdges((edge) => String(nodePosition.get(edge.target)?.x ?? 0))) {
      const longInGroup = edgesBeforeLayer.filter((edge) => longIndex.has(edge.id));
      longInGroup.forEach((edge, index) => {
        const targetX = nodePosition.get(edge.target)?.x ?? 0;
        const available = Math.max(12, Math.min(56, horizontalGap - 226));
        updateEdgeData(edge, { targetEntryX: targetX - available - 8 + ((index + 1) * available) / (longInGroup.length + 1) });
      });
    }
    longEdges.forEach((edge, index) => updateEdgeData(edge, {
      routeY: componentTop - 42 - index * 22,
    }));

    nextComponentY = componentTop + componentHeight;
  }

  return { nodes, edges, familyByNodeId, logicByNodeId };
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
  const [filters, setFilters] = useState<CourseFilters>(emptyFilters);
  const [targetFamilyId, setTargetFamilyId] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [scheduleTerm, setScheduleTerm] = useState(0);
  const [nextCourseResults, setNextCourseResults] = useState<Array<NextCourseRecommendation & { explanation?: string; method?: string }>>([]);
  const [nextCourseLoading, setNextCourseLoading] = useState(false);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchNote, setMapSearchNote] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<CourseFamily[]>([]);
  const [suggestionSource, setSuggestionSource] = useState<"ai" | "catalog">("catalog");
  const normalized = query.trim().toLowerCase();

  const departments = useMemo(() => departmentOptions(catalog), [catalog]);

  const ranked = useMemo(
    () => searchFamilies(families, { query, filters }),
    [families, query, filters],
  );
  const browsing = Boolean(normalized) || activeFilterCount(filters) > 0;
  const suggestions = targetFamilyId || !browsing
    ? []
    : (aiSuggestions.length ? aiSuggestions : ranked.slice(0, 8));

  const target = targetFamilyId
    ? families.find((family) => family.id === targetFamilyId)
    : undefined;

  const scheduledCourseIds = useMemo(
    () => [...new Set(state.plannedCourses.map((course) => localId(course.courseId)))],
    [state.plannedCourses],
  );
  const scheduledCourseIdSet = useMemo(() => new Set(scheduledCourseIds), [scheduledCourseIds]);
  const hiddenMapCourseIdSet = useMemo(
    () => new Set(state.hiddenMapCourseIds),
    [state.hiddenMapCourseIds],
  );
  const plannedMapFamilies = useMemo(() => {
    const byId = new Map<string, CourseFamily>();
    for (const courseId of scheduledCourseIds) {
      if (hiddenMapCourseIdSet.has(courseId)) continue;
      const family = familyByCourseId.get(courseId);
      if (family) byId.set(family.id, family);
    }
    return [...byId.values()];
  }, [scheduledCourseIds, hiddenMapCourseIdSet, familyByCourseId]);
  const graphTargets = useMemo(() => {
    const roots = [...plannedMapFamilies];
    if (target && !roots.some((family) => family.id === target.id)) roots.push(target);
    return roots;
  }, [plannedMapFamilies, target]);
  const hiddenScheduledCourses = useMemo(
    () => scheduledCourseIds
      .filter((courseId) => hiddenMapCourseIdSet.has(courseId))
      .map((courseId) => catalog.find((course) => course.subject_id === courseId))
      .filter((course): course is RemoteCourse => Boolean(course)),
    [scheduledCourseIds, hiddenMapCourseIdSet, catalog],
  );

  const graph = useMemo(
    () => (graphTargets.length
      ? buildPrerequisiteForest(graphTargets, families)
      : null),
    [graphTargets, families],
  );
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    setFlowNodes((current) => {
      if (!graph) return [];
      const currentPositions = new Map(current.map((node) => [node.id, node.position]));
      return graph.nodes.map((node) => ({
        ...node,
        position: currentPositions.get(node.id) ?? node.position,
      }));
    });
  }, [graph, setFlowNodes]);

  const selected =
    selectedFamilyId
      ? families.find((family) => family.id === selectedFamilyId)
      : undefined;
  const plannedTerms = selected ? plannedTermsFor(selected) : [];
  const selectedCourseWebsite = selected ? courseWebsiteFor(selected.primary.subject_id) : undefined;

  function chooseFamily(family: CourseFamily) {
    setQuery(family.label);
    setTargetFamilyId(family.id);
    setSelectedFamilyId(family.id);
    setNextCourseResults([]);
    setAiSuggestions([]);
    setMapSearchNote(null);
  }

  function updateMapSearchQuery(value: string) {
    setQuery(value);
    setMapSearchNote(null);
    setAiSuggestions([]);
    setSuggestionSource("catalog");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!families.length || !normalized) return;

    // A typed subject number always wins, even when the active filters would hide it.
    const exactCourse = catalog.find(
      (course) => course.subject_id.toLowerCase() === normalized,
    );
    const exactFamily = exactCourse
      ? familyByCourseId.get(exactCourse.subject_id)
      : families.find((family) => family.label.toLowerCase() === normalized);

    if (exactFamily) {
      setMapSearchNote(null);
      chooseFamily(exactFamily);
      return;
    }

    setMapSearchLoading(true);
    setMapSearchNote(null);
    setAiSuggestions([]);
    try {
      const recommendations = await requestCourseRecommendations({
        query,
        careerGoal: state.careerGoal,
        catalog,
      });
      const byFamily = new Map<string, CourseFamily>();
      for (const { course } of recommendations) {
        if (!matchesFilters(course, filters)) continue;
        const family = familyByCourseId.get(course.subject_id);
        if (family) byFamily.set(family.id, family);
      }
      const choices = [...byFamily.values()].slice(0, 8);
      if (choices.length) {
        setAiSuggestions(choices);
        setSuggestionSource("ai");
        setMapSearchNote(`AI found ${choices.length} grounded MIT course${choices.length === 1 ? "" : "s"}. Choose the best match.`);
        return;
      }
    } catch {
      setMapSearchNote("AI ranking is unavailable. Using catalog search instead.");
    } finally {
      setMapSearchLoading(false);
    }

    setSuggestionSource("catalog");
    if (!ranked.length) setMapSearchNote("No grounded MIT subjects matched that search.");
  }

  function plannedTermsFor(family: CourseFamily) {
    return state.plannedCourses
      .filter((course) => family.members.some((member) => member.subject_id === localId(course.courseId)))
      .map((course) => termLabel(course.term));
  }

  function setFamilyMapVisibility(family: CourseFamily, visible: boolean) {
    const courseIds = family.members
      .map((member) => member.subject_id)
      .filter((courseId) => scheduledCourseIdSet.has(courseId));
    dispatch({ type: "SET_MAP_COURSE_VISIBILITY", courseIds, visible });
    if (!visible && selectedFamilyId === family.id) setSelectedFamilyId(null);
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
        selected.members.some((member) => member.subject_id === localId(course.courseId)) &&
        course.term === scheduleTerm,
    );
  }

  async function findLogicalNextCourses() {
    if (!selected || !data) return;
    setNextCourseLoading(true);
    setNextCourseResults([]);

    const deterministic = recommendNextCourses({
      current: selected.primary,
      catalog,
      requirements: data.requirements,
      state,
      interests: state.interestQuery,
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
          interests: state.interestQuery,
          careerGoal: state.careerGoal,
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

  useEffect(() => {
    if (!selected || !data) return;
    void findLogicalNextCourses();
  }, [selectedFamilyId, state.interestQuery, state.careerGoal, state.selectedRequirementId]);

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

  if (!graph) {
    return (
      <section className="course-map-home">
        <div className="course-map-home-inner">
          <div className="course-map-release">Course map</div>
          <div className="course-map-wordmark">cedar</div>
          <form className="course-map-search-home" onSubmit={submit}>
            <span className="course-map-search-icon" aria-hidden="true">
              {mapSearchLoading ? <span className="course-map-ai-spinner" /> : "⌕"}
            </span>
            <input
              autoFocus
              aria-label="Search MIT course"
              value={query}
              onChange={(event) => updateMapSearchQuery(event.target.value)}
              placeholder="Search a subject or describe what you want to learn"
              aria-busy={mapSearchLoading}
            />
          </form>
          <CourseFilterMenu
            filters={filters}
            onChange={setFilters}
            departments={departments}
            resultCount={browsing ? ranked.length : undefined}
          />

          <p role="status" aria-live="polite">
            {mapSearchLoading ? "AI is matching your request…" : "Search any MIT subject or interest to explore its prerequisite map."}
          </p>
          {mapSearchNote && <p className="method-note">{mapSearchNote}</p>}

          {hiddenScheduledCourses.length > 0 && (
            <div className="course-map-hidden-courses">
              <span>Hidden scheduled courses</span>
              <div>
                {hiddenScheduledCourses.map((course) => (
                  <button
                    key={course.subject_id}
                    onClick={() => dispatch({ type: "SET_MAP_COURSE_VISIBILITY", courseIds: [course.subject_id], visible: true })}
                  >
                    + {course.subject_id}
                  </button>
                ))}
              </div>
            </div>
          )}

          <CourseSuggestionList
            families={suggestions}
            source={suggestionSource}
            onChoose={chooseFamily}
          />

          {browsing && !suggestions.length && (
            <p className="course-map-empty">No subject matches that search with these filters.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="course-map-shell">
      <div className="course-map-floating-search">
        <form onSubmit={submit}>
          <input
            aria-label="Search another MIT course"
            aria-busy={mapSearchLoading}
            value={query}
            onChange={(event) => updateMapSearchQuery(event.target.value)}
            onFocus={() => setTargetFamilyId(null)}
            placeholder="Search a class"
          />
          <button type="submit" aria-label="Search" disabled={mapSearchLoading}>
            {mapSearchLoading ? <span className="course-map-ai-spinner" aria-hidden="true" /> : "⌕"}
          </button>
        </form>
        {mapSearchLoading && <p className="course-map-floating-status" role="status">AI is matching…</p>}
        {!mapSearchLoading && mapSearchNote && <p className="course-map-floating-status">{mapSearchNote}</p>}
        <CourseSuggestionList
          families={suggestions}
          source={suggestionSource}
          onChoose={chooseFamily}
          compact
        />
      </div>

      <div className="course-map-canvas">
        <ReactFlow
          key={graphTargets.map((family) => family.id).join("|")}
          nodes={flowNodes}
          edges={graph.edges}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable
          nodesConnectable={false}
          onNodesChange={onNodesChange}
          panOnDrag
          panOnScroll
          panOnScrollSpeed={1}
          zoomOnScroll
          zoomOnPinch
          minZoom={0.08}
          maxZoom={2.2}
          onNodeClick={(event, node) => {
            const optionElement = (event.target as HTMLElement).closest<HTMLElement>("[data-family-id]");
            const optionFamilyId = optionElement?.dataset.familyId;
            if (optionFamilyId) {
              setSelectedFamilyId(optionFamilyId);
              return;
            }
            setSelectedFamilyId(graph.familyByNodeId.get(node.id)?.id ?? null);
          }}
        >
          <Background gap={28} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      </div>

      {(plannedMapFamilies.length > 0 || hiddenScheduledCourses.length > 0) && (
        <div className="course-map-pinned-tray">
          <strong>Scheduled on map</strong>
          <div>
            {plannedMapFamilies.map((family) => (
              <span className="course-map-pinned-course" key={family.id}>
                <button onClick={() => setSelectedFamilyId(family.id)}>{family.label}</button>
                <button onClick={() => setFamilyMapVisibility(family, false)} aria-label={`Hide ${family.label} from map`}>×</button>
              </span>
            ))}
            {hiddenScheduledCourses.map((course) => (
              <button
                className="course-map-restore-course"
                key={course.subject_id}
                onClick={() => dispatch({ type: "SET_MAP_COURSE_VISIBILITY", courseIds: [course.subject_id], visible: true })}
              >
                + {course.subject_id}
              </button>
            ))}
          </div>
        </div>
      )}

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
            <p className="course-next-context">
              {state.interestQuery || state.careerGoal
                ? "Personalized with your Discover interests, career goal, and academic plan."
                : <>Based on this subject and your academic plan. Add interests on <Link to="/discover">Discover</Link> for more personalization.</>}
            </p>
            <button
              className="secondary-button course-next-find"
              onClick={findLogicalNextCourses}
              disabled={nextCourseLoading}
            >
              {nextCourseLoading ? "Finding logical next courses…" : "Refresh AI recommendations"}
            </button>

            {nextCourseResults.length > 0 && (
              <div className="course-next-results">
                {nextCourseResults.map((recommendation) => {
                  const alreadyPlanned = state.plannedCourses.some(
                    (planned) => localId(planned.courseId) === recommendation.course.subject_id && planned.term === scheduleTerm,
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
                      {courseWebsiteFor(recommendation.course.subject_id) && (
                        <a
                          className="course-next-website"
                          href={courseWebsiteFor(recommendation.course.subject_id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Course website ↗
                        </a>
                      )}
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
                cedar displays these as one course family in the map. Individual catalog
                versions can still differ in units, offering terms, or exact prerequisite wording.
              </p>
            </div>
          )}

          <div className="course-map-plan-actions">
            <Link to={"/course/" + encodeURIComponent("mit:" + selected.primary.subject_id)}>
              Open progression →
            </Link>
          </div>

          {plannedTerms.length > 0 && (
            <>
              <p className="data-note">Already in your plan: {plannedTerms.join(", ")}</p>
              <button className="secondary-button" onClick={() => setFamilyMapVisibility(selected, false)}>
                Hide scheduled course from map
              </button>
            </>
          )}

          <div className="course-map-external-links">
            {selectedCourseWebsite && (
              <a href={selectedCourseWebsite} target="_blank" rel="noreferrer">
                Open course website ↗
              </a>
            )}

            {selected.primary.url && (
              <a href={selected.primary.url} target="_blank" rel="noreferrer">
                Open official catalog ↗
              </a>
            )}
          </div>
        </aside>
      )}

      <div className="course-map-legend">
        <strong>{graphTargets.length} selected course{graphTargets.length === 1 ? "" : "s"}</strong>
        <span>{graph.familyByNodeId.size} course families in prerequisite map</span>
      </div>
    </section>
  );
}
