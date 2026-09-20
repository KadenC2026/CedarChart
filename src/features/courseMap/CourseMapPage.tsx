import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ELK from "elkjs/lib/elk.bundled.js";
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
import { plannerTerms, termColorClass, termLabel } from "../../domain/terms";
import { requestCourseRecommendations } from "../../domain/aiCourseSearch";
import CourseFilterMenu from "../../components/CourseFilterMenu";

type GraphData = {
  nodes: Node[];
  edges: Edge[];
  familyByNodeId: Map<string, CourseFamily>;
  logicByNodeId: Map<string, LogicNodeData>;
  replacementPositionSourceByNodeId: Map<string, string>;
};

type LogicNodeData = {
  kind: "all" | "any";
  optionFamilies: CourseFamily[];
};

type RoutedEdgeData = {
  elkPoints?: Array<{ x: number; y: number }>;
  channelRatio?: number;
  routeLaneOffset?: number;
  routeSide?: "above" | "below";
  sourceExitDistance?: number;
  sourceOffset?: number;
  targetEntryDistance?: number;
  targetOffset?: number;
};

type RoutedEdge = Edge<RoutedEdgeData, "routed">;

const elk = new ELK();

function graphNodeSize(node: Node, logic?: LogicNodeData) {
  if (node.id.startsWith("logic:")) {
    return logic?.kind === "any"
      ? { width: 260, height: 56 + Math.ceil(Math.max(1, logic.optionFamilies.length) / 2) * 54 }
      : { width: 44, height: 92 };
  }
  return { width: 210, height: 82 };
}

export async function layoutGraphWithElk(graph: GraphData) {
  const layout = await elk.layout({
    id: "cedar-course-map",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "58",
      "elk.spacing.edgeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "130",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "PREFER_NODES",
    },
    children: graph.nodes.map((node) => {
      const { width, height } = graphNodeSize(node, graph.logicByNodeId.get(node.id));
      return {
        id: node.id,
        width,
        height,
        layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
        ports: [
          { id: `${node.id}:in`, layoutOptions: { "elk.port.side": "WEST" } },
          { id: `${node.id}:out`, layoutOptions: { "elk.port.side": "EAST" } },
        ],
      };
    }),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [`${edge.source}:out`],
      targets: [`${edge.target}:in`],
    })),
  });
  const positioned = new Map((layout.children ?? []).map((node) => [node.id, node]));
  const routed = new Map<string, { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: Array<{ x: number; y: number }> } | undefined>(
    (layout.edges ?? []).map((edge) => {
      const sections = (edge as { sections?: Array<{ startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: Array<{ x: number; y: number }> }> }).sections;
      return [edge.id, sections?.[0]];
    }),
  );
  return {
    nodes: graph.nodes.map((node) => {
      const position = positioned.get(node.id);
      return position?.x == null || position.y == null
        ? node
        : { ...node, position: { x: position.x, y: position.y } };
    }),
    edges: graph.edges.map((edge) => {
      const section = routed.get(edge.id);
      const elkPoints = section
        ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
        : undefined;
      return {
        ...edge,
        type: "routed",
        data: { ...(edge.data ?? {}), ...(elkPoints ? { elkPoints } : {}) },
      };
    }),
  };
}

function orderLayersToReduceCrossings(
  layers: Map<number, string[]>,
  edges: Edge[],
  labelFor: (id: string) => string,
  termFor: (id: string) => number | undefined,
) {
  const orderedLayers = [...layers.entries()].sort(([a], [b]) => a - b);
  for (const [, ids] of orderedLayers) ids.sort((a, b) => labelFor(a).localeCompare(labelFor(b), undefined, { numeric: true }));

  const orderByNeighbors = (layerIndex: number, direction: -1 | 1) => {
    const [, ids] = orderedLayers[layerIndex];
    const reference = new Map<string, number>();
    for (let index = layerIndex + direction; index >= 0 && index < orderedLayers.length; index += direction) {
      const [, referenceIds] = orderedLayers[index];
      referenceIds.forEach((id, position) => reference.set(id, position));
    }
    const currentIndex = new Map(ids.map((id, index) => [id, index]));
    ids.sort((a, b) => {
      const neighborPositions = (id: string) => edges
        .flatMap((edge) => edge.source === id ? [edge.target] : edge.target === id ? [edge.source] : [])
        .flatMap((neighbor) => reference.has(neighbor) ? [reference.get(neighbor)!] : []);
      const average = (values: number[], fallback: number) =>
        values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
      const aPositions = neighborPositions(a);
      const bPositions = neighborPositions(b);
      const difference = average(aPositions, currentIndex.get(a) ?? 0) - average(bPositions, currentIndex.get(b) ?? 0);
      if (difference) return difference;
      // Preserve a useful ordering from the opposite sweep when both branches
      // meet the same neighbor; alphabetical tie-breaking would reintroduce a crossing.
      if (aPositions.length && bPositions.length) return 0;
      return labelFor(a).localeCompare(labelFor(b), undefined, { numeric: true });
    });
  };

  // Alternating barycentric sweeps preserve deterministic ordering while placing
  // connected branches beside one another, removing avoidable arrow crossings.
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 1; index < orderedLayers.length; index += 1) orderByNeighbors(index, -1);
    for (let index = orderedLayers.length - 2; index >= 0; index -= 1) orderByNeighbors(index, 1);
  }

  const weightedCost = () => {
    const positions = new Map<string, { layer: number; position: number }>();
    orderedLayers.forEach(([, ids], layer) => ids.forEach((id, position) => positions.set(id, { layer, position })));
    let crossings = 0;
    let verticalTravel = 0;
    for (let left = 0; left < edges.length; left += 1) {
      const a = edges[left];
      const aSource = positions.get(a.source);
      const aTarget = positions.get(a.target);
      if (!aSource || !aTarget) continue;
      verticalTravel += Math.abs(aSource.position - aTarget.position);
      for (let right = left + 1; right < edges.length; right += 1) {
        const b = edges[right];
        const bSource = positions.get(b.source);
        const bTarget = positions.get(b.target);
        if (!bSource || !bTarget || aSource.layer !== bSource.layer || aTarget.layer !== bTarget.layer) continue;
        if ((aSource.position - bSource.position) * (aTarget.position - bTarget.position) < 0) crossings += 1;
      }
    }
    const termPositions = new Map<number, number[]>();
    for (const [id, position] of positions) {
      const term = termFor(id);
      if (term != null) termPositions.set(term, [...(termPositions.get(term) ?? []), position.position]);
    }
    const termMisalignment = [...termPositions.values()].reduce((total, positionsForTerm) => {
      if (positionsForTerm.length < 2) return total;
      const mean = positionsForTerm.reduce((sum, position) => sum + position, 0) / positionsForTerm.length;
      return total + positionsForTerm.reduce((sum, position) => sum + Math.abs(position - mean), 0);
    }, 0);
    // Crossings dominate; shorter vertical runs and shared term rows are soft constraints.
    return crossings * 10_000 + verticalTravel * 8 + termMisalignment * 2;
  };

  // Local adjacent swaps are a compact deterministic approximation of the
  // weighted crossing/length/alignment objective used by the Tidy Map action.
  for (let pass = 0; pass < 5; pass += 1) {
    let improved = false;
    for (const [, ids] of orderedLayers) {
      for (let index = 0; index < ids.length - 1; index += 1) {
        const before = weightedCost();
        [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
        const after = weightedCost();
        if (after < before) {
          improved = true;
        } else {
          [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
        }
      }
    }
    if (!improved) break;
  }
}

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
  if (data?.elkPoints?.length) {
    return <BaseEdge id={id} path={roundedPath(data.elkPoints)} markerEnd={markerEnd} style={style} />;
  }
  const routedSourceY = sourceY + (data?.sourceOffset ?? 0);
  const routedTargetY = targetY + (data?.targetOffset ?? 0);
  const direction = Math.sign(targetX - sourceX) || 1;
  const horizontalDistance = Math.abs(targetX - sourceX);
  const elbowClearance = Math.min(98, Math.max(42, horizontalDistance * 0.23));
  const channelStart = sourceX + direction * elbowClearance;
  const channelEnd = targetX - direction * elbowClearance;
  const channelX = channelStart + (channelEnd - channelStart) * (data?.channelRatio ?? 0.5);
  const sourceExitX = sourceX + direction * Math.min(data?.sourceExitDistance ?? 58, horizontalDistance * 0.35);
  const targetEntryX = targetX - direction * Math.min(data?.targetEntryDistance ?? 58, horizontalDistance * 0.35);
  const routeY = data?.routeSide === "below"
    ? Math.max(routedSourceY, routedTargetY) + (data?.routeLaneOffset ?? 0)
    : Math.min(routedSourceY, routedTargetY) - (data?.routeLaneOffset ?? 0);
  const points = data?.routeLaneOffset == null
    ? [
        { x: sourceX, y: routedSourceY },
        { x: channelX, y: routedSourceY },
        { x: channelX, y: routedTargetY },
        { x: targetX, y: routedTargetY },
      ]
    : [
        { x: sourceX, y: routedSourceY },
        { x: sourceExitX, y: routedSourceY },
        { x: sourceExitX, y: routeY },
        { x: targetEntryX, y: routeY },
        { x: targetEntryX, y: routedTargetY },
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
  const replacementPositionSourceByNodeId = new Map<string, string>();
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
      if (allOptions.length <= 1) {
        const family = allOptions[0];
        if (family && family.id !== edgeTarget) {
          discover(family);
          addEdge(family.id, edgeTarget, !logicByNodeId.has(edgeTarget));
        }
        return;
      }

      const logicId = `logic:${edgeTarget}:${path}:${expression.type}`;
      const selectedOptions = allOptions.filter((family) => selectedFamilyIds.has(family.id));
      if (selectedOptions.length > 0) {
        selectedOptions.forEach((family) => {
          discover(family);
          replacementPositionSourceByNodeId.set(family.id, logicId);
          addEdge(family.id, edgeTarget, !logicByNodeId.has(edgeTarget));
        });
        return;
      }

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
    replacementPositionSourceByNodeId,
  };
}

export function buildPrerequisiteForest(
  targets: CourseFamily[],
  families: CourseFamily[],
  plannedTermByFamilyId = new Map<string, number>(),
  creditLabelByFamilyId = new Map<string, string>(),
): GraphData {
  const familyByNodeId = new Map<string, CourseFamily>();
  const logicByNodeId = new Map<string, LogicNodeData>();
  const replacementPositionSourceByNodeId = new Map<string, string>();
  const edgeById = new Map<string, Edge>();
  const targetIds = new Set(targets.map((target) => target.id));

  // Merge overlapping trees by their real family IDs. A selected prerequisite and
  // its selected dependent therefore remain one connected graph instead of becoming
  // duplicate nodes in separate trees.
  for (const target of targets) {
    const tree = buildPrerequisiteGraph(target, families, targetIds);
    for (const [id, family] of tree.familyByNodeId) familyByNodeId.set(id, family);
    for (const [id, logic] of tree.logicByNodeId) logicByNodeId.set(id, logic);
    for (const [id, sourceId] of tree.replacementPositionSourceByNodeId) {
      replacementPositionSourceByNodeId.set(id, sourceId);
    }
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
    orderLayersToReduceCrossings(
      layers,
      componentEdges,
      (id) => familyByNodeId.get(id)?.label ?? logicByNodeId.get(id)?.kind ?? id,
      (id) => plannedTermByFamilyId.get(id),
    );

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
    const termOccurrences = new Map<number, number>();
    for (const id of component) {
      const term = familyByNodeId.get(id) ? plannedTermByFamilyId.get(id) : undefined;
      if (term != null) termOccurrences.set(term, (termOccurrences.get(term) ?? 0) + 1);
    }
    const alignedTerms = [...termOccurrences]
      .filter(([, count]) => count > 1)
      .map(([term]) => term)
      .sort((a, b) => a - b);
    const termLaneY = new Map(alignedTerms.map((term, index) => [
      term,
      componentTop + ((index + 1) * componentHeight) / (alignedTerms.length + 1) - 41,
    ]));

    for (const [layer, layerIds] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
      const currentLayerHeight = layerHeight(layerIds);
      let currentY = componentTop + (componentHeight - currentLayerHeight) / 2;
      layerIds.forEach((id, index) => {
        const family = familyByNodeId.get(id);
        const logic = logicByNodeId.get(id);
        const plannedTerm = family ? plannedTermByFamilyId.get(family.id) : undefined;
        const creditLabel = family ? creditLabelByFamilyId.get(family.id) : undefined;
        // Course cards keep their dependency rank but are gently staggered so the
        // graph reads as a connected map rather than a rigid spreadsheet grid.
        const horizontalStagger = family ? ((index % 3) - 1) * 30 : 0;
        const defaultY = currentY;
        const laneY = plannedTerm == null ? undefined : termLaneY.get(plannedTerm);
        // A shared term lane gives students a visual row for related planned
        // subjects without overriding the dependency ordering that keeps arrows readable.
        const y = laneY == null ? defaultY : defaultY + (laneY - defaultY) * 0.45;
        const position = { x: layer + horizontalStagger, y };
        currentY = Math.max(defaultY + estimatedNodeHeight(id) + verticalNodeGap, y + estimatedNodeHeight(id) + verticalNodeGap);
        nodePosition.set(id, position);
        nodes.push({
          id,
          position,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          className: family
            ? "course-map-node" +
              (plannedTerm == null ? "" : ` course-map-scheduled ${termColorClass(plannedTerm)}`) +
              (plannedTerm == null && creditLabel ? " course-map-credited" : "") +
              (targetIds.has(id) ? " course-map-target" : "")
            : `course-map-logic-node course-map-logic-${logic?.kind ?? "all"}`,
          data: {
            label: family ? (
              <div className="course-map-node-content">
                <strong>{family.label}</strong>
                <span>{family.title}</span>
                {plannedTerm != null && <small className="course-map-planned-term">Scheduled · {termLabel(plannedTerm)}</small>}
                {plannedTerm == null && creditLabel && <small className="course-map-credit-status">{creditLabel}</small>}
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

    const nodeWidth = (id: string) => {
      const logic = logicByNodeId.get(id);
      return logic?.kind === "any" ? 260 : logic ? 44 : 210;
    };
    const nodeCenterY = (id: string) => {
      const position = nodePosition.get(id);
      return (position?.y ?? 0) + estimatedNodeHeight(id) / 2;
    };
    // Term lanes and compact logic nodes can bring neighboring columns close
    // together. Resolve those rectangle collisions before calculating ports.
    for (let pass = 0; pass < 12; pass += 1) {
      let moved = false;
      const idsByPosition = [...nodePosition.keys()].sort((a, b) =>
        (nodePosition.get(a)?.x ?? 0) - (nodePosition.get(b)?.x ?? 0) ||
        (nodePosition.get(a)?.y ?? 0) - (nodePosition.get(b)?.y ?? 0),
      );
      for (let left = 0; left < idsByPosition.length; left += 1) {
        for (let right = left + 1; right < idsByPosition.length; right += 1) {
          const a = idsByPosition[left];
          const b = idsByPosition[right];
          const aPosition = nodePosition.get(a)!;
          const bPosition = nodePosition.get(b)!;
          const horizontalOverlap = Math.min(aPosition.x + nodeWidth(a), bPosition.x + nodeWidth(b)) - Math.max(aPosition.x, bPosition.x);
          const verticalOverlap = Math.min(aPosition.y + estimatedNodeHeight(a), bPosition.y + estimatedNodeHeight(b)) - Math.max(aPosition.y, bPosition.y);
          if (horizontalOverlap <= 0 || verticalOverlap <= 0) continue;
          const moveId = aPosition.x === bPosition.x
            ? (aPosition.y <= bPosition.y ? b : a)
            : (aPosition.x < bPosition.x ? b : a);
          nodePosition.get(moveId)!.y += verticalOverlap + 18;
          moved = true;
        }
      }
      if (!moved) break;
    }

    const actualComponentBottom = Math.max(
      ...[...nodePosition.entries()].map(([id, position]) => position.y + estimatedNodeHeight(id)),
      componentTop + componentHeight,
    );
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
      const step = Math.min(16, 48 / (count - 1));
      return (index - (count - 1) / 2) * step;
    };

    for (const edgesFromSource of groupEdges((edge) => edge.source)) {
      const ordered = [...edgesFromSource].sort((a, b) =>
        nodeCenterY(a.target) - nodeCenterY(b.target) || a.id.localeCompare(b.id),
      );
      ordered.forEach((edge, index) => updateEdgeData(edge, {
        sourceOffset: portOffset(index, ordered.length),
      }));
    }
    for (const edgesToTarget of groupEdges((edge) => edge.target)) {
      const ordered = [...edgesToTarget].sort((a, b) =>
        nodeCenterY(a.source) - nodeCenterY(b.source) || a.id.localeCompare(b.id),
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
      const ordered = [...edgesInGap].sort((a, b) =>
        (nodeCenterY(a.source) + nodeCenterY(a.target)) - (nodeCenterY(b.source) + nodeCenterY(b.target)) ||
        a.id.localeCompare(b.id),
      );
      ordered.forEach((edge, index) => {
        updateEdgeData(edge, {
          channelRatio: (index + 1) / (edgesInGap.length + 1),
        });
      });
    }

    const longIndex = new Map(longEdges.map((edge, index) => [edge.id, index]));
    for (const edgesAfterLayer of groupEdges((edge) => String(nodePosition.get(edge.source)?.x ?? 0))) {
      const longInGroup = edgesAfterLayer.filter((edge) => longIndex.has(edge.id));
      longInGroup.forEach((edge, index) => {
        updateEdgeData(edge, {
          sourceExitDistance: 48 + ((index + 1) * 34) / (longInGroup.length + 1),
        });
      });
    }
    for (const edgesBeforeLayer of groupEdges((edge) => String(nodePosition.get(edge.target)?.x ?? 0))) {
      const longInGroup = edgesBeforeLayer.filter((edge) => longIndex.has(edge.id));
      longInGroup.forEach((edge, index) => {
        updateEdgeData(edge, {
          targetEntryDistance: 48 + ((index + 1) * 34) / (longInGroup.length + 1),
        });
      });
    }
    const laneCounts = { above: 0, below: 0 };
    for (const edge of longEdges) {
      const sourceY = nodePosition.get(edge.source)?.y ?? componentTop;
      const targetY = nodePosition.get(edge.target)?.y ?? componentTop;
      const laneOffset = (side: "above" | "below") => 54 + laneCounts[side] * 24;
      const travel = (side: "above" | "below") => {
        const laneY = side === "above"
          ? componentTop - laneOffset(side)
          : actualComponentBottom + laneOffset(side);
        return Math.abs(sourceY - laneY) + Math.abs(targetY - laneY) + laneCounts[side] * 18;
      };
      const routeSide = travel("above") <= travel("below") ? "above" : "below";
      updateEdgeData(edge, { routeSide, routeLaneOffset: laneOffset(routeSide) });
      laneCounts[routeSide] += 1;
    }

    nextComponentY = actualComponentBottom;
  }

  return { nodes, edges, familyByNodeId, logicByNodeId, replacementPositionSourceByNodeId };
}

export function reconcileGraphNodes(
  graph: GraphData,
  current: Node[],
  draggedPositions: ReadonlyMap<string, { x: number; y: number }>,
) {
  const currentPositions = new Map(current.map((node) => [node.id, node.position]));
  return graph.nodes.map((node) => {
    const replacementSourceId = graph.replacementPositionSourceByNodeId.get(node.id);
    return {
      ...node,
      position:
        draggedPositions.get(node.id) ??
        (replacementSourceId ? currentPositions.get(replacementSourceId) : undefined) ??
        node.position,
    };
  });
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
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [elkEdges, setElkEdges] = useState<Edge[] | null>(null);
  const [tidyLoading, setTidyLoading] = useState(false);
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
  const creditedCourseIds = useMemo(
    () => [...new Set(state.priorCredits.map((credit) => localId(credit.courseId)))],
    [state.priorCredits],
  );
  const mappedCourseIdSet = useMemo(
    () => new Set([...scheduledCourseIds, ...creditedCourseIds]),
    [scheduledCourseIds, creditedCourseIds],
  );
  const plannedTermByFamilyId = useMemo(() => {
    const termsByFamily = new Map<string, number>();
    for (const plannedCourse of state.plannedCourses) {
      const family = familyByCourseId.get(localId(plannedCourse.courseId));
      if (!family) continue;
      const existing = termsByFamily.get(family.id);
      if (existing == null || plannedCourse.term < existing) termsByFamily.set(family.id, plannedCourse.term);
    }
    return termsByFamily;
  }, [state.plannedCourses, familyByCourseId]);
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
  const creditLabelByFamilyId = useMemo(() => {
    const labels = new Map<string, string>();
    for (const credit of state.priorCredits) {
      const family = familyByCourseId.get(localId(credit.courseId));
      if (!family) continue;
      const label = credit.source === "ase" ? "Passed ASE · prerequisite satisfied" : "Prior credit · prerequisite satisfied";
      if (credit.source === "ase" || !labels.has(family.id)) labels.set(family.id, label);
    }
    return labels;
  }, [state.priorCredits, familyByCourseId]);
  const creditedMapFamilies = useMemo(() => {
    const byId = new Map<string, CourseFamily>();
    for (const courseId of creditedCourseIds) {
      if (hiddenMapCourseIdSet.has(courseId)) continue;
      const family = familyByCourseId.get(courseId);
      if (family) byId.set(family.id, family);
    }
    return [...byId.values()];
  }, [creditedCourseIds, hiddenMapCourseIdSet, familyByCourseId]);
  const graphTargets = useMemo(() => {
    const roots = [...plannedMapFamilies];
    for (const family of creditedMapFamilies) {
      if (!roots.some((root) => root.id === family.id)) roots.push(family);
    }
    if (target && !roots.some((family) => family.id === target.id)) roots.push(target);
    return roots;
  }, [plannedMapFamilies, creditedMapFamilies, target]);
  const hiddenMappedCourses = useMemo(
    () => [...mappedCourseIdSet]
      .filter((courseId) => hiddenMapCourseIdSet.has(courseId))
      .map((courseId) => catalog.find((course) => course.subject_id === courseId))
      .filter((course): course is RemoteCourse => Boolean(course)),
    [mappedCourseIdSet, hiddenMapCourseIdSet, catalog],
  );

  const graph = useMemo(
    () => (graphTargets.length
      ? buildPrerequisiteForest(graphTargets, families, plannedTermByFamilyId, creditLabelByFamilyId)
      : null),
    [graphTargets, families, plannedTermByFamilyId, creditLabelByFamilyId],
  );
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const draggedPositionsRef = useRef(new Map<string, { x: number; y: number }>());

  useEffect(() => {
    setFlowNodes((current) => {
      if (!graph) return [];
      return reconcileGraphNodes(graph, current, draggedPositionsRef.current);
    });
    setElkEdges(null);
  }, [graph, setFlowNodes]);

  const selected =
    selectedFamilyId
      ? families.find((family) => family.id === selectedFamilyId)
      : undefined;
  const plannedTerms = selected ? plannedTermsFor(selected) : [];
  const selectedCreditLabel = selected ? creditLabelByFamilyId.get(selected.id) : undefined;
  const selectedCourseWebsite = selected ? courseWebsiteFor(selected.primary.subject_id) : undefined;

  useEffect(() => {
    if (!selected) {
      setSelectedVariantId(null);
      return;
    }
    const plannedVariant = state.plannedCourses.find(
      (course) => course.term === scheduleTerm && selected.members.some((member) => member.subject_id === localId(course.courseId)),
    );
    setSelectedVariantId(localId(plannedVariant?.courseId ?? selected.primary.subject_id));
  }, [selectedFamilyId, scheduleTerm, selected, state.plannedCourses]);

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
      .filter((courseId) => mappedCourseIdSet.has(courseId));
    dispatch({ type: "SET_MAP_COURSE_VISIBILITY", courseIds, visible });
    if (!visible && selectedFamilyId === family.id) setSelectedFamilyId(null);
  }

  function toggleSelectedSchedule() {
    if (!selected) return;
    const scheduledMatches = state.plannedCourses.filter(
      (planned) =>
        selected.members.some((member) => member.subject_id === localId(planned.courseId)) &&
        planned.term === scheduleTerm,
    );
    if (scheduledMatches.length) {
      scheduledMatches.forEach((planned) => dispatch({
        type: "REMOVE_PLANNED_COURSE",
        courseId: planned.courseId,
        term: planned.term,
      }));
      return;
    }
    const course = selected.members.find((member) => member.subject_id === selectedVariantId) ?? selected.primary;
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

  function chooseSelectedVariant(courseId: string) {
    if (!selected) return;
    setSelectedVariantId(courseId);
    const replacement = selected.members.find((member) => member.subject_id === courseId);
    const planned = state.plannedCourses.find(
      (course) => course.term === scheduleTerm && selected.members.some((member) => member.subject_id === localId(course.courseId)),
    );
    if (!replacement || !planned) return;
    dispatch({
      type: "REPLACE_PLANNED_COURSE",
      courseId: planned.courseId,
      term: scheduleTerm,
      replacement: {
        courseId: replacement.subject_id,
        title: replacement.title,
        units: replacement.total_units,
        term: scheduleTerm,
      },
    });
  }

  async function tidyMap() {
    if (!graph || tidyLoading) return;
    draggedPositionsRef.current.clear();
    setTidyLoading(true);
    try {
      const layout = await layoutGraphWithElk(graph);
      setFlowNodes(layout.nodes);
      setElkEdges(layout.edges);
    } finally {
      setTidyLoading(false);
    }
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

  function toggleRecommendationSchedule(course: RemoteCourse) {
    const planned = state.plannedCourses.find(
      (item) => localId(item.courseId) === course.subject_id && item.term === scheduleTerm,
    );
    if (planned) {
      dispatch({ type: "REMOVE_PLANNED_COURSE", courseId: planned.courseId, term: planned.term });
      return;
    }
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

          {hiddenMappedCourses.length > 0 && (
            <div className="course-map-hidden-courses">
              <span>Hidden satisfied courses</span>
              <div>
                {hiddenMappedCourses.map((course) => (
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
        <button className="course-map-tidy-button" type="button" onClick={tidyMap} disabled={tidyLoading}>
          {tidyLoading ? "Tidying map…" : "✦ Tidy map"}
        </button>
      </div>

      <div className="course-map-canvas">
        <ReactFlow
          key={graphTargets.map((family) => family.id).join("|")}
          nodes={flowNodes}
          edges={elkEdges ?? graph.edges}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable
          nodesConnectable={false}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, node) => draggedPositionsRef.current.set(node.id, node.position)}
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

      {(plannedMapFamilies.length > 0 || creditedMapFamilies.length > 0 || hiddenMappedCourses.length > 0) && (
        <div className="course-map-pinned-tray">
          <strong>Satisfied on map</strong>
          <div>
            {plannedMapFamilies.map((family) => (
              <span className="course-map-pinned-course" key={family.id}>
                <button onClick={() => setSelectedFamilyId(family.id)}>{family.label}</button>
                <button onClick={() => setFamilyMapVisibility(family, false)} aria-label={`Hide ${family.label} from map`}>×</button>
              </span>
            ))}
            {creditedMapFamilies
              .filter((family) => !plannedMapFamilies.some((planned) => planned.id === family.id))
              .map((family) => (
                <span className="course-map-pinned-course course-map-pinned-credit" key={family.id}>
                  <button onClick={() => setSelectedFamilyId(family.id)}>{family.label} · credit</button>
                  <button onClick={() => setFamilyMapVisibility(family, false)} aria-label={`Hide ${family.label} from map`}>×</button>
                </span>
              ))}
            {hiddenMappedCourses.map((course) => (
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
              <label htmlFor="course-map-variant">Course option</label>
              <select
                id="course-map-variant"
                aria-label={`Choose replacement for ${selected.label}`}
                value={selectedVariantId ?? selected.primary.subject_id}
                onChange={(event) => chooseSelectedVariant(event.target.value)}
              >
                {selected.members.map((course) => (
                  <option value={course.subject_id} key={course.subject_id}>
                    {course.subject_id} · {course.title}
                  </option>
                ))}
              </select>
              <small>Changing this replaces the scheduled option for this term.</small>
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
                className={`primary-button${isSelectedScheduled() ? " remove-button" : ""}`}
                onClick={toggleSelectedSchedule}
              >
                {isSelectedScheduled() ? "Remove" : "+ Add"}
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
                        className={`text-button${alreadyPlanned ? " remove-button" : ""}`}
                        onClick={() => toggleRecommendationSchedule(recommendation.course)}
                      >
                        {alreadyPlanned ? "Remove from selected term" : "+ Add to selected term"}
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

          {(plannedTerms.length > 0 || selectedCreditLabel) && (
            <>
              {plannedTerms.length > 0 && <p className="data-note">Already in your plan: {plannedTerms.join(", ")}</p>}
              {selectedCreditLabel && <p className="data-note">{selectedCreditLabel}</p>}
              <button className="secondary-button" onClick={() => setFamilyMapVisibility(selected, false)}>
                Hide satisfied course from map
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
        {plannedTermByFamilyId.size > 0 && <span>Scheduled course colors match your plan term</span>}
        {creditLabelByFamilyId.size > 0 && <span>Prior-credit courses count as satisfied prerequisites</span>}
      </div>
    </section>
  );
}
